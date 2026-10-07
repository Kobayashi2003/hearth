import { describe, expect, it } from 'vitest';

import { loggableUrl, prettyLine } from '../../server/src/lib/logger.js';

describe('loggableUrl', () => {
  it('hides media and site tokens and shows paths as they read', () => {
    expect(
      loggableUrl('/hearth-api/media/raw?path=%E5%90%8C%E4%BA%BA%2Fa+b.png&token=secret.sig'),
    ).toBe('/hearth-api/media/raw?path=同人/a b.png&token=[redacted]');
    expect(loggableUrl('/hearth-api/site/abc.def/pages/index.htm')).toBe(
      '/hearth-api/site/[token]/pages/index.htm',
    );
  });

  it('leaves a malformed escape as it came', () => {
    expect(loggableUrl('/hearth-api/files?path=%E5%90')).toBe('/hearth-api/files?path=%E5%90');
  });
});

describe('prettyLine', () => {
  const time = new Date(2026, 9, 7, 2, 36, 52).getTime();

  it('reads as time, level, module, message and the remaining fields', () => {
    const line = prettyLine(
      {
        level: 30,
        time,
        pid: 1,
        hostname: 'h',
        name: 'hearth',
        module: 'search',
        reqId: 'x',
        msg: 'request',
        status: 200,
        url: '/a',
      },
      false,
    );
    expect(line).toBe('02:36:52 INFO  [search] request status=200 url=/a');
  });

  it('puts an error stack under its line', () => {
    const line = prettyLine(
      { level: 50, time, msg: 'unhandled error', err: { stack: 'Error: boom\n    at x' } },
      false,
    );
    expect(line).toBe('02:36:52 ERROR unhandled error\n  Error: boom\n    at x');
  });
});
