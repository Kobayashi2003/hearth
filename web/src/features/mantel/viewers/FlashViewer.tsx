import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Spinner, StatusPanel } from '@/components/ui/primitives';
import { mediaUrls } from '@/lib/api';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/** Ruffle is served from the app's own assets; no external host is contacted. */
const RUFFLE_SCRIPT = new URL('../../../../public/ruffle/ruffle.js', import.meta.url).href;

interface RuffleApi {
  newest: () => { createPlayer: () => RufflePlayer } | null;
}

interface RufflePlayer extends HTMLElement {
  load: (options: { url: string }) => Promise<void>;
}

/**
 * Flash playback through Ruffle, which emulates the player in WebAssembly.
 * Loaded on demand: the runtime is several megabytes and almost no session
 * opens a `.swf`.
 */
export default function FlashViewer({ item, onStep, ...chrome }: ViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let player: RufflePlayer | null = null;

    async function start() {
      try {
        await loadRuffleScript();
        const ruffle = (window as unknown as { RufflePlayer?: RuffleApi }).RufflePlayer;
        const instance = ruffle?.newest()?.createPlayer();
        if (!instance || !hostRef.current || cancelled) throw new Error('Ruffle is not available');

        player = instance;
        player.style.width = '100%';
        player.style.height = '100%';
        hostRef.current.append(player);
        await player.load({ url: mediaUrls.raw(item.entry.path) });

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void start();
    return () => {
      cancelled = true;
      player?.remove();
    };
  }, [item.entry.path]);

  return (
    <ViewerChrome item={item} onStep={onStep} contentClassName="bg-hearth-950" {...chrome}>
      <div ref={hostRef} className="h-full w-full" />
      {status === 'loading' ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="absolute inset-0 bg-surface">
          <StatusPanel
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Flash playback is unavailable"
            description="The Ruffle runtime could not be loaded. Reinstall it under server/public/ruffle."
          />
        </div>
      ) : null}
    </ViewerChrome>
  );
}

let ruffleScriptPromise: Promise<void> | null = null;

/** Injected once per session and shared by every `.swf` opened afterwards. */
function loadRuffleScript(): Promise<void> {
  ruffleScriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RUFFLE_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Ruffle'));
    document.head.append(script);
  });
  return ruffleScriptPromise;
}
