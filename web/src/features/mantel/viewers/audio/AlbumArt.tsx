import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * The cover embedded in the track's own tags.
 *
 * Served by the thumbnail endpoint, which reads the picture frame out of the
 * metadata. A file with no embedded art answers 204, the image fails to load,
 * and the note glyph stands in — so a tagless rip degrades to exactly what was
 * there before rather than to a broken image.
 */
export function AlbumArt({ path, className }: { path: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);

  // A new track deserves a fresh attempt; otherwise one artless file would
  // suppress the art of everything played after it.
  useEffect(() => setLoaded(false), [path]);

  return (
    <div
      className={cn(
        'relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-sunken shadow-lg',
        className,
      )}
    >
      <Music className="h-1/4 w-1/4 text-muted" />

      {/* Layered over the glyph and revealed only once it has decoded. An
          artless file answers 204, which some browsers paint as a torn-image
          placeholder before `error` ever fires — starting hidden means that
          frame is never shown. */}
      <img
        key={path}
        src={mediaUrls.thumbnail(path, 640)}
        alt=""
        onLoad={event => setLoaded(event.currentTarget.naturalWidth > 0)}
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-[var(--duration-quick)]',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
