import { useEffect, useRef, useState } from 'react';
import { ImageOff, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

import { mediaUrls } from '@/lib/api';
import { extensionOf } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { useKeyBindings } from '@/lib/keys';
import { useOverlay } from '../overlay';
import { usePreview } from '../PreviewProvider';
import { usePanZoom } from '../usePanZoom';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';

/** Photoshop files have no browser decoder; the server renders a large thumbnail instead. */
function sourceFor(path: string): string {
  return extensionOf(path) === '.psd' ? mediaUrls.thumbnail(path, 2048) : mediaUrls.raw(path);
}

export default function ImageViewer({ entry }: ViewerProps) {
  const { current } = usePreview();
  const { step } = useOverlay();
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const zoom = usePanZoom({
    stageRef,
    contentRef: imageRef,
    quarterTurns: rotation / 90,
    onWheelStep: step,
    onSwipe: side => step(side === 'left' ? 1 : -1),
  });
  const rotate = () => setRotation(previous => previous + 90);

  // Warm the neighbours so stepping through a folder of pictures shows the next
  // one at once; the browser reuses an image already decoded in this page.
  const gallery = current?.gallery;
  useEffect(() => {
    if (!gallery || gallery.length < 2) return;
    const index = gallery.findIndex(item => item.path === entry.path);
    if (index < 0) return;
    const neighbours = [gallery[(index + 1) % gallery.length], gallery.at(index - 1)];
    // Not cancelled on cleanup: stepping on is exactly when the preload pays off.
    for (const item of neighbours) {
      // A PSD preview is rendered on demand by a server worker; not worth guessing at.
      if (!item || item.path === entry.path || extensionOf(item.path) === '.psd') continue;
      const image = new Image();
      image.decoding = 'async';
      image.src = sourceFor(item.path);
    }
  }, [gallery, entry.path]);

  useKeyBindings([{ key: 'r', ctrl: false, run: rotate }]);

  const changed = !zoom.isFit || rotation % 360 !== 0;

  return (
    <ViewerFrame
      entry={entry}
      immersive
      arrows
      actions={
        <>
          <Button
            variant="stage"
            size="icon"
            onClick={() => zoom.zoomAt(0.8)}
            aria-label="Zoom out"
            title="Zoom out (−, Ctrl + wheel)"
          >
            <ZoomOut />
          </Button>
          <button
            type="button"
            onClick={() => {
              zoom.reset();
              setRotation(0);
            }}
            title="Fit (0)"
            className="tabular h-8 min-w-12 rounded-lg px-1.5 text-[12px] text-stage-ink/80 hover:bg-white/10"
          >
            {changed ? `${Math.round(zoom.view.scale * 100)}%` : 'Fit'}
          </button>
          <Button
            variant="stage"
            size="icon"
            onClick={() => zoom.zoomAt(1.25)}
            aria-label="Zoom in"
            title="Zoom in (+, Ctrl + wheel)"
          >
            <ZoomIn />
          </Button>
          <Button
            variant="stage"
            size="icon"
            onClick={rotate}
            aria-label="Rotate"
            title="Rotate (R)"
          >
            <RotateCw />
          </Button>
        </>
      }
    >
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        {...zoom.handlers}
        style={{ cursor: zoom.isFit ? 'zoom-in' : zoom.dragging ? 'grabbing' : 'grab' }}
      >
        <img
          ref={imageRef}
          src={sourceFor(entry.path)}
          alt={entry.name}
          draggable={false}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          style={{
            transition: `${zoom.transition}, opacity 150ms ease-out`,
            transform: `${zoom.transform} rotate(${rotation}deg)`,
            opacity: status === 'ready' ? 1 : 0,
          }}
        />
        {status === 'loading' ? (
          <Centered className="absolute inset-0">
            <Spinner />
          </Centered>
        ) : null}
        {status === 'error' ? (
          <Notice
            className="absolute inset-0"
            icon={<ImageOff />}
            title="This image could not be shown"
            body="The browser cannot decode this format. Download it to open it in another app."
          />
        ) : null}
      </div>
    </ViewerFrame>
  );
}
