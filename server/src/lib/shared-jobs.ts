import { HearthError } from './errors.js';

interface Shared<T> {
  result: Promise<T>;
  controller: AbortController;
  waiting: number;
}

/**
 * One run of a job per key, however many ask for it at once. Each asker can
 * leave on its own signal without cancelling it for the rest; once every one
 * has left, the job's own signal aborts so the work stops.
 */
export class SharedJobs<T> {
  private readonly running = new Map<string, Shared<T>>();

  async run(
    key: string,
    job: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) throw cancelled();
    let shared = this.running.get(key);
    if (!shared) {
      const controller = new AbortController();
      const result = job(controller.signal).finally(() => {
        if (this.running.get(key) === created) this.running.delete(key);
      });
      const created: Shared<T> = { result, controller, waiting: 0 };
      shared = created;
      this.running.set(key, shared);
    }
    return this.wait(key, shared, signal);
  }

  private wait(key: string, shared: Shared<T>, signal?: AbortSignal): Promise<T> {
    shared.waiting += 1;
    return new Promise<T>((resolve, reject) => {
      let left = false;
      const leave = () => {
        if (left) return;
        left = true;
        signal?.removeEventListener('abort', onAbort);
        shared.waiting -= 1;
      };
      const onAbort = () => {
        leave();
        reject(cancelled());
        if (shared.waiting === 0) {
          // Nobody wants it any more; a later asker starts afresh.
          if (this.running.get(key) === shared) this.running.delete(key);
          shared.controller.abort();
        }
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      shared.result.then(
        value => {
          leave();
          resolve(value);
        },
        (error: unknown) => {
          leave();
          reject(error);
        },
      );
    });
  }
}

function cancelled(): HearthError {
  return new HearthError('ABORTED', 'The request was cancelled');
}
