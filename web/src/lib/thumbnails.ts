import { useEffect, useState } from 'react';

/**
 * Thumbnails go through a queue of our own rather than plain `<img src>`.
 *
 * Over HTTP/1.1 a browser opens at most six connections to a server and hands
 * them out first come, first served. Left to `<img>`, a fling to the bottom of
 * a large folder queues every tile it passed, and the tiles on screen wait for
 * all of them; the folder listing and a preview wait behind them too. Here a
 * tile that leaves the screen withdraws its request (or aborts it, which also
 * stops the server's work on it), the newest tiles go first, and two
 * connections stay free for everything else.
 */
const MAX_ACTIVE = 4;

/** Recently shown thumbnails, so a tile scrolled back into view shows at once. */
const MAX_REMEMBERED = 600;

interface Job {
  url: string;
  /** Tiles mounted in the same task form a batch; the latest batch is what is on screen. */
  batch: number;
  sequence: number;
  signal: AbortSignal;
  resolve: (blob: Blob | null) => void;
  reject: (error: unknown) => void;
}

const waiting: Job[] = [];
let active = 0;
let batch = 0;
let batchOpen = false;
let sequence = 0;
/** `null` remembers "this file has no picture". */
const remembered = new Map<string, Blob | null>();

function remember(url: string, blob: Blob | null): void {
  remembered.delete(url);
  remembered.set(url, blob);
  if (remembered.size > MAX_REMEMBERED) {
    remembered.delete(remembered.keys().next().value!);
  }
}

/** The newest batch first; within a batch, top to bottom as the tiles were laid out. */
function next(): Job | undefined {
  let best = -1;
  for (let index = 0; index < waiting.length; index += 1) {
    const job = waiting[index]!;
    const current = waiting[best];
    if (!current || job.batch > current.batch) best = index;
    else if (job.batch === current.batch && job.sequence < current.sequence) best = index;
  }
  return best === -1 ? undefined : waiting.splice(best, 1)[0];
}

function pump(): void {
  while (active < MAX_ACTIVE) {
    const job = next();
    if (!job) return;
    active += 1;
    void fetchThumbnail(job.url, job.signal)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

async function fetchThumbnail(url: string, signal: AbortSignal): Promise<Blob | null> {
  const response = await fetch(url, { credentials: 'same-origin', signal });
  // 204: nothing to show, the tile keeps its icon.
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Thumbnail failed: ${response.status}`);
  return response.blob();
}

/** Fetch one thumbnail through the queue; aborting signal withdraws or cancels it. */
export function loadThumbnail(url: string, signal: AbortSignal): Promise<Blob | null> {
  if (!batchOpen) {
    batchOpen = true;
    batch += 1;
    setTimeout(() => (batchOpen = false));
  }
  return new Promise((resolve, reject) => {
    const job: Job = { url, batch, sequence: (sequence += 1), signal, resolve, reject };
    signal.addEventListener(
      'abort',
      () => {
        const index = waiting.indexOf(job);
        if (index !== -1) waiting.splice(index, 1);
        reject(signal.reason);
      },
      { once: true },
    );
    waiting.push(job);
    pump();
  });
}

export type ThumbnailState =
  | { status: 'loading' | 'none' | 'failed'; src: null; instant: false }
  /** `instant`: shown from memory, so it should not fade in. */
  | { status: 'ready'; src: string; instant: boolean };

const LOADING: ThumbnailState = { status: 'loading', src: null, instant: false };
const NONE: ThumbnailState = { status: 'none', src: null, instant: false };

/**
 * The thumbnail at `url` as an object URL, fetched through the queue while the
 * caller is mounted. No URL means the file has no picture to ask for.
 */
export function useThumbnail(url: string | null): ThumbnailState {
  // Tagged with its URL: a tile handed another file must not show the last
  // one's picture, whose object URL its cleanup has already revoked.
  const [shown, setShown] = useState<{ url: string; state: ThumbnailState } | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    const show = (blob: Blob | null, instant: boolean) => {
      if (!blob) {
        setShown({ url, state: NONE });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setShown({ url, state: { status: 'ready', src: objectUrl, instant } });
    };

    if (remembered.has(url)) show(remembered.get(url)!, true);
    else {
      loadThumbnail(url, controller.signal).then(
        blob => {
          remember(url, blob);
          if (!controller.signal.aborted) show(blob, false);
        },
        () => {
          if (!controller.signal.aborted) {
            setShown({ url, state: { status: 'failed', src: null, instant: false } });
          }
        },
      );
    }

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!url) return NONE;
  return shown?.url === url ? shown.state : LOADING;
}
