import type { Logger } from 'pino';
import type { SearchHealth } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import type { Vault } from '../../lib/vault.js';
import { EverythingProvider } from './everything.provider.js';
import { WalkProvider } from './walk.provider.js';
import type { SearchPage, SearchProvider, SearchQuery } from './provider.js';

interface ProbeRecord {
  reachable: boolean;
  at: number;
  latencyMs: number | null;
  note: string | null;
}

/**
 * Provider selection and health. Search never hard-fails because Everything is
 * down: it degrades to the walk provider and reports that via the status endpoint.
 */
export class Beacon {
  private readonly everything: EverythingProvider;
  private readonly walk: WalkProvider;
  private lastProbe: ProbeRecord | null = null;
  private probeInFlight: Promise<ProbeRecord> | null = null;

  constructor(
    private readonly config: AppConfig,
    runtime: RuntimeState,
    vault: Vault,
    private readonly logger: Logger,
  ) {
    this.everything = new EverythingProvider(config, runtime, vault);
    this.walk = new WalkProvider(runtime, vault);

    // A new root may be on a volume Everything does not index.
    runtime.onChange(change => {
      if (change === 'activeRootId') this.lastProbe = null;
    });
  }

  /** `canRead` filters every result; listing a path the user cannot open is itself a disclosure. */
  async search(
    query: SearchQuery,
    canRead: (relativePath: string) => boolean,
    signal?: AbortSignal,
  ): Promise<SearchPage> {
    const page = await this.searchWithProvider(query, signal);

    const permitted = page.items.filter(item => canRead(item.path));
    const denied = page.items.length - permitted.length;
    if (denied === 0) return page;

    return {
      ...page,
      items: permitted,
      total: Math.max(permitted.length, page.total - denied),
      approximate: true,
    };
  }

  private async searchWithProvider(query: SearchQuery, signal?: AbortSignal): Promise<SearchPage> {
    const provider = await this.selectProvider(signal);
    if (provider.name === 'walk') return provider.search(query, signal);

    try {
      return await this.everything.search(query, signal);
    } catch (error) {
      this.lastProbe = {
        reachable: false,
        at: Date.now(),
        latencyMs: null,
        note: error instanceof Error ? error.message : String(error),
      };
      this.logger.warn(
        { err: error },
        'Everything search failed — falling back to filesystem walk',
      );
      return this.walk.search(query, signal);
    }
  }

  async status(): Promise<SearchHealth> {
    const probe = this.config.search.provider === 'walk' ? null : await this.probeEverything();
    const provider = await this.selectProvider();

    return {
      provider: provider.name,
      healthy: true,
      note: provider.name === 'walk' && probe?.reachable === false ? probe.note : null,
      everything: {
        reachable: probe?.reachable ?? false,
        url: this.config.search.everythingUrl,
        version: null,
        lastProbeAt: probe ? new Date(probe.at).toISOString() : null,
        lastLatencyMs: probe?.latencyMs ?? null,
      },
      fallbackActive: provider.name === 'walk' && this.config.search.provider !== 'walk',
    };
  }

  private async selectProvider(signal?: AbortSignal): Promise<SearchProvider> {
    switch (this.config.search.provider) {
      case 'walk':
        return this.walk;
      case 'everything':
        return this.everything;
      case 'auto': {
        const probe = await this.probeEverything(signal);
        return probe.reachable ? this.everything : this.walk;
      }
    }
  }

  /** Cached for the cooldown and de-duplicated, so a burst of searches costs one failed connection. */
  private async probeEverything(signal?: AbortSignal): Promise<ProbeRecord> {
    const cooldown = this.config.search.probeCooldownMs;
    if (this.lastProbe && Date.now() - this.lastProbe.at < cooldown) return this.lastProbe;
    if (this.probeInFlight) return this.probeInFlight;

    this.probeInFlight = this.everything
      .health(signal)
      .then(health => {
        const record: ProbeRecord = {
          reachable: health.reachable,
          at: Date.now(),
          latencyMs: health.latencyMs,
          note: health.note,
        };
        if (this.lastProbe?.reachable !== record.reachable) {
          this.logger.info(
            { reachable: record.reachable, note: record.note },
            'Everything availability changed',
          );
        }
        this.lastProbe = record;
        return record;
      })
      .finally(() => {
        this.probeInFlight = null;
      });

    return this.probeInFlight;
  }
}
