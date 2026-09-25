import iconv from 'iconv-lite';
import type { IZipEntry } from 'adm-zip';
import { describe, expect, it } from 'vitest';

import { declaredHtmlCharset, decodeText } from '../../server/src/lib/charset.js';
import { zipEntryNames } from '../../server/src/workers/comic-pages.js';

/** Just the two fields zipEntryNames reads. */
function entry(raw: Buffer, utf8Flag: boolean): IZipEntry {
  return { rawEntryName: raw, header: { flags: utf8Flag ? 0x800 : 0 } } as unknown as IZipEntry;
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
