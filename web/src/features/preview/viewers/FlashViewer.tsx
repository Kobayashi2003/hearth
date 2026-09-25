import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { mediaUrls } from '@/lib/api';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../viewers';

interface RufflePlayer extends HTMLElement {
  load: (options: { url: string }) => Promise<void>;
}

let ruffleScript: Promise<void> | null = null;

/** Ruffle is self-hosted under `web/public/ruffle/` and loaded only when a .swf is opened. */
function loadRuffle(): Promise<void> {
  ruffleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('ruffle/ruffle.js', document.baseURI).href;
    script.onload = () => resolve();
    script.onerror = () => {
      ruffleScript = null;
      reject(new Error('Ruffle is not installed'));
    };
    document.head.append(script);
  });
  return ruffleScript;
}

export default function FlashViewer({ entry }: ViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let player: RufflePlayer | null = null;
    loadRuffle()
      .then(async () => {
        const ruffle = (
          window as unknown as {
            RufflePlayer?: { newest: () => { createPlayer: () => RufflePlayer } | null };
          }
        ).RufflePlayer;
        const created = ruffle?.newest()?.createPlayer();
        if (!created || !hostRef.current || cancelled) throw new Error('Ruffle is not available');
        player = created;
        player.style.width = '100%';
        player.style.height = '100%';
        hostRef.current.append(player);
        await player.load({ url: mediaUrls.raw(entry.path) });
        if (!cancelled) setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
      player?.remove();
    };
  }, [entry.path]);

  return (
    <ViewerFrame entry={entry} arrows>
      <div ref={hostRef} className="absolute inset-0" />
      {status === 'loading' ? (
        <Centered className="absolute inset-0">
          <Spinner />
        </Centered>
      ) : null}
      {status === 'error' ? (
        <Notice
          className="absolute inset-0"
          icon={<Sparkles />}
          title="Flash playback is not set up"
          body="Put a self-hosted Ruffle build in web/public/ruffle/ and rebuild to play .swf files."
        />
      ) : null}
    </ViewerFrame>
  );
}
