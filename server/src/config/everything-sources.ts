import path from 'node:path';

import type { PathMap } from '../adapters/everything/path-map.js';
import { ConfigError, envKeys, envOptional, envString } from './env.js';

/** One Everything HTTP server, and the folder it answers for when it is on another machine. */
export interface EverythingSource {
  /** `local` for this machine's, otherwise the key in `EVERYTHING_REMOTE_<key>_URL`. */
  name: string;
  url: string;
  username: string | undefined;
  password: string | undefined;
  /** The folders it answers for; `null` for this machine's Everything, which sees paths as Hearth does. */
  maps: PathMap[] | null;
}

const REMOTE = 'EVERYTHING_REMOTE_';

function required(name: string): string {
  const value = envOptional(name);
  if (value === undefined) throw new ConfigError(name, 'required for this remote Everything');
  return value;
}

function remoteSource(key: string): EverythingSource {
  const variable = (field: string) => `${REMOTE}${key}_${field}`;

  const url = required(variable('URL'));
  try {
    new URL(url);
  } catch {
    throw new ConfigError(variable('URL'), `not a URL: "${url}"`);
  }

  return {
    name: key.toLowerCase(),
    url: url.replace(/\/+$/, ''),
    username: envOptional(variable('USERNAME')),
    password: envOptional(variable('PASSWORD')),
    maps: parsePaths(variable('PATHS'), required(variable('PATHS'))),
  };
}

/**
 * `local>remote` pairs separated by `|`, or a bare path where both sides spell
 * it alike (`F:\` mapped to the NAS's own `F:\`). Neither `|` nor `>` can occur
 * in a Windows path.
 */
function parsePaths(name: string, raw: string): PathMap[] {
  const maps = raw
    .split('|')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const [local = '', remote = local, extra] = item.split('>').map(part => part.trim());
      if (extra !== undefined) throw new ConfigError(name, `more than one ">" in "${item}"`);
      if (!path.isAbsolute(local)) {
        throw new ConfigError(name, `"${local}" is not an absolute path as Hearth reaches it`);
      }
      if (!path.win32.isAbsolute(remote)) {
        throw new ConfigError(name, `"${remote}" is not an absolute Windows path, e.g. D:\\Media`);
      }
      return { local: path.resolve(local), remote: path.win32.resolve(remote) };
    });
  if (maps.length === 0) throw new ConfigError(name, 'names no folder');
  return maps;
}

/** This machine's Everything first, then each `EVERYTHING_REMOTE_<key>_*` group. */
export function parseEverythingSources(): EverythingSource[] {
  return [
    {
      name: 'local',
      url: envString('EVERYTHING_URL', 'http://127.0.0.1:8081'),
      username: envOptional('EVERYTHING_USERNAME'),
      password: envOptional('EVERYTHING_PASSWORD'),
      maps: null,
    },
    ...envKeys(REMOTE, '_URL').map(remoteSource),
  ];
}
