import { useRef, useState } from 'react';

import { collectDroppedFiles, type QueuedFile } from './useUploads';

/**
 * Full-window file drop. Drag events bubble from nested elements, so a depth
 * counter tracks the outermost enter/leave rather than flickering the overlay as
 * the pointer crosses children.
 */
export function useDropZone(enabled: boolean, onFiles: (files: QueuedFile[]) => void) {
  const [isActive, setActive] = useState(false);
  const depth = useRef(0);

  const handlers = enabled
    ? {
        onDragEnter: (event: React.DragEvent) => {
          event.preventDefault();
          depth.current += 1;
          if (event.dataTransfer.types.includes('Files')) setActive(true);
        },
        onDragOver: (event: React.DragEvent) => event.preventDefault(),
        onDragLeave: () => {
          depth.current -= 1;
          if (depth.current <= 0) setActive(false);
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          depth.current = 0;
          setActive(false);
          void collectDroppedFiles(event.dataTransfer).then(onFiles);
        },
      }
    : {};

  return { isActive, handlers };
}
