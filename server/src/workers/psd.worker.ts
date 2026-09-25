import { parentPort, workerData } from 'node:worker_threads';

import PSD from 'psd';

import { rethrow } from './comic-pages.js';

/** The flattened composite of a PSD, as PNG. */
export interface PsdRequest {
  filePath: string;
}

export interface PsdResponse {
  png: Uint8Array;
}

async function run(request: PsdRequest): Promise<PsdResponse> {
  const document = await PSD.open(request.filePath);
  const png = await document.image.toPng();
  return { png: Uint8Array.from(png.data as Buffer) };
}

run(workerData as PsdRequest).then(
  response => parentPort?.postMessage(response, [response.png.buffer as ArrayBuffer]),
  rethrow,
);
