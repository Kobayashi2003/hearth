import type { Logger } from 'pino';
import type { SearchHealth, SearchProviderName } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { paginate } from '../../lib/listing.js';
import type { Vault } from '../../lib/vault.js';
import { EverythingProvider, unreachable, type CoverageProbe } from './everything.provider.js';
import { WalkProvider } from './walk.provider.js';
import type { SearchPage, SearchProvider, SearchQuery } from './provider.js';

interface ProbeRecord extends CoverageProbe {
  at: number;
}

/**
 * Provider selection and health. A search goes to the Everything that answers
 * for its folder (this machine's, or one on the machine that holds the files),
 * and to the filesystem walk when that one is down or has not indexed the root:
 * a reachable Everything that does not know a folder would otherwise answer
 * every search there with nothing.
 */
export class Beacon {
  private readonly sources: EverythingProvider[];
  private readonly walk: WalkProvider;
  /** By source and probed folder. */
  private readonly probes = new Map<string, ProbeRecord>();
  private readonly probesInFlight = new Map<string, Promise<ProbeRecord>>();

  constructor(
    private readonly config: AppConfig,
    runtime: RuntimeState,
    private readonly vault: Vault,
    private readonly logger: Logger,
  ) {
    this.sources = config.search.everythingSources.map(
      source => new EverythingProvider(source, runtime, vault),
    );
    this.walk = new WalkProvider(runtime, vault);

    // A new root may be on a volume an Everything does not index.
    runtime.onChange(change => {
      if (change === 'activeRootId') this.probes.clear();
    });
  }

  /**
   * `canRead` filters every result; listing a path the user cannot open is
   * itself a disclosure. Where some of the scope may be unreadable
   * (`allReadable` false), the results are filtered before they are paged, so
   * pages and totals count only what the user may see: a provider's own page
   * could otherwise be all refused while readable matches wait on the next.
   */
  async search(
    query: SearchQuery,
    canRead: (relativePath: string) => boolean,
    allReadable: boolean,
    signal?: AbortSignal,
  ): Promise<SearchPage> {
    if (allReadable) {
      const page = await this.searchWithProvider(query, signal);
      return { ...page, items: page.items.filter(item => canRead(item.path)) };
    }

    // Everything the provider returns (up to its result cap), then paged here.
    const whole = await this.searchWithProvider(
      { ...query, page: 1, limit: Number.POSITIVE_INFINITY },
      signal,
    );
    const permitted = whole.items.filter(item => canRead(item.path));
    return {
      ...paginate(permitted, query.page, query.limit),
      provider: whole.provider,
      approximate: whole.approximate || whole.hasMore,
    };
  }

  private async searchWithProvider(query: SearchQuery, signal?: AbortSignal): Promise<SearchPage> {
    const scope = this.vault.resolve(query.scope);
    const provider = await this.selectProvider(scope, signal);
    if (!(provider instanceof EverythingProvider)) return provider.search(query, signal);

    try {
      return await provider.search(query, signal);
    } catch (error) {
      const directory = provider.probeDirectory(scope, this.vault.rootPath);
      this.probes.set(this.probeKey(provider, directory), {
        ...unreachable(error),
        covered: false,
        at: Date.now(),
      });
      this.logger.warn(
        { err: error, everything: provider.source.name },
        'Everything search failed — falling back to filesystem walk',
      );
      return this.walk.search(query, signal);
    }
  }

  /** The provider that would answer a search of the whole root now. */
  async providerName(): Promise<SearchProviderName> {
    return (await this.selectProvider(this.vault.rootPath)).name;
  }

  async status(): Promise<SearchHealth> {
    const source = this.sourceFor(this.vault.rootPath);
    const probe =
      this.config.search.provider === 'walk' ? null : await this.probe(source, this.vault.rootPath);
    const provider = await this.selectProvider(this.vault.rootPath);

    return {
      provider: provider.name,
      healthy: true,
      note: provider.name === 'walk' ? (probe?.note ?? null) : null,
      everything: {
        reachable: probe?.reachable ?? false,
        url: source.source.url,
        version: null,
        lastProbeAt: probe ? new Date(probe.at).toISOString() : null,
        lastLatencyMs: probe?.latencyMs ?? null,
      },
      fallbackActive: provider.name === 'walk' && this.config.search.provider !== 'walk',
    };
  }

  private async selectProvider(directory: string, signal?: AbortSignal): Promise<SearchProvider> {
    const source = this.sourceFor(directory);
    switch (this.config.search.provider) {
      case 'walk':
        return this.walk;
      case 'everything':
        return source;
      case 'auto': {
        const probe = await this.probe(source, directory, signal);
        return probe.reachable && probe.covered ? source : this.walk;
      }
    }
  }

  /** The Everything on the machine that holds `directory`: the most specific mapping, else this machine's. */
  private sourceFor(directory: string): EverythingProvider {
    let best = this.sources[0]!;
    let depth = 0;
    for (const source of this.sources) {
      const specificity = source.specificity(directory);
      if (specificity > depth) {
        best = source;
        depth = specificity;
      }
    }
    return best;
  }

  private probeKey(source: EverythingProvider, directory: string): string {
    return `${source.source.name}\0${directory}`;
  }

  /** Cached for the cooldown and de-duplicated, so a burst of searches costs one query. */
  private async probe(
    source: EverythingProvider,
    searched: string,
    signal?: AbortSignal,
  ): Promise<ProbeRecord> {
    const directory = source.probeDirectory(searched, this.vault.rootPath);
    const key = this.probeKey(source, directory);

    const last = this.probes.get(key);
    if (last && Date.now() - last.at < this.config.search.probeCooldownMs) return last;
    const inFlight = this.probesInFlight.get(key);
    if (inFlight) return inFlight;

    const pending = source
      .coverage(directory, signal)
      .then(result => {
        const record: ProbeRecord = { ...result, at: Date.now() };
        if (last?.reachable !== record.reachable || last.covered !== record.covered) {
          this.logger.info(
            {
              everything: source.source.name,
              directory,
              reachable: record.reachable,
              covered: record.covered,
              note: record.note,
            },
            'Everything availability changed',
          );
        }
        this.probes.set(key, record);
        return record;
      })
      .finally(() => {
        this.probesInFlight.delete(key);
      });
    this.probesInFlight.set(key, pending);
    return pending;
  }
}
