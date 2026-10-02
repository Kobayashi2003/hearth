import { describe, expect, it } from 'vitest';

import { kindleCover, type ReadAt } from '../../server/src/workers/kindle-cover.js';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

function u32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

/** A MOBI header record: the fields the cover needs, plus EXTH entries if any. */
function headerRecord(firstImage: number, exth: Array<[number, number]> | null): Uint8Array {
  const headerLength = 232;
  const record = new Uint8Array(16 + headerLength);
  record.set(
    [...'MOBI'].map(char => char.charCodeAt(0)),
    16,
  );
  record.set(u32(headerLength), 20);
  record.set(u32(firstImage), 108);
  record.set(u32(exth ? 0x40 : 0), 128);
  if (!exth) return record;
  const entries = exth.flatMap(([type, value]) => [...u32(type), ...u32(12), ...u32(value)]);
  const block = [...[...'EXTH'].map(char => char.charCodeAt(0)), ...u32(12 + entries.length)];
  return Uint8Array.from([...record, ...block, ...u32(exth.length), ...entries]);
}

/** A Palm database holding `records`, as a reader over its bytes. */
function book(records: Uint8Array[], type = 'BOOKMOBI'): { readAt: ReadAt; size: number } {
  const tableEnd = 78 + records.length * 8;
  const header = new Uint8Array(tableEnd);
  header.set(
    [...type].map(char => char.charCodeAt(0)),
    60,
  );
  header.set([(records.length >> 8) & 255, records.length & 255], 76);
  let offset = tableEnd;
  records.forEach((record, index) => {
    header.set(u32(offset), 78 + index * 8);
    offset += record.length;
  });
  const bytes = new Uint8Array(offset);
  bytes.set(header);
  let at = tableEnd;
  for (const record of records) {
    bytes.set(record, at);
    at += record.length;
  }
  return { readAt: (start, length) => bytes.slice(start, start + length), size: bytes.length };
}

const text = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);

describe('kindleCover', () => {
  it('finds the cover by its offset among the image records', () => {
    const { readAt, size } = book([headerRecord(2, [[201, 1]]), text, PNG, JPEG]);
    expect(kindleCover(readAt, size)).toEqual(JPEG);
  });

  it('falls back to the thumbnail when the cover offset leads nowhere', () => {
    const { readAt, size } = book([
      headerRecord(2, [
        [201, 9],
        [202, 0],
      ]),
      text,
      PNG,
      JPEG,
    ]);
    expect(kindleCover(readAt, size)).toEqual(PNG);
  });

  it('declines a record that is not an image rather than serving text as a cover', () => {
    const { readAt, size } = book([headerRecord(1, [[201, 0]]), text]);
    expect(kindleCover(readAt, size)).toBeNull();
  });

  it('has no cover without EXTH metadata', () => {
    const { readAt, size } = book([headerRecord(1, null), JPEG]);
    expect(kindleCover(readAt, size)).toBeNull();
  });

  it('is not fooled by other Palm databases or by a truncated file', () => {
    const other = book([headerRecord(1, [[201, 0]]), JPEG], 'TEXtREAd');
    expect(kindleCover(other.readAt, other.size)).toBeNull();
    const whole = book([headerRecord(1, [[201, 0]]), JPEG]);
    expect(kindleCover(whole.readAt, 60)).toBeNull();
  });
});
