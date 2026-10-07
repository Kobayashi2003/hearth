import path from 'node:path';

import type { SettingKey, SettingState } from '@hearth/shared';

import type { AppConfig } from './index.js';
import { rootAvailable, type RootConfig } from './roots.js';
import {
  kindOf,
  parseSetting,
  serialiseSetting,
  SETTING_KEYS,
  SETTINGS,
  type SettingValues,
} from './settings.js';
import { readJsonFile, writeJsonFileAtomic } from '../lib/json-store.js';

type Values = SettingValues & { activeRootId: string };
type RuntimeChange = keyof Values;
type Listener = (change: RuntimeChange) => void;

/** On disk: only what an administrator chose, so .env stays the default for everything else. */
interface StateFile {
  activeRootId?: string;
  overrides?: Partial<Record<SettingKey, boolean | number>>;
}

/** Before overrides were kept apart, every setting was written out flat. */
const LEGACY_NAMES: Partial<Record<string, SettingKey>> = {
  adminOnly: 'adminOnly',
  trashEnabled: 'trashEnabled',
  htmlViewerEnabled: 'htmlViewerEnabled',
  htmlExternalResourcesEnabled: 'htmlExternalResources',
};

const STATE_FILENAME = 'runtime.json';

/**
 * What an administrator can change while Hearth runs, kept apart from the
 * frozen `AppConfig`: each setting is its override if there is one, otherwise
 * its .env default. Readers ask on each use, so a change applies at once.
 */
export class RuntimeState {
  private readonly defaults: SettingValues;
  private overrides: Partial<SettingValues> = {};
  private activeRootId: string;
  private readonly listeners = new Set<Listener>();
  private readonly statePath: string;

  constructor(private readonly config: AppConfig) {
    this.statePath = path.join(config.storage.dataDirectory, STATE_FILENAME);
    this.defaults = Object.fromEntries(
      SETTING_KEYS.map(key => [key, SETTINGS[key].fallback(config)]),
    ) as SettingValues;

    const saved = this.load();
    this.activeRootId = startingRoot(config, saved.activeRootId);
  }

  private load(): StateFile {
    const raw = readJsonFile<Record<string, unknown>>(this.statePath) ?? {};
    const stored: Record<string, unknown> =
      'overrides' in raw ? ((raw.overrides as Record<string, unknown>) ?? {}) : legacy(raw);
    for (const key of SETTING_KEYS) {
      if (!(key in stored)) continue;
      const value = parseSetting(key, stored[key]);
      // A legacy file repeats the defaults; only real differences are overrides.
      if (typeof value !== 'string' && value !== this.defaults[key]) {
        (this.overrides as Record<string, unknown>)[key] = value;
      }
    }
    return { activeRootId: typeof raw.activeRootId === 'string' ? raw.activeRootId : undefined };
  }

  get activeRoot(): RootConfig {
    const root = this.config.storage.roots.find(r => r.id === this.activeRootId);
    return root ?? this.config.storage.roots[0]!;
  }

  get<K extends RuntimeChange>(key: K): Values[K] {
    if (key === 'activeRootId') return this.activeRootId as Values[K];
    const setting = key as SettingKey;
    return (this.overrides[setting] ?? this.defaults[setting]) as Values[K];
  }

  setActiveRoot(id: string): void {
    if (this.activeRootId === id) return;
    this.activeRootId = id;
    this.persist();
    this.notify('activeRootId');
  }

  /**
   * Override a setting with a value in API form (0 = unlimited for a cap), or
   * pass null to fall back to .env. Returns an error message for a bad value.
   */
  set(key: SettingKey, raw: boolean | number | null): string | null {
    if (raw === null) {
      if (!(key in this.overrides)) return null;
      delete this.overrides[key];
    } else {
      const value = parseSetting(key, raw);
      if (typeof value === 'string') return value;
      if (this.get(key) === value && key in this.overrides) return null;
      (this.overrides as Record<string, unknown>)[key] = value;
    }
    this.persist();
    this.notify(key);
    return null;
  }

  describe(): SettingState[] {
    return SETTING_KEYS.map(key => ({
      key,
      kind: kindOf(key),
      value: serialiseSetting(this.get(key)),
      default: serialiseSetting(this.defaults[key]),
      overridden: key in this.overrides,
      variable: `HEARTH_${SETTINGS[key].variable}`,
      unit: SETTINGS[key].unit,
    }));
  }

  /** In-memory is authoritative; a failed persist is reported, not fatal. */
  private persist(): void {
    const overrides = Object.fromEntries(
      Object.entries(this.overrides).map(([key, value]) => [key, serialiseSetting(value)]),
    );
    const file: StateFile = { activeRootId: this.activeRootId, overrides };
    writeJsonFileAtomic(this.statePath, file).catch(error => {
      this.onPersistError?.(error as Error);
    });
  }

  private notify(change: RuntimeChange): void {
    for (const listener of this.listeners) listener(change);
  }

  onPersistError: ((error: Error) => void) | undefined;

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * The root to serve at startup: the one served last time, else the configured
 * default, whichever is there now; when neither is, the first that is. Not
 * persisted, so the usual root returns once its drive does.
 */
function startingRoot(config: AppConfig, saved: string | undefined): string {
  const { roots, defaultRootId } = config.storage;
  const preferred = [saved, defaultRootId]
    .map(id => roots.find(root => root.id === id))
    .filter((root): root is RootConfig => root !== undefined);
  const choice =
    preferred.find(rootAvailable) ?? roots.find(rootAvailable) ?? preferred[0] ?? roots[0]!;
  return choice.id;
}

function legacy(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    const key = LEGACY_NAMES[name];
    if (key) mapped[key] = value;
  }
  return mapped;
}
