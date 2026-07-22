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

    const onAbort = (): void => {
      void worker.terminate();
      reject(new HearthError('ABORTED', 'The request was cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };

    worker.once('message', (value: Response) => {
      cleanup();
      resolve(value);
      void worker.terminate();
    });

    worker.once('error', error => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    worker.once('exit', code => {
      cleanup();
      // A non-zero exit before any message means the job never produced a result.
      if (code !== 0) reject(HearthError.internal('A background task failed'));
    });
  });
}
