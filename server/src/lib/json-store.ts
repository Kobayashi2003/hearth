import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Written to a sibling temp file and renamed, so a crash cannot truncate the previous copy. */
export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tempPath, filePath);
}

/** One JSON file with an in-memory copy and serialised writes. */
export class JsonDocument<T> {
  private cache: T | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly initial: () => T,
  ) {}

  read(): T {
    this.cache ??= readJsonFile<T>(this.filePath) ?? this.initial();
    return this.cache;
  }

  async update(mutate: (current: T) => T): Promise<T> {
    const next = mutate(this.read());
    this.cache = next;

    // Chain on the previous write whether it failed or not, so one disk error
    // does not poison every later update.
    const write = this.pending.then(
      () => writeJsonFileAtomic(this.filePath, next),
      () => writeJsonFileAtomic(this.filePath, next),
    );
    this.pending = write.catch(() => undefined);

    try {
      await write;
    } catch (error) {
      this.cache = null;
      throw error;
    }
    return next;
  }
}

/** One JSON document per user in a directory, named reversibly after the username. */
export class UserDocuments<T> {
  private readonly documents = new Map<string, JsonDocument<T>>();

  constructor(
    private readonly directory: string,
    private readonly initial: () => T,
  ) {}

  for(username: string): JsonDocument<T> {
    let document = this.documents.get(username);
    if (!document) {
      document = new JsonDocument<T>(
        path.join(this.directory, `${encodeUsername(username)}.json`),
        this.initial,
      );
      this.documents.set(username, document);
    }
    return document;
  }

  async usernames(): Promise<string[]> {
    let names: string[];
    try {
      names = await fsp.readdir(this.directory);
    } catch {
      return [];
    }
    return names
      .filter(name => name.endsWith('.json'))
      .map(name => decodeUsername(name.slice(0, -'.json'.length)));
  }
}

function encodeUsername(username: string): string {
  return username.replace(
    /[^A-Za-z0-9._-]/g,
    character => `~${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function decodeUsername(encoded: string): string {
  return encoded.replace(/~([0-9a-f]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}
