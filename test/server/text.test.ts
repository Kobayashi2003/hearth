import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';

import { detectEncoding } from '../../server/src/modules/kiln/text.service.js';

describe('detectEncoding', () => {
  it('trusts a UTF-8 byte-order mark', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello')]);
    expect(detectEncoding(buffer)).toBe('utf8');
  });

  it('trusts a UTF-16 byte-order mark', () => {
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x68, 0x00]))).toBe('utf16le');
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0x00, 0x68]))).toBe('utf16be');
  });

  it('recognises plain ASCII as UTF-8', () => {
    expect(detectEncoding(Buffer.from('const x = 1;\n'))).toBe('utf8');
  });

  it('recognises multi-byte UTF-8 without a mark', () => {
    expect(detectEncoding(Buffer.from('中文测试 — em dash', 'utf8'))).toBe('utf8');
  });

  it.each([
    ['中文测试，这是一个简单的句子。', 'gb18030'],
    ['這是一個繁體中文的句子，我們來測試。', 'big5'],
    ['日本語のテキストです。これはテスト。', 'shift_jis'],
    ['ソードアート・オンライン 第01巻', 'shift_jis'],
    ['한국어 텍스트입니다. 테스트.', 'euc-kr'],
  ])('recognises legacy CJK text: %s', (text, encoding) => {
    expect(detectEncoding(iconv.encode(text, encoding))).toBe(encoding);
  });

  it('falls back to Windows-1252 for Western text that is not UTF-8', () => {
    expect(detectEncoding(iconv.encode('café résumé naïve', 'win1252'))).toBe('win1252');
  });

  it('never throws on binary input', () => {
    expect(() => detectEncoding(Buffer.from([0x00, 0xff, 0x80, 0x01]))).not.toThrow();
  });

  it('tolerates a multi-byte sequence cut by the size cap', () => {
    // A UTF-8 file truncated mid-character must still be read as UTF-8.
    const full = Buffer.from('文字が並んでいる長い行', 'utf8');
    expect(detectEncoding(full.subarray(0, full.length - 1))).toBe('utf8');
  });
});

describe('legacy encodings round-trip', () => {
  it.each(['gb18030', 'shift_jis', 'win1252', 'utf8'])('decodes and re-encodes %s', encoding => {
    const original = encoding === 'win1252' ? 'café résumé' : '中文 test';
    const bytes = iconv.encode(original, encoding);
    expect(iconv.decode(bytes, encoding)).toBe(original);
  });
});
