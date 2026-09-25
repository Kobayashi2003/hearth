import { type FileEntry, type SearchProviderName } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { paginate, sortEntries } from '../../lib/listing.js';
import { DIRECTORY_MIME, extensionsForMediaKind, mimeForPath } from '../../lib/mime.js';
import type { Vault } from '../../lib/vault.js';
import { runWorker } from '../../lib/worker.js';
import type { WalkRequest, WalkResponse } from '../../workers/walk.worker.js';
import type { ProviderHealth, SearchPage, SearchProvider, SearchQuery } from './provider.js';

/** The fallback: a filesystem walk on a worker thread. Slower, but it has no prerequisites. */
export class WalkProvider implements SearchProvider {
  readonly name: SearchProviderName = 'walk';

  constructor(
    private readonly config: AppConfig,
    private readonly vault: Vault,
  ) {}

  async health(): Promise<ProviderHealth> {
    return { reachable: true, latencyMs: null, version: null, note: null };
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchPage> {
    const scopeDirectory = this.vault.resolve(query.scope);

    const request: WalkRequest = {
      rootDirectory: scopeDirectory,
      terms: query.text
        .split(/\s+/)
        .filter(Boolean)
        .map(term => term.toLowerCase()),
      extensions: query.type ? [...extensionsForMediaKind(query.type)] : [],
      recursive: query.recursive,
      maxResults: this.config.search.maxResults,
    };

    const response = await runWorker<WalkRequest, WalkResponse>('walk', request, signal);
    const entries = response.matches.map(match => this.toEntry(match));
    const sorted = sortEntries(entries, query.sort.field, query.sort.direction);
    const page = paginate(sorted, query.page, query.limit);

    return {
      ...page,
      provider: this.name,
      approximate: response.truncated,
    };
  }

  private toEntry(match: WalkResponse['matches'][number]): FileEntry {
    return {
      name: match.name,
      path: this.vault.relativize(match.absolutePath),
      size: match.size,
      mtime: new Date(match.mtimeMs).toISOString(),
      mimeType: match.isDirectory ? DIRECTORY_MIME : mimeForPath(match.name, match.size),
      isDirectory: match.isDirectory,
    };
  }
}
