import path from 'node:path';

import { isHiddenSystemEntry, type FileEntry, type SearchProviderName } from '@hearth/shared';

import { EverythingClient } from '../../adapters/everything/client.js';
import { mapFor, toLocal, toRemote, type PathMap } from '../../adapters/everything/path-map.js';
import {
  buildSearchExpression,
  everythingSortField,
  quoteTerm,
} from '../../adapters/everything/query.js';
import type { EverythingResult } from '../../adapters/everything/parse.js';
import type { EverythingSource } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { HearthError } from '../../lib/errors.js';
import { sortEntries } from '../../lib/listing.js';
import { DIRECTORY_MIME, extensionsForMediaKind, mimeForPath } from '../../lib/mime.js';
import { containedIn, type Vault } from '../../lib/vault.js';
import type { ProviderHealth, SearchPage, SearchProvider, SearchQuery } from './provider.js';

export interface CoverageProbe extends ProviderHealth {
  /** Whether this Everything has indexed the folder: a reachable one may simply not know it. */
  covered: boolean;
}

/**
 * One Everything server. Filtering, sorting and pagination are pushed down to it
 * so totals stay exact.
 */
export class EverythingProvider implements SearchProvider {
  readonly name: SearchProviderName = 'everything';
  private readonly client: EverythingClient;

  constructor(
    readonly source: EverythingSource,
    private readonly runtime: RuntimeState,
    private readonly vault: Vault,
  ) {
    this.client = new EverythingClient({
      url: source.url,
      username: source.username,
      password: source.password,
      timeoutMs: () => runtime.get('everythingTimeoutMs'),
    });
  }

  /**
   * How specifically this server answers for `directory`: the length of the
   * mapped folder holding it, 0 for this machine's (which answers for
   * anything), or -1 when it is on another machine and maps no folder there.
   */
  specificity(directory: string): number {
    if (this.source.maps === null) return 0;
    return mapFor(this.source.maps, directory)?.local.length ?? -1;
  }

  /**
   * The folder whose indexing tells whether a search in `directory` can be
   * answered here: the root, or the mapped folder when that lies deeper.
   */
  probeDirectory(directory: string, rootPath: string): string {
    const local = this.source.maps && mapFor(this.source.maps, directory)?.local;
    return local && containedIn(local, rootPath) && local.length > rootPath.length
      ? local
      : rootPath;
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const { latencyMs } = await this.client.probe(signal);
      return { reachable: true, latencyMs, version: null, note: null };
    } catch (error) {
      return unreachable(error);
    }
  }

  /** One-result query for anything under `directory`. */
  async coverage(directory: string, signal?: AbortSignal): Promise<CoverageProbe> {
    const startedAt = Date.now();
    try {
      const remote = this.remoteOf(directory);
      const response = await this.client.search(
        {
          // The separator keeps `D:\Media2` from passing for `D:\Media`.
          expression: `path:${quoteTerm(remote.endsWith('\\') ? remote : `${remote}\\`)}`,
          offset: 0,
          count: 1,
          sort: 'name',
          ascending: true,
        },
        signal,
      );
      const covered = response.total > 0;
      return {
        reachable: true,
        covered,
        latencyMs: Date.now() - startedAt,
        version: null,
        note: covered ? null : `Everything at ${this.source.url} has not indexed ${remote}`,
      };
    } catch (error) {
      return { ...unreachable(error), covered: false };
    }
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchPage> {
    const scopeDirectory = this.vault.resolve(query.scope);
    const limit = query.limit;
    const index = Math.max(1, query.page) - 1;

    const expression = buildSearchExpression({
      scopeDirectory: this.remoteOf(scopeDirectory),
      text: query.text,
      extensions: query.type ? [...extensionsForMediaKind(query.type)] : undefined,
    });

    const response = await this.client.search(
      {
        expression,
        offset: Number.isFinite(limit) ? index * limit : 0,
        count: Math.min(limit, this.runtime.get('searchMaxResults')),
        sort: everythingSortField(query.sort.field),
        ascending: query.sort.direction === 'asc',
      },
      signal,
    );

    const { entries, dropped } = this.toEntries(response.results, scopeDirectory, query);

    const total = Math.max(0, response.total - dropped);

    // Everything orders by its own rules: names character by character, no extension order,
    // folders mixed in. The page is put in Hearth's order, so both providers agree; past the
    // result cap, which items made the page was still Everything's choice.
    const items = sortEntries(entries, query.sort);

    return {
      items,
      total,
      hasMore: (Number.isFinite(limit) ? index * limit : 0) + entries.length < total,
      provider: this.name,
      approximate: dropped > 0,
    };
  }

  /** `null` for this machine's Everything, which needs no mapping. */
  private mapOf(directory: string): PathMap | null {
    if (this.source.maps === null) return null;
    const map = mapFor(this.source.maps, directory);
    if (map === null) {
      throw new HearthError(
        'INTERNAL',
        `Everything "${this.source.name}" does not cover that folder`,
      );
    }
    return map;
  }

  private remoteOf(directory: string): string {
    const map = this.mapOf(directory);
    if (map === null) return directory;
    const remote = toRemote(map, directory);
    if (remote === null) {
      throw new HearthError(
        'INTERNAL',
        `Everything "${this.source.name}" does not cover that folder`,
      );
    }
    return remote;
  }

  /**
   * Security boundary: Everything knows nothing of Hearth's root or hidden
   * entries, so every returned path is re-verified here.
   */
  private toEntries(
    results: EverythingResult[],
    scopeDirectory: string,
    query: SearchQuery,
  ): { entries: FileEntry[]; dropped: number } {
    // Every result lies in the scope, so the scope's map is the one that translates it.
    const map = this.mapOf(scopeDirectory);
    const entries: FileEntry[] = [];
    let dropped = 0;

    for (const result of results) {
      const local = map === null ? result.absolutePath : toLocal(map, result.absolutePath);
      const safe = local === null ? null : this.vault.adopt(local);
      if (!safe) {
        dropped += 1;
        continue;
      }

      const relative = this.vault.relativize(safe);
      if (relative.split('/').some(isHiddenSystemEntry)) {
        dropped += 1;
        continue;
      }

      // `path:` also matches subfolders.
      // Compared by `relative`, which ignores case where the filesystem does.
      if (!query.recursive && path.relative(scopeDirectory, path.dirname(safe)) !== '') {
        dropped += 1;
        continue;
      }

      entries.push({
        name: result.name,
        path: relative,
        size: result.isDirectory ? 0 : result.size,
        mtime: new Date(result.mtimeMs).toISOString(),
        mimeType: result.isDirectory ? DIRECTORY_MIME : mimeForPath(result.name, result.size),
        isDirectory: result.isDirectory,
      });
    }

    return { entries, dropped };
  }
}

export function unreachable(error: unknown): ProviderHealth {
  return {
    reachable: false,
    latencyMs: null,
    version: null,
    note: error instanceof Error ? error.message : String(error),
  };
}
