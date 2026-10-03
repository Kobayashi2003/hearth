import { HearthError } from '../../lib/errors.js';
import { parseEverythingResponse, type EverythingResponse } from './parse.js';

export interface EverythingClientOptions {
  url: string;
  username?: string | undefined;
  password?: string | undefined;
  /** Read on each query, so a changed setting applies at once. */
  timeoutMs: number | (() => number);
}

export interface EverythingRequest {
  expression: string;
  offset: number;
  count: number;
  sort: string;
  ascending: boolean;
}

/** Thin client for Everything's HTTP server; nothing above this knows its wire format. */
export class EverythingClient {
  constructor(private readonly options: EverythingClientOptions) {}

  private timeoutMs(): number {
    const { timeoutMs } = this.options;
    return typeof timeoutMs === 'function' ? timeoutMs() : timeoutMs;
  }

  get url(): string {
    return this.options.url;
  }

  async search(request: EverythingRequest, signal?: AbortSignal): Promise<EverythingResponse> {
    const query = new URLSearchParams({
      s: request.expression,
      j: '1',
      o: String(request.offset),
      sort: request.sort,
      ascending: request.ascending ? '1' : '0',
      path_column: '1',
      size_column: '1',
      date_modified_column: '1',
    });

    // Without `c` Everything returns every match.
    if (Number.isFinite(request.count)) query.set('c', String(request.count));
    const payload = await this.fetchJson(`${this.options.url}/?${query}`, signal);
    return parseEverythingResponse(payload);
  }

  /** An empty search is the cheapest query available. */
  async probe(signal?: AbortSignal): Promise<{ latencyMs: number }> {
    const startedAt = Date.now();
    await this.fetchJson(`${this.options.url}/?s=&j=1&c=1`, signal);
    return { latencyMs: Date.now() - startedAt };
  }

  private async fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
    const signals = [
      signal,
      Number.isFinite(this.timeoutMs()) ? AbortSignal.timeout(this.timeoutMs()) : undefined,
    ].filter((candidate): candidate is AbortSignal => candidate !== undefined);
    const combined = signals.length > 0 ? AbortSignal.any(signals) : undefined;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.options.username !== undefined) {
      const credentials = `${this.options.username}:${this.options.password ?? ''}`;
      headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
    }

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: combined ?? null });
    } catch (error) {
      throw new HearthError(
        'UPSTREAM_UNAVAILABLE',
        'The Everything search service is not responding',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }

    if (!response.ok) {
      throw new HearthError(
        'UPSTREAM_UNAVAILABLE',
        `The Everything search service returned ${response.status}`,
      );
    }

    return response.json();
  }
}
