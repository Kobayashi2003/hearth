import fs from 'node:fs';

/**
 * The cover of a Kindle book (MOBI, AZW, AZW3), read without unpacking it.
 * These are Palm databases: a table of record offsets, a MOBI header in record
 * 0 naming the first image record, and EXTH metadata giving the cover's index
 * among the images. Image records hold the plain JPEG/PNG/GIF bytes, so finding
 * the cover takes three small reads however large the book is, and works for
 * the older Mobipocket books the reader itself cannot open.
 */

/** Reads `length` bytes at `offset`; fewer at the end of the file. */
export type ReadAt = (offset: number, length: number) => Uint8Array;

const PALM_HEADER_LENGTH = 78;
const NO_INDEX = 0xffffffff;
const EXTH_COVER_OFFSET = 201;
const EXTH_THUMBNAIL_OFFSET = 202;
/** Generous for a real book (tens of thousands); stops a corrupt count reading the whole file. */
const MAX_RECORDS = 0xffff;
const MAX_HEADER_RECORD = 64 * 1024;

const u16 = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!;
const u32 = (bytes: Uint8Array, at: number) =>
  ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

export function kindleCover(readAt: ReadAt, fileSize: number): Uint8Array | null {
  const recordRange = recordTable(readAt, fileSize);
  const first = recordRange?.(0);
  if (!recordRange || !first) return null;
  const record = readAt(first[0], Math.min(first[1] - first[0], MAX_HEADER_RECORD));
  if (record.length < 132 || ascii(record, 16, 20) !== 'MOBI') return null;

  const firstImage = u32(record, 108);
  if (firstImage === NO_INDEX) return null;
  const exth = readExth(record, 16 + u32(record, 20), (u32(record, 128) & 0x40) !== 0);

  // The cover, else the thumbnail: whichever leads to a real image.
  for (const type of [EXTH_COVER_OFFSET, EXTH_THUMBNAIL_OFFSET]) {
    const image = imageRecord(readAt, recordRange, firstImage, exth.get(type));
    if (image) return image;
  }
  return null;
}

function imageRecord(
  readAt: ReadAt,
  recordRange: RecordRange,
  firstImage: number,
  offset: number | undefined,
): Uint8Array | null {
  if (offset === undefined || offset === NO_INDEX) return null;
  const range = recordRange(firstImage + offset);
  if (!range) return null;
  const bytes = readAt(range[0], range[1] - range[0]);
  return isImage(bytes) ? bytes : null;
}

type RecordRange = (index: number) => [start: number, end: number] | null;

/** The Palm record table, as a lookup of each record's byte range; null if this is no Mobipocket book. */
function recordTable(readAt: ReadAt, fileSize: number): RecordRange | null {
  const header = readAt(0, PALM_HEADER_LENGTH);
  if (header.length < PALM_HEADER_LENGTH || ascii(header, 60, 68) !== 'BOOKMOBI') return null;
  const count = u16(header, 76);
  if (count === 0 || count > MAX_RECORDS) return null;

  const table = readAt(PALM_HEADER_LENGTH, count * 8);
  if (table.length < count * 8) return null;
  return index => {
    if (index < 0 || index >= count) return null;
    const start = u32(table, index * 8);
    const end = index + 1 < count ? u32(table, (index + 1) * 8) : fileSize;
    return start < end && end <= fileSize ? [start, end] : null;
  };
}
/** The numeric EXTH entries; the ones a cover needs are all four-byte numbers. */
function readExth(record: Uint8Array, offset: number, present: boolean): Map<number, number> {
  const entries = new Map<number, number>();
  if (!present || offset + 12 > record.length || ascii(record, offset, offset + 4) !== 'EXTH') {
    return entries;
  }
  const count = u32(record, offset + 8);
  let position = offset + 12;
  for (let index = 0; index < count && position + 8 <= record.length; index += 1) {
    const type = u32(record, position);
    const length = u32(record, position + 4);
    if (length < 8 || position + length > record.length) break;
    if (length === 12 && !entries.has(type)) entries.set(type, u32(record, position + 8));
    position += length;
  }
  return entries;
}

function isImage(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  const start = ascii(bytes, 0, 4);
  return start === '\x89PNG' || start === 'GIF8';
}

export function kindleCoverOfFile(filePath: string): Uint8Array | null {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const readAt: ReadAt = (offset, length) => {
      const buffer = Buffer.alloc(Math.max(0, Math.min(length, size - offset)));
      const read = fs.readSync(fd, buffer, 0, buffer.length, offset);
      return buffer.subarray(0, read);
    };
    return kindleCover(readAt, size);
  } finally {
    fs.closeSync(fd);
  }
}
