import {
  LIMIT_SETTINGS,
  SAFEGUARD_SETTINGS,
  type NumberSetting,
  type SettingKey,
  type SettingKind,
  type SettingUnit,
  type SwitchSetting,
} from '@hearth/shared';

import type { AppConfig } from './index.js';

const MB = 1024 * 1024;

interface Definition {
  /** The .env variable (without the HEARTH_ prefix) that gives the default. */
  variable: string;
  unit: SettingUnit | null;
  /** The default, in the setting's own unit; `Infinity` for an unlimited cap. */
  fallback: (config: AppConfig) => boolean | number;
}

/**
 * The settings an administrator can change while Hearth runs. Only ones read
 * afresh on each use belong here; caps fixed when the server starts (request
 * body size, rate limits, session length, schema lengths) stay in .env.
 */
export const SETTINGS: Record<SettingKey, Definition> = {
  adminOnly: { variable: 'ADMIN_ONLY_MODE', unit: null, fallback: c => c.adminOnly },
  trashEnabled: { variable: 'RECYCLE_BIN_ENABLED', unit: null, fallback: c => c.trash.enabled },
  htmlViewerEnabled: {
    variable: 'HTML_VIEWER_ENABLED',
    unit: null,
    fallback: c => c.viewers.htmlViewerEnabled,
  },
  htmlLocalResources: {
    variable: 'HTML_LOCAL_RESOURCES',
    unit: null,
    fallback: c => c.viewers.htmlLocalResourcesEnabled,
  },
  htmlExternalResources: {
    variable: 'HTML_EXTERNAL_RESOURCES',
    unit: null,
    fallback: c => c.viewers.htmlExternalResourcesEnabled,
  },
  htmlScripts: {
    variable: 'HTML_SCRIPTS',
    unit: null,
    fallback: c => c.viewers.htmlScriptsEnabled,
  },
  htmlRuffle: { variable: 'HTML_RUFFLE', unit: null, fallback: c => c.viewers.htmlRuffleEnabled },
  htmlVideo: { variable: 'HTML_VIDEO', unit: null, fallback: c => c.viewers.htmlVideoEnabled },

  listingMaxEntries: {
    variable: 'LISTING_MAX_ENTRIES',
    unit: 'count',
    fallback: c => c.listing.maxEntries,
  },
  searchMaxResults: {
    variable: 'SEARCH_MAX_RESULTS',
    unit: 'count',
    fallback: c => c.search.maxResults,
  },
  maxUploadSizeMB: {
    variable: 'MAX_UPLOAD_SIZE_MB',
    unit: 'MB',
    fallback: c => c.upload.maxFileSizeBytes / MB,
  },
  maxTextSizeMB: {
    variable: 'MAX_TEXT_SIZE_MB',
    unit: 'MB',
    fallback: c => c.media.maxTextBytes / MB,
  },
  archiveMaxEntries: {
    variable: 'ARCHIVE_MAX_ENTRIES',
    unit: 'count',
    fallback: c => c.media.archiveMaxEntries,
  },
  archiveMaxMemberSizeMB: {
    variable: 'ARCHIVE_MAX_MEMBER_SIZE_MB',
    unit: 'MB',
    fallback: c => c.media.archiveMaxMemberBytes / MB,
  },
  trashRetentionDays: {
    variable: 'RECYCLE_BIN_RETENTION_DAYS',
    unit: 'days',
    fallback: c => c.trash.retentionDays,
  },
  trashMaxSizeMB: {
    variable: 'RECYCLE_BIN_MAX_SIZE_MB',
    unit: 'MB',
    fallback: c => c.trash.maxSizeBytes / MB,
  },

  everythingTimeoutMs: {
    variable: 'EVERYTHING_TIMEOUT_MS',
    unit: 'ms',
    fallback: c => c.search.everythingTimeoutMs,
  },
  folderCoverMaxDepth: {
    variable: 'FOLDER_COVER_MAX_DEPTH',
    unit: 'count',
    fallback: c => c.media.folderCoverMaxDepth,
  },
  folderCoverMaxBranches: {
    variable: 'FOLDER_COVER_MAX_BRANCHES',
    unit: 'count',
    fallback: c => c.media.folderCoverMaxBranches,
  },
};

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function kindOf(key: SettingKey): SettingKind {
  if ((LIMIT_SETTINGS as readonly string[]).includes(key)) return 'limit';
  if ((SAFEGUARD_SETTINGS as readonly string[]).includes(key)) return 'safeguard';
  return 'switch';
}

export type SettingValues = { [K in SwitchSetting]: boolean } & { [K in NumberSetting]: number };

/** A value from outside (the API, the state file) in the form the code uses, or an error message. */
export function parseSetting(key: SettingKey, raw: unknown): boolean | number | string {
  const kind = kindOf(key);
  if (kind === 'switch') return typeof raw === 'boolean' ? raw : `${key} must be true or false`;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return `${key} must be a whole number`;
  if (kind === 'limit') {
    if (raw < 0) return `${key} must be 0 (unlimited) or more`;
    return raw === 0 ? Number.POSITIVE_INFINITY : raw;
  }
  return raw > 0 ? raw : `${key} must be at least 1`;
}

/** The JSON form: an unlimited cap is 0. */
export function serialiseSetting(value: boolean | number): boolean | number {
  return typeof value === 'number' && !Number.isFinite(value) ? 0 : value;
}
