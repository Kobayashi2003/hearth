import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * A name beside `file` that no other writer uses: two requests (or two worker
 * threads, which share a process id) writing the same file at once must not
 * write into, or rename away, each other's half-written copy.
 */
export function temporaryBeside(file: string): string {
  return `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
}

/** Written beside, then renamed: a reader never sees half a file. */
export async function writeFileAtomically(
  file: string,
  content: string | Uint8Array,
): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = temporaryBeside(file);
  try {
    await fsp.writeFile(temporary, content);
    await fsp.rename(temporary, file);
  } catch (error) {
    await fsp.rm(temporary, { force: true });
    throw error;
  }
}

export function writeFileAtomicallySync(file: string, content: Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = temporaryBeside(file);
  try {
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
