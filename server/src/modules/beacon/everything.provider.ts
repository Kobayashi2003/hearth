import path from 'node:path';

import { isHiddenSystemEntry, type FileEntry, type SearchProviderName } from '@hearth/shared';

import { EverythingClient } from '../../adapters/everything/client.js';
import { buildSearchExpression, everythingSortField } from '../../adapters/everything/query.js';
import type { EverythingResult } from '../../adapters/everything/parse.js';
import type { AppConfig } from '../../config/index.js';
import { clampLimit, sortEntries } from '../../lib/listing.js';
import { DIRECTORY_MIME, extensionsForMediaKind, mimeForPath } from '../../lib/mime.js';
import type { Vault } from '../../lib/vault.js';
import type { ProviderHealth, SearchPage, SearchProvider, SearchQuery } from './provider.js';

/**
 * Name search delegated to Everything. Filtering, sorting and pagination are
 * all pushed down so totals stay exact and large roots stay fast.
 */
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
    const limit = clampLimit(query.limit);

    const expression = buildSearchExpression({
      scopeDirectory,
      text: query.text,
      extensions: query.type ? [...extensionsForMediaKind(query.type)] : undefined,
    });

    const response = await this.client.search(
      {
        expression,
        offset: (Math.max(1, query.page) - 1) * limit,
        count: Math.min(limit, this.config.search.everythingMaxResults),
        sort: everythingSortField(query.sort.field),
        ascending: query.sort.direction === 'asc',
      },
      signal,
    );

    const { entries, dropped } = this.toEntries(response.results, scopeDirectory, query);

    // Rows filtered out after retrieval are not in the index's total; subtract
    // them so the reported count matches what the user can actually page through.
    const total = Math.max(0, response.total - dropped);

    // Everything cannot order by Hearth's "type" key, so the page is reordered
    // locally. Only the within-page ordering differs; totals stay exact.
    const items =
      query.sort.field === 'type'
        ? sortEntries(entries, 'type', query.sort.direction)
        : entries;

    return {
      items,
      total,
      hasMore: (Math.max(1, query.page) - 1) * limit + entries.length < total,
      provider: this.name,
      approximate: dropped > 0,
    };
  }

  /**
   * Everything's index knows nothing about Hearth's root or its hidden-entry
   * rules, so every returned path is re-verified here. A query-syntax mistake
   * must not become a path disclosure — this is a security boundary.
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

      // `path:` matches subfolders too; a non-recursive search wants only
      // direct children.
      if (!query.recursive && path.dirname(safe) !== scopeDirectory) {
        dropped += 1;
        continue;
      }

      entries.push({
        name: result.name,
        path: relative,
        size: result.isDirectory ? 0 : result.size,
        mtime: new Date(result.mtimeMs).toISOString(),
        mimeType: result.isDirectory ? DIRECTORY_MIME : mimeForPath(result.name),
        isDirectory: result.isDirectory,
      });
    }

    return { entries, dropped };
  }
}
