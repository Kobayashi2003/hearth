/**
 * Ledger (where you were) and Hob (how you like things set) are separate
 * documents: Ledger is written every few seconds during playback, Hob rarely,
 * and sharing one file would let a background write clobber a preference.
 */

/** How far through a file you are, in the unit that file measures itself. */
export interface Progress {
  /** `time`: seconds. `page`: zero-based page index. `locator`: an opaque per-format anchor. */
  kind: 'time' | 'page' | 'locator';
  at: number | string;
  /** Total seconds or pages, where the medium has one. */
  total?: number;
  /** 0–100, so a progress bar can be drawn without understanding `kind`. */
  percent: number;
  savedAt: number;
}

/** Keyed by root-relative path. */
export type ProgressMap = Record<string, Progress>;

export interface ProgressPatch {
  /** A null value forgets that path. */
  progress: Record<string, Progress | null>;
}

/**
 * A viewer's own resumable state for one file — the EPUB reader's session
 * record, for example. Opaque to the server beyond a size cap.
 */
export interface ReadingSessionBody {
  path: string;
  record: unknown;
}

export type Theme = 'light' | 'dark' | 'system';
/** Which end of the device's comfortable range to sit at; the input type decides the actual size. */
export type Density = 'comfortable' | 'compact';
export type ViewMode = 'list' | 'grid';

export interface HobDocument {
  theme: Theme;
  density: Density;
  viewMode: ViewMode;
  /** Wallpaper filename, or null for none. */
  wallpaper: string | null;
  wallpaperOpacity: number;
  gridSize: number;
  /** Whether a folder borrows the cover of the first picture inside it. Costs a directory scan per tile. */
  folderCovers: boolean;
}

export type HobPatch = Partial<HobDocument>;

export const DEFAULT_HOB: HobDocument = {
  theme: 'system',
  density: 'comfortable',
  viewMode: 'list',
  wallpaper: null,
  wallpaperOpacity: 0.25,
  gridSize: 168,
  folderCovers: false,
};
