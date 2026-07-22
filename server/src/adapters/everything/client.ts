import { HearthError } from '../../lib/errors.js';
import { parseEverythingResponse, type EverythingResponse } from './parse.js';

export interface EverythingClientOptions {
  url: string;
  username?: string | undefined;
  password?: string | undefined;
  timeoutMs: number;
}

export interface EverythingRequest {
  expression: string;
  offset: number;
  count: number;
  sort: string;
  ascending: boolean;
}

/**
 * Thin HTTP client for Everything's built-in server. Nothing above this file
 * knows Everything's wire format or its Windows absolute paths.
 */
export class EverythingClient {
  constructor(private readonly options: EverythingClientOptions) {}

  get url(): string {
    return this.options.url;
  }

  async search(request: EverythingRequest, signal?: AbortSignal): Promise<EverythingResponse> {
    const query = new URLSearchParams({
      s: request.expression,
      j: '1',
      o: String(request.offset),
      c: String(request.count),
      sort: request.sort,
      ascending: request.ascending ? '1' : '0',
      path_column: '1',
      size_column: '1',
      date_modified_column: '1',
    });

    const payload = await this.fetchJson(`${this.options.url}/?${query}`, signal);
    return parseEverythingResponse(payload);
  }

  /** Cheap liveness probe; an empty search is the least expensive query available. */
  async probe(signal?: AbortSignal): Promise<{ latencyMs: number }> {
    const startedAt = Date.now();
    await this.fetchJson(`${this.options.url}/?s=&j=1&c=1`, signal);
    return { latencyMs: Date.now() - startedAt };
  }

  private async fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.options.username !== undefined) {
      const credentials = `${this.options.username}:${this.options.password ?? ''}`;
      headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
    }

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: combined });
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
