import type {
  FileEntry,
  MediaKind,
  SortDirection,
  SortField,
  SearchProviderName,
} from '@hearth/shared';

export interface SearchQuery {
  /** Raw text the user typed. */
  text: string;
  /** Root-relative directory to confine the search to; '' means the whole root. */
  scope: string;
  /** Restrict to a media class, expanded to an extension set by the provider. */
  type?: MediaKind | undefined;
  /** False restricts the search to direct children of `scope`. */
  recursive: boolean;
  sort: { field: SortField; direction: SortDirection };
  page: number;
  limit: number;
}

export interface SearchPage {
  items: FileEntry[];
  total: number;
  hasMore: boolean;
  /** Which provider answered — surfaced in the UI. */
  provider: SearchProviderName;
  /** True when `total` is an estimate rather than exact. */
  approximate: boolean;
}

export interface ProviderHealth {
  reachable: boolean;
  latencyMs: number | null;
  version: string | null;
  note: string | null;
}

export interface SearchProvider {
  readonly name: SearchProviderName;
  health(signal?: AbortSignal): Promise<ProviderHealth>;
  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchPage>;
}
