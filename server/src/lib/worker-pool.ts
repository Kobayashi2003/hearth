import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { HearthError } from './errors.js';

/**
 * Run one CPU-bound job on a worker thread. A worker is created per job rather
 * than pooled: these jobs are seconds long and infrequent, so the ~30 ms start
 * cost is irrelevant next to the simplicity of not managing pool lifecycles.
 *
 * Aborting terminates the worker, which is the only reliable way to stop
 * synchronous work already in progress.
 */
const thisFile = fileURLToPath(import.meta.url);
const workerDirectory = path.resolve(thisFile, '../../workers');
/** `.ts` when running under tsx in development, `.js` from the built output. */
const workerExtension = path.extname(thisFile);

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

    const worker = new Worker(path.join(workerDirectory, `${workerName}.worker${workerExtension}`), {
      workerData: request,
    });

    // `terminate()` after a successful message produces a non-zero exit code,
    // which must not be read as a failure.
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

    worker.once('exit', code => {
      // Reaching here unsettled means the job exited without producing a result.
      if (code !== 0) settle(() => reject(HearthError.internal('A background task failed')));
      else settle(() => reject(HearthError.internal('A background task produced no result')));
    });
  });
}
