import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { HearthError } from './errors.js';

const thisFile = fileURLToPath(import.meta.url);
const workerDirectory = path.resolve(thisFile, '../../workers');
/** `.ts` under tsx in development, `.js` from the build. */
const workerExtension = path.extname(thisFile);

/**
 * Run one CPU-bound job on a fresh worker thread. Jobs are seconds long and
 * rare, so a pool is not worth its lifecycle. Aborting terminates the worker,
 * the only reliable way to stop synchronous work already in progress.
 */
export function runWorker<Request, Response>(
  workerName: string,
  request: Request,
  signal?: AbortSignal,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new HearthError('ABORTED', 'The request was cancelled'));
      return;
    }

    const worker = new Worker(
      path.join(workerDirectory, `${workerName}.worker${workerExtension}`),
      {
        workerData: request,
      },
    );

    // terminate() after a result exits non-zero; only the first outcome counts.
    let settled = false;
    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      action();
    };

    function onAbort(): void {
      settle(() => reject(new HearthError('ABORTED', 'The request was cancelled')));
      void worker.terminate();
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.once('message', (value: Response) => {
      settle(() => resolve(value));
      void worker.terminate();
    });
    worker.once('error', error => {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
    worker.once('exit', () => {
      settle(() => reject(HearthError.internal('A background task produced no result')));
    });
  });
}
