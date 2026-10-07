import { HearthError } from './errors.js';

interface Waiter {
  start: () => void;
  signal?: AbortSignal;
  onAbort: () => void;
}

/**
 * At most `limit` jobs at once; the rest wait, newest first, and a waiter whose
 * request is abandoned leaves the queue without ever starting. Newest first
 * because the requests that arrive last are for what is on screen now.
 */
export class Gate {
  private running = 0;
  private readonly waiting: Waiter[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.enter(signal);
    try {
      return await job();
    } finally {
      this.running -= 1;
      this.waiting.pop()?.start();
    }
  }

  private enter(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(cancelled());
    if (this.running < this.limit) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        start: () => {
          signal?.removeEventListener('abort', waiter.onAbort);
          this.running += 1;
          resolve();
        },
        onAbort: () => {
          const index = this.waiting.indexOf(waiter);
          if (index !== -1) this.waiting.splice(index, 1);
          reject(cancelled());
        },
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiting.push(waiter);
    });
  }
}

function cancelled(): HearthError {
  return new HearthError('ABORTED', 'The request was cancelled');
}
