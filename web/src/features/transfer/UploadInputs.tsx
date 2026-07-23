import type { RefObject } from 'react';

import { collectPickedFiles, type QueuedFile } from './useUploads';

/**
 * The two hidden file inputs the toolbar and command palette trigger — one for
 * files, one for a whole folder (`webkitdirectory`). Kept together so the
 * picker plumbing stays out of the explorer's render.
 */
export function UploadInputs({
  fileRef,
  folderRef,
  onFiles,
}: {
  fileRef: RefObject<HTMLInputElement | null>;
  folderRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: QueuedFile[]) => void;
}) {
  const handle = (input: HTMLInputElement) => {
    if (input.files) onFiles(collectPickedFiles(input.files));
    input.value = '';
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={event => handle(event.target)}
      />
      <input
        ref={folderRef}
        type="file"
        hidden
        // Not a standard attribute; React needs it spelled this way.
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={event => handle(event.target)}
      />
    </>
  );
}
