import zlib from 'node:zlib';

import iconv from 'iconv-lite';
import type { IZipEntry } from 'adm-zip';
import { describe, expect, it } from 'vitest';

import { declaredHtmlCharset, decodeText } from '../../server/src/lib/charset.js';
import { zipEntryNames } from '../../server/src/workers/comic-pages.js';

/** Just the fields zipEntryNames reads. */
function entry(raw: Buffer, utf8Flag: boolean, extra = Buffer.alloc(0)): IZipEntry {
  return {
    rawEntryName: raw,
    header: { flags: utf8Flag ? 0x800 : 0 },
    extra,
  } as unknown as IZipEntry;
}

/** Info-ZIP's Unicode Path field: version 1, the CRC-32 of `legacy`, then `name` in UTF-8. */
function unicodePath(legacy: Buffer, name: string, crc = zlib.crc32(legacy)): Buffer {
  const body = Buffer.concat([Buffer.from([1]), Buffer.alloc(4), Buffer.from(name, 'utf8')]);
  body.writeUInt32LE(crc, 1);
  const header = Buffer.alloc(4);
  header.writeUInt16LE(0x7075, 0);
  header.writeUInt16LE(body.length, 2);
  return Buffer.concat([header, body]);
}

describe('zipEntryNames', () => {
  it('decodes unflagged names in the code page the archive was made with', () => {
    const names = ['图片01.jpg', '第一章/封面.jpg', '第一章/正文.txt'];
    const entries = names.map(name => entry(iconv.encode(name, 'gb18030'), false));
    expect([...zipEntryNames(entries).values()]).toEqual(names);
  });

  it('decodes Shift_JIS names from a Japanese archive', () => {
    const names = ['第1話/表紙.jpg', '第1話/001.jpg', 'あとがき.txt'];
    const entries = names.map(name => entry(iconv.encode(name, 'shift_jis'), false));
    expect([...zipEntryNames(entries).values()]).toEqual(names);
  });

  it('reads names in Chinese whose only ideographs are rare, not as Korean', () => {
    // Photoshop's "拷贝" (copy) in GBK is two valid EUC-KR syllables too: 옙굔.
    const names = ['SR/yuantu2k_0000s_0000_00 拷贝.jpg', 'SR/yuantu2k_0000s_0001_00 拷贝 2.jpg'];
    const entries = names.map(name => entry(iconv.encode(name, 'gbk'), false));
    expect([...zipEntryNames(entries).values()]).toEqual(names);
  });

  it("takes the archive's own UTF-8 name when it still matches the legacy one", () => {
    const legacy = iconv.encode('拷贝.jpg', 'gbk');
    const named = entry(legacy, false, unicodePath(legacy, '拷贝.jpg'));
    // One that was renamed since: its CRC no longer matches, so the legacy name is decoded.
    const stale = entry(legacy, false, unicodePath(legacy, 'old name.jpg', 1));
    expect([...zipEntryNames([named, stale]).values()]).toEqual(['拷贝.jpg', '拷贝.jpg']);
  });

  it('trusts the UTF-8 flag', () => {
    const entries = [entry(Buffer.from('中文.txt', 'utf8'), true)];
    expect([...zipEntryNames(entries).values()]).toEqual(['中文.txt']);
  });
});

describe('HTML charset', () => {
  it('reads the declared charset and decodes with it', () => {
    const page = iconv.encode(
      '<html><head><meta charset="gbk"></head><body>中文页面</body></html>',
      'gbk',
    );
    const charset = declaredHtmlCharset(page);
    expect(charset).toBe('gbk');
    expect(decodeText(page, charset!)).toContain('中文页面');
  });

  it('ignores a charset iconv does not know', () => {
    expect(declaredHtmlCharset(Buffer.from('<meta charset="x-unknown">'))).toBeNull();
  });
});
