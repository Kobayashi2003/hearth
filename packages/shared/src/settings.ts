/**
 * Settings an administrator can change while Hearth runs. Each starts from its
 * .env variable; an override made in Settings wins until it is reset, and only
 * administrators can see or change any of them.
 */

export const SWITCH_SETTINGS = [
  'adminOnly',
  'trashEnabled',
  'htmlViewerEnabled',
  'htmlLocalResources',
  'htmlExternalResources',
  'htmlScripts',
  'htmlRuffle',
  'htmlVideo',
] as const;

/** Caps where 0 means unlimited. */
export const LIMIT_SETTINGS = [
  'listingMaxEntries',
  'searchMaxResults',
  'maxUploadSizeMB',
  'maxTextSizeMB',
  'archiveMaxEntries',
  'archiveMaxMemberSizeMB',
  'trashRetentionDays',
  'trashMaxSizeMB',
] as const;

/** Positive numbers with no unlimited: lifting them only lets the server wait or scan forever. */
export const SAFEGUARD_SETTINGS = [
  'everythingTimeoutMs',
  'folderCoverMaxDepth',
  'folderCoverMaxBranches',
] as const;

export type SwitchSetting = (typeof SWITCH_SETTINGS)[number];
export type NumberSetting = (typeof LIMIT_SETTINGS)[number] | (typeof SAFEGUARD_SETTINGS)[number];
export type SettingKey = SwitchSetting | NumberSetting;
export type SettingKind = 'switch' | 'limit' | 'safeguard';
export type SettingUnit = 'count' | 'MB' | 'days' | 'ms';

export interface SettingState {
  key: SettingKey;
  kind: SettingKind;
  /** For a limit, 0 is unlimited (JSON has no Infinity). */
  value: boolean | number;
  /** What .env gives it. */
  default: boolean | number;
  overridden: boolean;
  /** The .env variable behind the default. */
  variable: string;
  unit: SettingUnit | null;
}

export interface AdminSettingsResponse {
  settings: SettingState[];
}

/** A value to override with, or null to go back to the .env default. */
export type AdminSettingsPatch = Partial<Record<SettingKey, boolean | number | null>>;
