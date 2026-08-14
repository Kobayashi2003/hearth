/**
 * Ledger — where you were — and Hob — how you like things set.
 *
 * They are separate documents on purpose: Ledger is written every few seconds
 * while a video plays, Hob perhaps once a week. Sharing one file would let a
 * background playback write clobber a preference changed on another device.
 */

/** How far through a file you are, in whatever unit that file measures itself. */
export interface Progress {
  /**
   * How the position is expressed:
   * - `time` — seconds (video, audio)
   * - `page` — zero-based page index (comic, PDF)
   * - `locator` — an opaque per-format anchor (EPUB CFI, text scroll target)
   */
  kind: 'time' | 'page' | 'locator';
  at: number | string;
  /** Total seconds or pages, where the medium has one. Absent for locators. */
  total?: number;
  /**
   * 0–100. Always present so a progress bar can be drawn without knowing
   * `kind` — a locator has no arithmetic the caller could do itself.
   */
  percent: number;
  savedAt: number;
}

export interface RecentEntry {
  path: string;
  openedAt: number;
}

export interface LedgerDocument {
  /** Keyed by root-relative path. See ADR 0001 for why not a content hash. */
  progress: Record<string, Progress>;
  /** Most recently opened first. */
  recent: RecentEntry[];
  pinned: string[];
}

export interface LedgerPatch {
  /** A null value forgets that path's progress. */
  progress?: Record<string, Progress | null>;
  /** Path just opened; moves to the front of `recent`. */
  opened?: string;
  pin?: { path: string; value: boolean };
}

export const EMPTY_LEDGER: LedgerDocument = { progress: {}, recent: [], pinned: [] };

export type Theme = 'light' | 'dark' | 'system';
/**
 * Which end of the device's allowed range to sit at — not an absolute size.
 * The input axis decides what `compact` and `comfortable` resolve to, so one
 * preference yields 44px on a phone and 28px on a desktop. See ADR 0002.
 */
export type Density = 'comfortable' | 'compact';
export type ViewMode = 'list' | 'grid';

/**
 * What the preview window's full-screen control does.
 *
 * Two mechanisms exist and neither is right for everything. The browser's own
 * fullscreen hides the tab strip and the OS bars, which is what a film or a
 * comic page wants; it also swallows the keyboard shortcuts of the page around
 * it and, on some platforms, is slow to enter and leave — a poor trade for
 * glancing at a spreadsheet. Filling the browser window has none of those costs
 * and none of the immersion.
 *
 * - `auto` — the browser's fullscreen for video, comics and books; filling the
 *   window for everything else.
 * - `browser` / `window` — always one or the other.
 *
 * A preference rather than a hard rule because which one feels right is a matter
 * of hardware and habit, and the answer should not need a code change.
 */
export type PreviewFullscreen = 'auto' | 'browser' | 'window';

/** Hob: the shelf beside the fire, where things are left the way you like them. */
export interface HobDocument {
  theme: Theme;
  density: Density;
  viewMode: ViewMode;
  /** Wallpaper filename, or null for none. */
  wallpaper: string | null;
  wallpaperOpacity: number;
  gridSize: number;
  /**
   * Whether a folder borrows a cover from the first picture inside it.
   *
   * Off by default: it costs a directory scan per tile, and in a folder of code
   * or documents it produces a wall of arbitrary images that says less than a
   * plain folder icon would. It is worth turning on for a library of books or
   * photos, which is exactly where the person can decide.
   */
  folderCovers: boolean;
  /**
   * Whether the home screen shows the Pinned and Continue shelves.
   *
   * They sit above the listing, so on a short window they push the files you
   * came for below the fold. Worth having, worth being able to put away.
   */
  showShelves: boolean;
  /**
   * Which mechanism the preview's full-screen control uses. The window's *size*
   * is not here on purpose: it is measured in percentages of a browser window,
   * which is a property of the machine in front of you rather than of you, so it
   * stays in that browser's local storage.
   */
  previewFullscreen: PreviewFullscreen;
}

export type HobPatch = Partial<HobDocument>;

export const DEFAULT_HOB: HobDocument = {
  theme: 'system',
  density: 'comfortable',
  viewMode: 'list',
  wallpaper: null,
  wallpaperOpacity: 0.25,
  gridSize: 160,
  folderCovers: false,
  showShelves: true,
  previewFullscreen: 'auto',
};
