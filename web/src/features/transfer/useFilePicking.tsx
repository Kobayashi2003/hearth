import { useCallback, useRef, useState, type DragEvent } from 'react';

import { collectDropped, fromInput, type QueuedFile } from './uploads';

/**
 * Files dropped onto an area. Drag events fire for every child crossed, so a
 * depth count tells leaving the area from moving inside it.
 */
export function useFileDrop(enabled: boolean, onFiles: (files: QueuedFile[]) => void) {
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);
  return {
    dropping,
    handlers: {
      onDragEnter(event: DragEvent) {
        if (!enabled || !event.dataTransfer.types.includes('Files')) return;
        depth.current += 1;
        setDropping(true);
      },
      onDragOver(event: DragEvent) {
        if (enabled) event.preventDefault();
      },
      onDragLeave() {
        depth.current -= 1;
        if (depth.current <= 0) setDropping(false);
      },
      onDrop(event: DragEvent) {
        if (!enabled) return;
        event.preventDefault();
        depth.current = 0;
        setDropping(false);
        void collectDropped(event.dataTransfer).then(onFiles);
      },
    },
  };
}

/** The browser's file and folder pickers, opened from anywhere by `pickFiles` / `pickFolder`. */
export function useUploadPickers(onFiles: (files: QueuedFile[]) => void) {
  const filesInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const take = (input: HTMLInputElement) => {
    onFiles(fromInput(input.files));
    // Cleared, so choosing the same file again still fires `change`.
    input.value = '';
  };
  const pickFiles = useCallback(() => filesInput.current?.click(), []);
  const pickFolder = useCallback(() => folderInput.current?.click(), []);
  return {
    pickFiles,
    pickFolder,
    inputs: (
      <>
        <input
          ref={filesInput}
          type="file"
          multiple
          hidden
          onChange={event => take(event.target)}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...{ webkitdirectory: '' }}
          onChange={event => take(event.target)}
        />
      </>
    ),
  };
}
