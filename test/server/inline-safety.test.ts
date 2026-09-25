import { describe, expect, it } from 'vitest';

import { inlineSafetyHeaders } from '../../server/src/lib/mime.js';

describe('inlineSafetyHeaders', () => {
  it('sandboxes documents that could run script on the app origin', () => {
    for (const mime of [
      'text/html',
      'image/svg+xml',
      'application/xhtml+xml',
      'text/xml',
      'text/plain',
    ]) {
      expect(inlineSafetyHeaders(mime)).toEqual({ 'Content-Security-Policy': 'sandbox' });
    }
  });

  it('leaves PDF alone, which browsers refuse to render in a sandbox', () => {
    expect(inlineSafetyHeaders('application/pdf')).toEqual({});
  });
});
