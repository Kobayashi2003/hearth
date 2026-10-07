import { describe, expect, it } from 'vitest';

import { Gate } from '../../server/src/lib/gate.js';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => (release = resolve));
  return { promise, release };
}

describe('Gate', () => {
  it('runs at most its limit at once, and the newest waiter next', async () => {
    const gate = new Gate(1);
    const order: string[] = [];
    const first = deferred();
    const running = gate.run(async () => {
      order.push('first');
      await first.promise;
    });
    const older = gate.run(async () => void order.push('older'));
    const newer = gate.run(async () => void order.push('newer'));
    await Promise.resolve();
    expect(order).toEqual(['first']);
    first.release();
    await Promise.all([running, older, newer]);
    expect(order).toEqual(['first', 'newer', 'older']);
  });

  it('never starts a job whose request was abandoned while it waited', async () => {
    const gate = new Gate(1);
    const blocker = deferred();
    const running = gate.run(() => blocker.promise);
    const controller = new AbortController();
    let started = false;
    const abandoned = gate.run(async () => void (started = true), controller.signal);
    controller.abort();
    await expect(abandoned).rejects.toMatchObject({ code: 'ABORTED' });
    blocker.release();
    await running;
    expect(started).toBe(false);
    // The slot it would have held is free.
    await expect(gate.run(async () => 'next')).resolves.toBe('next');
  });
});
