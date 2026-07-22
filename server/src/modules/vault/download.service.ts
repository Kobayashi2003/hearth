import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import archiver from 'archiver';

import { HearthError } from '../../lib/errors.js';
import type { SafePath, Vault } from '../../lib/vault.js';

interface ZipTicket {
  token: string;
  username: string;
  /** Root-relative paths, re-resolved when the download actually starts. */
  paths: string[];
  archiveName: string;
  rootId: string;
  expiresAt: number;
}

/**
 * A ticket lives just long enough for the browser to follow the URL it was
 * handed. Downloads must be a plain navigation so the browser owns the save
 * dialog and the progress UI, which rules out sending a request body — hence
 * the two-step exchange.
 */
const TICKET_TTL_MS = 5 * 60 * 1000;

export class DownloadService {
  private readonly tickets = new Map<string, ZipTicket>();

  constructor(private readonly vault: Vault) {}

  issueZipTicket(
    username: string,
    relativePaths: string[],
    archiveName: string,
    rootId: string,
  ): { token: string; expiresAt: Date } {
    this.sweepExpired();

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + TICKET_TTL_MS;
    this.tickets.set(token, {
      token,
      username,
      paths: relativePaths,
      archiveName,
      rootId,
      expiresAt,
    });

    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Single use: redeeming removes the ticket so a leaked URL cannot be replayed. */
  redeem(token: string, rootId: string): ZipTicket {
    const ticket = this.tickets.get(token);
    if (!ticket || ticket.expiresAt < Date.now()) {
      this.tickets.delete(token);
      throw HearthError.notFound('That download link has expired');
    }
    if (ticket.rootId !== rootId) {
      throw HearthError.badRequest('The active root changed since that link was created');
    }
    this.tickets.delete(token);
    return ticket;
  }

  /**
   * A readable ZIP of `sources`. Entries are read and compressed as the socket
   * drains them — nothing is staged on disk or buffered whole, so a 10 GiB
   * folder costs a constant amount of memory.
   */
  async createZipStream(sources: SafePath[], signal: AbortSignal): Promise<Readable> {
    // Deflating already-compressed media costs CPU for almost no saving; a low
    // level keeps the archive flowing at disk speed.
    const archive = archiver('zip', { zlib: { level: 1 } });

    signal.addEventListener('abort', () => archive.abort(), { once: true });

    // Collision-free names: two selected files can share a basename.
    const usedNames = new Set<string>();
    for (const source of sources) {
      const stats = await fsp.stat(source);
      const name = uniqueEntryName(usedNames, path.basename(source));
      if (stats.isDirectory()) {
        archive.directory(source, name);
      } else {
        archive.file(source, { name });
      }
    }

    // Not awaited: finalising drives the stream the caller is about to read.
    void archive.finalize();
    return archive;
  }

  /** Resolve a ticket's paths at download time, re-checking every one. */
  resolveTicketPaths(ticket: ZipTicket): SafePath[] {
    return ticket.paths.map(relative => this.vault.resolve(relative));
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [token, ticket] of this.tickets) {
      if (ticket.expiresAt < now) this.tickets.delete(token);
    }
  }
}

/** A sensible archive name for whatever the user selected. */
export function suggestArchiveName(relativePaths: string[], requested: string | undefined): string {
  if (requested) return sanitizeArchiveName(requested);
  if (relativePaths.length === 1) {
    const only = relativePaths[0]!;
    return sanitizeArchiveName(path.basename(only) || 'hearth');
  }
  return 'hearth-selection';
}

/** Two selected files can share a basename; the archive needs distinct entries. */
function uniqueEntryName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let attempt = 2; ; attempt += 1) {
    const candidate = `${stem} (${attempt})${extension}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function sanitizeArchiveName(name: string): string {
  const trimmed = name.replace(/\.zip$/i, '').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : 'hearth';
}
