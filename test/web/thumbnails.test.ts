import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Thumbnails from '@/lib/thumbnails';

/** The queue is module state: each test gets a fresh one. */
let loadThumbnail: typeof Thumbnails.loadThumbnail;
beforeEach(async () => {
  vi.resetModules();
  ({ loadThumbnail } = await import('@/lib/thumbnails'));
});

/** A fetch whose responses the test releases one by one, recording what was asked and dropped. */
function fakeFetch() {
  const started: string[] = [];
  const aborted: string[] = [];
  const pending = new Map<string, () => void>();
  vi.stubGlobal('fetch', (url: string, init: { signal: AbortSignal }) => {
    started.push(url);
    return new Promise<Response>((resolve, reject) => {
      pending.set(url, () => resolve(new Response(new Blob(['x']), { status: 200 })));
      init.signal.addEventListener('abort', () => {
        aborted.push(url);
        reject(init.signal.reason);
      });
    });
  });
  return {
    started,
    aborted,
    finish: (url: string) => pending.get(url)!(),
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve));

afterEach(() => vi.unstubAllGlobals());

describe('thumbnail queue', () => {
  it('keeps two connections free and serves the tiles laid out last first', async () => {
    const net = fakeFetch();
    const first = Array.from({ length: 6 }, (_, i) => `/t/top-${i}`);
    for (const url of first) void loadThumbnail(url, new AbortController().signal).catch(() => {});
    await tick();
    // A fling: a new screenful is laid out while the first is still queued.
    const second = Array.from({ length: 3 }, (_, i) => `/t/bottom-${i}`);
    for (const url of second) void loadThumbnail(url, new AbortController().signal).catch(() => {});

    expect(net.started).toEqual(first.slice(0, 4));
    net.finish('/t/top-0');
    await tick();
    expect(net.started.at(-1)).toBe('/t/bottom-0');
  });

  it('drops a waiting tile without asking for it, and aborts one in flight', async () => {
    const net = fakeFetch();
    const controllers = Array.from({ length: 5 }, () => new AbortController());
    const results = controllers.map((controller, i) =>
      loadThumbnail(`/t/gone-${i}`, controller.signal).catch(() => 'cancelled'),
    );
    await tick();
    controllers[4]!.abort(); // still waiting
    controllers[0]!.abort(); // in flight
    await expect(results[4]).resolves.toBe('cancelled');
    await expect(results[0]).resolves.toBe('cancelled');
    await tick();
    expect(net.started).not.toContain('/t/gone-4');
    expect(net.aborted).toEqual(['/t/gone-0']);
  });
});
