import { HearthError } from './errors.js';

/** Thrown when the client goes away mid-operation; never logged as an error. */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof HearthError && error.code === 'ABORTED'
  ) || (error as { name?: string } | undefined)?.name === 'AbortError';
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new HearthError('ABORTED', 'The request was cancelled');
}

/**
 * Combine a request's abort signal with a timeout, so a slow upstream cannot
 * hold a worker or child process open indefinitely.
 */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Resolve when the signal aborts — useful for racing against long work. */
export function onAbort(signal: AbortSignal | undefined, handler: () => void): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    handler();
    return () => {};
  }
  signal.addEventListener('abort', handler, { once: true });
  return () => signal.removeEventListener('abort', handler);
}
