import { parentPort, workerData } from 'node:worker_threads';

import PSD from 'psd';

/**
 * Photoshop documents rendered to PNG. Runs off the event loop because the
 * parser is synchronous and a layered PSD can be hundreds of megabytes.
 */
export interface PsdRequest {
  filePath: string;
}

export interface PsdResponse {
  /** PNG bytes of the composite image. */
  png: Uint8Array;
}

async function run(request: PsdRequest): Promise<PsdResponse> {
  const document = await PSD.open(request.filePath);
  // The flattened composite is what a viewer wants; individual layers are not
  // something Hearth exposes.
  const png = await document.image.toPng();
  return { png: Uint8Array.from(png.data as Buffer) };
}

void run(workerData as PsdRequest).then(response =>
  // Transferred rather than copied — a large composite is many megabytes.
  parentPort?.postMessage(response, [response.png.buffer as ArrayBuffer]),
);
