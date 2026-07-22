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

  it('falls back to a legacy encoding for bytes that are not valid UTF-8', () => {
    // GB18030 and Shift_JIS both produce byte sequences UTF-8 cannot decode.
    expect(detectEncoding(iconv.encode('中文测试', 'gb18030'))).toBe('win1252');
    expect(detectEncoding(iconv.encode('日本語テスト', 'shift_jis'))).toBe('win1252');
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
