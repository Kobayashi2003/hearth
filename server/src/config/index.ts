import crypto from 'node:crypto';

import {
  ConfigError,
  envBool,
  envEnum,
  envInt,
  envLimit,
  envLimitRenamed,
  envList,
  envOptional,
  envPath,
  envPositive,
  envString,
  projectRoot,
} from './env.js';
import { defaultRootOf, parseRoots, type RootConfig } from './roots.js';
import { parseStaticUsers, type StaticUser } from './users.js';

export type { RootConfig } from './roots.js';
export type { StaticUser } from './users.js';

export type SearchProviderChoice = 'everything' | 'walk' | 'auto';

/** Every cap below is `Infinity` when its variable is `0`. */
export interface RateBucket {
  readonly max: number;
  readonly windowMs: number;
}

export interface AppConfig {
  readonly projectRoot: string;
  readonly development: boolean;
  readonly server: {
    readonly port: number;
    readonly host: string;
    readonly corsOrigins: readonly string[];
    /** App-scoped rather than `/api`: behind a shared edge every app shares one origin. */
    readonly apiPrefix: string;
    readonly bodyLimitBytes: number;
  };
  readonly storage: {
    readonly roots: readonly RootConfig[];
    readonly defaultRootId: string;
    readonly dataDirectory: string;
    readonly tempDirectory: string;
    readonly backgroundsDirectory: string;
    readonly streamBufferBytes: {
      readonly video: number;
      readonly audio: number;
      readonly default: number;
    };
  };
  readonly auth: {
    readonly sessionExpiryMs: number;
    readonly cookieName: string;
    readonly cookieSecure: boolean;
    readonly staticUsers: readonly StaticUser[];
    readonly usersFile: string;
    readonly permissionsFile: string;
    readonly redisUrl: string | undefined;
    readonly mediaTokenSecret: string;
    readonly mediaTokenTtlSeconds: number;
  };
  readonly listing: {
    readonly maxEntries: number;
    /** Paths in one copy/move/delete/zip/restore request, and rules in one save. */
    readonly maxBatchItems: number;
  };
  readonly upload: {
    readonly maxFileSizeBytes: number;
    readonly maxFilesPerRequest: number;
    readonly chunkDirectory: string;
    readonly chunkSizeBytes: number;
    readonly chunkSessionTimeoutMs: number;
    readonly validateMagicNumber: boolean;
    readonly zipLinkTtlMs: number;
  };
  readonly trash: {
    readonly directory: string;
    readonly enabled: boolean;
    readonly autoCleanup: boolean;
    readonly retentionDays: number;
    readonly maxSizeBytes: number;
  };
  readonly search: {
    readonly provider: SearchProviderChoice;
    readonly everythingUrl: string;
    readonly everythingUsername: string | undefined;
    readonly everythingPassword: string | undefined;
    readonly everythingTimeoutMs: number;
    readonly maxResults: number;
    readonly maxQueryLength: number;
    readonly probeCooldownMs: number;
  };
  readonly media: {
    readonly thumbnailCacheDirectory: string;
    readonly comicCacheDirectory: string;
    readonly psdCacheDirectory: string;
    readonly subtitleCacheDirectory: string;
    readonly ffmpegPath: string;
    readonly ffprobePath: string;
    readonly transcodeCrf: number;
    readonly transcodePreset: string;
    readonly thumbnailMaxWidth: number;
    readonly maxTextBytes: number;
    readonly maxTextSaveBytes: number;
    readonly archiveMaxEntries: number;
    readonly archiveMaxMemberBytes: number;
    readonly folderCoverMaxDepth: number;
    readonly folderCoverMaxBranches: number;
  };
  readonly cache: {
    readonly thumbnailMaxAgeMs: number;
    readonly comicMaxAgeMs: number;
    readonly psdMaxAgeMs: number;
    readonly subtitleMaxAgeMs: number;
  };
  readonly ledger: {
    readonly maxProgressEntries: number;
    readonly maxSessions: number;
    readonly maxSessionBytes: number;
  };
  readonly rateLimits: {
    readonly global: RateBucket;
    readonly write: RateBucket;
    readonly search: RateBucket;
    readonly login: RateBucket;
  };
  readonly logging: {
    readonly level: string;
    /** `pretty` for a person reading the console, `json` for a collector. The file is always JSON. */
    readonly format: 'pretty' | 'json';
    readonly directory: string;
    readonly toFile: boolean;
  };
  readonly viewers: {
    readonly htmlViewerEnabled: boolean;
    /** Images, styles, frames and pages beside an HTML file, from its own folder down. */
    readonly htmlLocalResourcesEnabled: boolean;
    readonly htmlExternalResourcesEnabled: boolean;
    /** The page's own scripts run (in a sandbox with no access to Hearth). */
    readonly htmlScriptsEnabled: boolean;
    /** Flash embedded in a page plays through Ruffle. */
    readonly htmlRuffleEnabled: boolean;
    /** Video a page embeds for a long-gone plugin plays in <video>, transcoded when the browser cannot. */
    readonly htmlVideoEnabled: boolean;
    /** The self-hosted Ruffle build (ruffle.js and its .wasm). */
    readonly ruffleDirectory: string;
  };
  readonly adminOnly: boolean;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const KB = 1024;
const MB = 1024 * KB;

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

function logLevel(): string {
  const level = envString('LOG_LEVEL', 'info').toLowerCase();
  if (!LOG_LEVELS.includes(level)) {
    throw new ConfigError('LOG_LEVEL', `expected one of ${LOG_LEVELS.join(', ')}`);
  }
  return level;
}

function rateBucket(name: string, max: number, windowMinutes: number): RateBucket {
  return {
    max: envLimit(`RATE_LIMIT_${name}_MAX`, max),
    windowMs: envInt(`RATE_LIMIT_${name}_WINDOW_MINUTES`, windowMinutes) * MINUTE_MS,
  };
}

export function loadConfig(development = false): AppConfig {
  const roots = parseRoots();
  const defaultRoot = defaultRootOf(roots);

  const config: AppConfig = {
    projectRoot,
    development,
    server: {
      port: envInt('PORT', 17010),
      host: envString('HOST', '127.0.0.1'),
      corsOrigins: envList('CORS_ORIGIN', ['http://localhost:17011']),
      apiPrefix: envString('API_PREFIX', '/hearth-api'),
      bodyLimitBytes: envLimit('API_BODY_LIMIT_MB', 2, MB),
    },
    storage: {
      roots,
      defaultRootId: defaultRoot.id,
      dataDirectory: envPath('DATA_DIRECTORY', './server/data'),
      tempDirectory: envPath('TEMP_DIRECTORY', './server/temp'),
      backgroundsDirectory: envPath('BACKGROUNDS_DIRECTORY', './server/backgrounds'),
      streamBufferBytes: {
        video: envInt('STREAM_BUFFER_VIDEO', MB),
        audio: envInt('STREAM_BUFFER_AUDIO', 256 * KB),
        default: envInt('STREAM_BUFFER_DEFAULT', 64 * KB),
      },
    },
    auth: {
      sessionExpiryMs: envLimit('SESSION_EXPIRY_HOURS', 24, HOUR_MS),
      cookieName: envString('SESSION_COOKIE_NAME', 'hearth_session'),
      cookieSecure: envBool('SESSION_COOKIE_SECURE', false),
      staticUsers: parseStaticUsers(envString('USER_RULES', '')),
      usersFile: envPath('USERS_FILE', './server/data/users.json'),
      permissionsFile: envPath('PERMISSIONS_FILE', './server/data/permissions.json'),
      redisUrl: envOptional('REDIS_URL'),
      // Set it explicitly for media URLs to survive a restart.
      mediaTokenSecret: envString('MEDIA_TOKEN_SECRET', crypto.randomBytes(32).toString('hex')),
      mediaTokenTtlSeconds: envLimit('MEDIA_TOKEN_TTL', 3600),
    },
    listing: {
      maxEntries: envLimit('LISTING_MAX_ENTRIES', 20_000),
      maxBatchItems: envLimit('BATCH_MAX_ITEMS', 1000),
    },
    upload: {
      maxFileSizeBytes: envLimit('MAX_UPLOAD_SIZE_MB', 10_240, MB),
      maxFilesPerRequest: envLimit('MAX_UPLOAD_FILES', 0),
      chunkDirectory: envPath('CHUNK_UPLOAD_DIR', './server/temp/chunks'),
      chunkSizeBytes: envInt('CHUNK_SIZE_MB', 10) * MB,
      chunkSessionTimeoutMs: envLimit('CHUNK_UPLOAD_TIMEOUT_HOURS', 24, HOUR_MS),
      validateMagicNumber: envBool('MAGIC_NUMBER_VALIDATION', false),
      zipLinkTtlMs: envLimit('ZIP_LINK_TTL_MINUTES', 5, MINUTE_MS),
    },
    trash: {
      directory: envPath('RECYCLE_BIN_DIRECTORY', './server/data/trash'),
      enabled: envBool('RECYCLE_BIN_ENABLED', true),
      autoCleanup: envBool('RECYCLE_BIN_AUTO_CLEANUP', true),
      retentionDays: envLimit('RECYCLE_BIN_RETENTION_DAYS', 30),
      maxSizeBytes: envLimit('RECYCLE_BIN_MAX_SIZE_MB', 1024, MB),
    },
    search: {
      provider: envEnum('SEARCH_PROVIDER', ['everything', 'walk', 'auto'] as const, 'auto'),
      everythingUrl: envString('EVERYTHING_URL', 'http://127.0.0.1:8081'),
      everythingUsername: envOptional('EVERYTHING_USERNAME'),
      everythingPassword: envOptional('EVERYTHING_PASSWORD'),
      everythingTimeoutMs: envPositive('EVERYTHING_TIMEOUT_MS', 5000),
      maxResults: envLimitRenamed('SEARCH_MAX_RESULTS', 'EVERYTHING_MAX_RESULTS', 10_000),
      maxQueryLength: envLimit('SEARCH_MAX_QUERY_LENGTH', 512),
      probeCooldownMs: envInt('SEARCH_PROBE_COOLDOWN_MS', 5000),
    },
    media: {
      thumbnailCacheDirectory: envPath('THUMBNAIL_CACHE_DIR', './server/temp/thumbnails'),
      comicCacheDirectory: envPath('COMIC_CACHE_DIR', './server/temp/comics'),
      psdCacheDirectory: envPath('PSD_CACHE_DIR', './server/temp/psd'),
      subtitleCacheDirectory: envPath('SUBTITLE_CACHE_DIR', './server/temp/subtitles'),
      // Bare names resolve on PATH.
      ffmpegPath: envString('FFMPEG_PATH', 'ffmpeg'),
      ffprobePath: envString('FFPROBE_PATH', 'ffprobe'),
      transcodeCrf: envInt('TRANSCODE_CRF', 23),
      transcodePreset: envString('TRANSCODE_PRESET', 'veryfast'),
      thumbnailMaxWidth: envLimit('THUMBNAIL_MAX_WIDTH', 2048),
      maxTextBytes: envLimit('MAX_TEXT_SIZE_MB', 8, MB),
      maxTextSaveBytes: envLimit('MAX_TEXT_SAVE_SIZE_MB', 32, MB),
      archiveMaxEntries: envLimit('ARCHIVE_MAX_ENTRIES', 5000),
      archiveMaxMemberBytes: envLimit('ARCHIVE_MAX_MEMBER_SIZE_MB', 64, MB),
      folderCoverMaxDepth: envPositive('FOLDER_COVER_MAX_DEPTH', 2),
      folderCoverMaxBranches: envPositive('FOLDER_COVER_MAX_BRANCHES', 6),
    },
    cache: {
      thumbnailMaxAgeMs: envLimit('CACHE_THUMBNAIL_DAYS', 30, DAY_MS),
      comicMaxAgeMs: envLimit('CACHE_COMIC_DAYS', 7, DAY_MS),
      psdMaxAgeMs: envLimit('CACHE_PSD_DAYS', 7, DAY_MS),
      subtitleMaxAgeMs: envLimit('CACHE_SUBTITLE_DAYS', 30, DAY_MS),
    },
    ledger: {
      maxProgressEntries: envLimit('LEDGER_MAX_PROGRESS', 1000),
      maxSessions: envLimit('LEDGER_MAX_SESSIONS', 300),
      maxSessionBytes: envLimit('LEDGER_SESSION_MAX_KB', 512, KB),
    },
    rateLimits: {
      global: rateBucket('GLOBAL', 1000, 1),
      write: rateBucket('WRITE', 100, 1),
      search: rateBucket('SEARCH', 50, 1),
      login: rateBucket('LOGIN', 10, 5),
    },
    logging: {
      level: logLevel(),
      format: envString('LOG_FORMAT', 'pretty') === 'json' ? 'json' : 'pretty',
      directory: envPath('LOG_DIRECTORY', './server/logs'),
      toFile: envBool('LOG_TO_FILE', true),
    },
    viewers: {
      htmlViewerEnabled: envBool('HTML_VIEWER_ENABLED', true),
      htmlLocalResourcesEnabled: envBool('HTML_LOCAL_RESOURCES', true),
      htmlExternalResourcesEnabled: envBool('HTML_EXTERNAL_RESOURCES', false),
      htmlScriptsEnabled: envBool('HTML_SCRIPTS', false),
      htmlRuffleEnabled: envBool('HTML_RUFFLE', false),
      htmlVideoEnabled: envBool('HTML_VIDEO', false),
      ruffleDirectory: envPath('RUFFLE_DIRECTORY', './web/public/ruffle'),
    },
    adminOnly: envBool('ADMIN_ONLY_MODE', false),
  };

  return deepFreeze(config);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
