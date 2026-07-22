import path from 'node:path';

import type { AppConfig, RootConfig } from './index.js';
import { readJsonFile, writeJsonFileAtomic } from '../lib/json-store.js';

/**
 * The parts of the configuration an admin can change while the server is
 * running. Kept apart from the frozen `AppConfig` so nothing can quietly mutate
 * startup configuration, and so every change has one place to observe.
 */
export interface RuntimeSettings {
  activeRootId: string;
  adminOnly: boolean;
  trashEnabled: boolean;
  htmlViewerEnabled: boolean;
  htmlExternalResourcesEnabled: boolean;
}

export type RuntimeChange = keyof RuntimeSettings;
type Listener = (change: RuntimeChange, state: RuntimeSettings) => void;

const STATE_FILENAME = 'runtime.json';

export class RuntimeState {
  private settings: RuntimeSettings;
  private readonly listeners = new Set<Listener>();
  private readonly statePath: string;

  constructor(private readonly config: AppConfig) {
    this.statePath = path.join(config.storage.dataDirectory, STATE_FILENAME);
    this.settings = { ...this.defaults(), ...this.loadPersisted() };
    // A root removed from the environment must not stay selected.
    if (!config.storage.roots.some(root => root.id === this.settings.activeRootId)) {
      this.settings.activeRootId = config.storage.defaultRootId;
    }
  }

  private defaults(): RuntimeSettings {
    return {
      activeRootId: this.config.storage.defaultRootId,
      adminOnly: this.config.adminOnly,
      trashEnabled: this.config.trash.enabled,
      htmlViewerEnabled: this.config.viewers.htmlViewerEnabled,
      htmlExternalResourcesEnabled: this.config.viewers.htmlExternalResourcesEnabled,
    };
  }

  private loadPersisted(): Partial<RuntimeSettings> {
    return readJsonFile<Partial<RuntimeSettings>>(this.statePath) ?? {};
  }

  get activeRoot(): RootConfig {
    const root = this.config.storage.roots.find(r => r.id === this.settings.activeRootId);
    // The constructor guarantees a valid id; this keeps the return type non-null.
    return root ?? this.config.storage.roots[0]!;
  }

  snapshot(): Readonly<RuntimeSettings> {
    return { ...this.settings };
  }

  get<K extends RuntimeChange>(key: K): RuntimeSettings[K] {
    return this.settings[key];
  }

  set<K extends RuntimeChange>(key: K, value: RuntimeSettings[K]): void {
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    void writeJsonFileAtomic(this.statePath, this.settings);
    for (const listener of this.listeners) listener(key, this.snapshot());
  }

  /** Returns an unsubscribe function so callers cannot leak listeners. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
