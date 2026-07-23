import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import {
  ConfigError,
  envBool,
  envEnum,
  envInt,
  envList,
  envOptional,
  envPath,
  envString,
  projectRoot,
} from './env.js';

export interface RootConfig {
  /** Stable id derived from the absolute path, so it survives reordering. */
  id: string;
  absolutePath: string;
  label: string;
}

export type SearchProviderChoice = 'everything' | 'walk' | 'auto';

export interface AppConfig {
  readonly projectRoot: string;
  readonly server: {
    readonly port: number;
    readonly host: string;
    readonly corsOrigins: readonly string[];
    /**
     * Public path prefix the API is reached under. App-scoped (`/hearth-api`)
     * rather than a generic `/api`, because under the AppGateway every app
     * shares one origin and a generic prefix would collide.
     */
    readonly apiPrefix: string;
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
  readonly upload: {
    readonly maxFileSizeBytes: number;
    readonly maxFilesPerRequest: number;
    readonly chunkDirectory: string;
    readonly chunkSizeBytes: number;
    readonly chunkSessionTimeoutMs: number;
    readonly validateMagicNumber: boolean;
  };
  readonly trash: {
    readonly directory: string;
    readonly enabled: boolean;
    readonly autoCleanup: boolean;
    readonly retentionDays: number;
    readonly maxSizeMB: number;
  };
  readonly search: {
    readonly provider: SearchProviderChoice;
    readonly everythingUrl: string;
    readonly everythingUsername: string | undefined;
    readonly everythingPassword: string | undefined;
    readonly everythingTimeoutMs: number;
    readonly everythingMaxResults: number;
    /** Backoff before re-probing Everything after a failure. */
    readonly probeCooldownMs: number;
  };
  readonly media: {
    readonly thumbnailCacheDirectory: string;
    readonly thumbnailForAnimatedGif: boolean;
    readonly comicCacheDirectory: string;
    readonly psdCacheDirectory: string;
    readonly ffmpegPath: string;
    readonly ffprobePath: string;
    readonly transcodeCrf: number;
    readonly transcodePreset: string;
    /** Largest file the text viewer will read into memory. */
    readonly maxTextBytes: number;
  };
  readonly limits: {
    readonly globalMax: number;
    readonly globalWindowMs: number;
    readonly writeMax: number;
    readonly writeWindowMs: number;
    readonly searchMax: number;
    readonly searchWindowMs: number;
    readonly loginMax: number;
    readonly loginWindowMs: number;
  };
  readonly logging: {
    readonly level: string;
    readonly directory: string;
    readonly toFile: boolean;
  };
  readonly viewers: {
    readonly htmlViewerEnabled: boolean;
    readonly htmlExternalResourcesEnabled: boolean;
  };
  readonly adminOnly: boolean;
}

export interface StaticUser {
  username: string;
  /** Plain text or a bcrypt hash. */
  password: string;
  permissions: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Parse `USER_RULES` — "user:pass:perms" entries joined by ';' (',' accepted
 * when no semicolon is present). The password may itself contain ':', so it is
 * everything between the first and last separator.
 */
function parseStaticUsers(raw: string): StaticUser[] {
  if (!raw.trim()) return [];
  const delimiter = raw.includes(';') ? ';' : ',';
  const users: StaticUser[] = [];

  for (const entry of raw.split(delimiter)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(':');
    if (parts.length < 3) {
      throw new ConfigError('USER_RULES', `entry "${trimmed}" is not "user:pass:perms"`);
    }
    users.push({
      username: parts[0]!.trim(),
      password: parts.slice(1, -1).join(':'),
      permissions: parts[parts.length - 1]!.trim(),
    });
  }
  return users;
}

function rootIdFor(absolutePath: string): string {
  return crypto.createHash('sha1').update(absolutePath.toLowerCase()).digest('hex').slice(0, 12);
}

/** Resolve, deduplicate (case-insensitively on Windows), and validate roots. */
function parseRoots(): RootConfig[] {
  const configured = envList('ROOT_DIRECTORIES');
  const fallback = envPath('BASE_DIRECTORY', './example');
  const rawPaths = configured.length > 0 ? configured : [fallback];

  const seen = new Set<string>();
  const roots: RootConfig[] = [];

  for (const raw of rawPaths) {
    const absolutePath = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
    const key = absolutePath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push({
      id: rootIdFor(absolutePath),
      absolutePath,
      label: path.basename(absolutePath) || absolutePath,
    });
  }

  if (roots.length === 0) throw new ConfigError('ROOT_DIRECTORIES', 'no root directory resolved');
  return roots;
}

function bytesFromMB(name: string, fallbackMB: number): number {
  const mb = envInt(name, fallbackMB);
  if (mb < 0) throw new ConfigError(name, 'must be zero or positive');
  return mb === 0 ? Number.POSITIVE_INFINITY : mb * 1024 * 1024;
}

export function loadConfig(): AppConfig {
  const roots = parseRoots();
  const requestedDefault = envOptional('BASE_DIRECTORY');
  const defaultRoot = requestedDefault
    ? (roots.find(
        r => r.absolutePath.toLowerCase() === path.resolve(projectRoot, requestedDefault).toLowerCase(),
      ) ?? roots[0]!)
    : roots[0]!;

  const config: AppConfig = {
    projectRoot,
    server: {
      port: envInt('PORT', 5111),
      // Loopback only: every request, media bytes included, arrives via the Caddy edge.
      host: envString('HOST', '127.0.0.1'),
      corsOrigins: envList('CORS_ORIGIN', ['http://localhost:5110']),
      apiPrefix: envString('API_PREFIX', '/hearth-api'),
    },
    storage: {
      roots,
      defaultRootId: defaultRoot.id,
      dataDirectory: envPath('DATA_DIRECTORY', './server/data'),
      tempDirectory: envPath('TEMP_DIRECTORY', './server/temp'),
      backgroundsDirectory: envPath('BACKGROUNDS_DIRECTORY', './server/backgrounds'),
      streamBufferBytes: {
        video: envInt('STREAM_BUFFER_VIDEO', 1024 * 1024),
        audio: envInt('STREAM_BUFFER_AUDIO', 256 * 1024),
        default: envInt('STREAM_BUFFER_DEFAULT', 64 * 1024),
      },
    },
    auth: {
      sessionExpiryMs: envInt('SESSION_EXPIRY_HOURS', 24) * HOUR_MS,
      cookieName: envString('SESSION_COOKIE_NAME', 'hearth_session'),
      cookieSecure: envBool('SESSION_COOKIE_SECURE', false),
      staticUsers: parseStaticUsers(envString('USER_RULES', '')),
      usersFile: envPath('USERS_FILE', './server/data/users.json'),
      permissionsFile: envPath('PERMISSIONS_FILE', './server/data/permissions.json'),
      redisUrl: envOptional('REDIS_URL'),
      // A generated secret is fine for a single process; set it to survive restarts.
      mediaTokenSecret: envString('MEDIA_TOKEN_SECRET', crypto.randomBytes(32).toString('hex')),
      mediaTokenTtlSeconds: envInt('MEDIA_TOKEN_TTL', 3600),
    },
    upload: {
      maxFileSizeBytes: bytesFromMB('MAX_UPLOAD_SIZE_MB', 10240),
      maxFilesPerRequest: envInt('MAX_UPLOAD_FILES', 0),
      chunkDirectory: envPath('CHUNK_UPLOAD_DIR', './server/temp/chunks'),
      chunkSizeBytes: envInt('CHUNK_SIZE_MB', 10) * 1024 * 1024,
      chunkSessionTimeoutMs: envInt('CHUNK_UPLOAD_TIMEOUT_HOURS', 24) * HOUR_MS,
      validateMagicNumber: envBool('MAGIC_NUMBER_VALIDATION', false),
    },
    trash: {
      directory: envPath('RECYCLE_BIN_DIRECTORY', './server/data/trash'),
      enabled: envBool('RECYCLE_BIN_ENABLED', true),
      autoCleanup: envBool('RECYCLE_BIN_AUTO_CLEANUP', true),
      retentionDays: envInt('RECYCLE_BIN_RETENTION_DAYS', 30),
      maxSizeMB: envInt('RECYCLE_BIN_MAX_SIZE_MB', 1024),
    },
    search: {
      provider: envEnum('SEARCH_PROVIDER', ['everything', 'walk', 'auto'] as const, 'auto'),
      everythingUrl: envString('EVERYTHING_URL', 'http://127.0.0.1:8081'),
      everythingUsername: envOptional('EVERYTHING_USERNAME'),
      everythingPassword: envOptional('EVERYTHING_PASSWORD'),
      everythingTimeoutMs: envInt('EVERYTHING_TIMEOUT_MS', 5000),
      everythingMaxResults: envInt('EVERYTHING_MAX_RESULTS', 10000),
      probeCooldownMs: envInt('SEARCH_PROBE_COOLDOWN_MS', 5000),
    },
    media: {
      thumbnailCacheDirectory: envPath('THUMBNAIL_CACHE_DIR', './server/temp/thumbnails'),
      thumbnailForAnimatedGif: envBool('THUMBNAIL_FOR_GIF', false),
      comicCacheDirectory: envPath('COMIC_CACHE_DIR', './server/temp/comics'),
      psdCacheDirectory: envPath('PSD_CACHE_DIR', './server/temp/psd'),
      // Bare names resolve on PATH, which is the usual install shape on Windows.
      ffmpegPath: envString('FFMPEG_PATH', 'ffmpeg'),
      ffprobePath: envString('FFPROBE_PATH', 'ffprobe'),
      transcodeCrf: envInt('TRANSCODE_CRF', 23),
      transcodePreset: envString('TRANSCODE_PRESET', 'veryfast'),
      maxTextBytes: bytesFromMB('MAX_TEXT_SIZE_MB', 8),
    },
    limits: {
      globalMax: envInt('RATE_LIMIT_GLOBAL_MAX', 1000),
      globalWindowMs: envInt('RATE_LIMIT_GLOBAL_WINDOW_MINUTES', 1) * MINUTE_MS,
      writeMax: envInt('RATE_LIMIT_WRITE_MAX', 100),
      writeWindowMs: envInt('RATE_LIMIT_WRITE_WINDOW_MINUTES', 1) * MINUTE_MS,
      searchMax: envInt('RATE_LIMIT_SEARCH_MAX', 50),
      searchWindowMs: envInt('RATE_LIMIT_SEARCH_WINDOW_MINUTES', 1) * MINUTE_MS,
      loginMax: envInt('RATE_LIMIT_LOGIN_MAX', 10),
      loginWindowMs: envInt('RATE_LIMIT_LOGIN_WINDOW_MINUTES', 5) * MINUTE_MS,
    },
    logging: {
      level: envString('LOG_LEVEL', 'info'),
      directory: envPath('LOG_DIRECTORY', './server/logs'),
      toFile: envBool('LOG_TO_FILE', true),
    },
    viewers: {
      htmlViewerEnabled: envBool('HTML_VIEWER_ENABLED', true),
      htmlExternalResourcesEnabled: envBool('HTML_EXTERNAL_RESOURCES', false),
    },
    adminOnly: envBool('ADMIN_ONLY_MODE', false),
  };

  assertRootsExist(config);
  return deepFreeze(config);
}

/** Fail loudly at startup rather than on the first request. */
function assertRootsExist(config: AppConfig): void {
  const missing = config.storage.roots.filter(root => {
    try {
      return !fs.statSync(root.absolutePath).isDirectory();
    } catch {
      return true;
    }
  });
  if (missing.length > 0) {
    throw new ConfigError(
      'ROOT_DIRECTORIES',
      `not a readable directory: ${missing.map(r => r.absolutePath).join(', ')}`,
    );
  }
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

export type { AppConfig as HearthConfig };
