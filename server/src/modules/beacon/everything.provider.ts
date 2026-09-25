import path from 'node:path';

import { isHiddenSystemEntry, type FileEntry, type SearchProviderName } from '@hearth/shared';

import { EverythingClient } from '../../adapters/everything/client.js';
import { buildSearchExpression, everythingSortField } from '../../adapters/everything/query.js';
import type { EverythingResult } from '../../adapters/everything/parse.js';
import type { AppConfig } from '../../config/index.js';
import { sortEntries } from '../../lib/listing.js';
import { DIRECTORY_MIME, extensionsForMediaKind, mimeForPath } from '../../lib/mime.js';
import type { Vault } from '../../lib/vault.js';
import type { ProviderHealth, SearchPage, SearchProvider, SearchQuery } from './provider.js';

/** Filtering, sorting and pagination are pushed down to Everything so totals stay exact. */
export class EverythingProvider implements SearchProvider {
  readonly name: SearchProviderName = 'everything';
  private readonly client: EverythingClient;

  constructor(
    private readonly config: AppConfig,
    private readonly vault: Vault,
  ) {
    this.client = new EverythingClient({
      url: config.search.everythingUrl,
      username: config.search.everythingUsername,
      password: config.search.everythingPassword,
      timeoutMs: config.search.everythingTimeoutMs,
    });
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const { latencyMs } = await this.client.probe(signal);
      return { reachable: true, latencyMs, version: null, note: null };
    } catch (error) {
      return {
        reachable: false,
        latencyMs: null,
        version: null,
        note: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchPage> {
    const scopeDirectory = this.vault.resolve(query.scope);
    const limit = query.limit;
    const index = Math.max(1, query.page) - 1;

    const expression = buildSearchExpression({
      scopeDirectory,
      text: query.text,
      extensions: query.type ? [...extensionsForMediaKind(query.type)] : undefined,
    });

    const response = await this.client.search(
      {
        expression,
        offset: Number.isFinite(limit) ? index * limit : 0,
        count: Math.min(limit, this.config.search.maxResults),
        sort: everythingSortField(query.sort.field),
        ascending: query.sort.direction === 'asc',
      },
      signal,
    );

    const { entries, dropped } = this.toEntries(response.results, scopeDirectory, query);

    const total = Math.max(0, response.total - dropped);

    // Everything cannot order by extension; reorder within the page.
    const items =
      query.sort.field === 'type' ? sortEntries(entries, 'type', query.sort.direction) : entries;

    return {
      items,
      total,
      hasMore: (Number.isFinite(limit) ? index * limit : 0) + entries.length < total,
      provider: this.name,
      approximate: dropped > 0,
    };
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
    const entries: FileEntry[] = [];
    let dropped = 0;

    for (const result of results) {
      const safe = this.vault.adopt(result.absolutePath);
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
      if (!query.recursive && path.dirname(safe) !== scopeDirectory) {
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
