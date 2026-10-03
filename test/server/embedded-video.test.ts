import { describe, expect, it } from 'vitest';

import { withPlayableVideos } from '../../server/src/modules/kiln/embedded-video.js';

describe('video embedded for an old plugin', () => {
  it('turns a QuickTime embed into <video>, keeping its size and its loop', () => {
    const html = withPlayableVideos(
      '<EMBED src="movie/nanao001b.mov" width="631" height="490" loop="true" autostart="true" type="video/quicktime">',
    );
    expect(html).toBe(
      '<video src="movie/nanao001b.mov?hearth=video" width="631" height="490" controls playsinline preload="metadata" autoplay loop></video>',
    );
  });

  it('plays on load unless the page said not to, as the plugins did', () => {
    expect(withPlayableVideos('<embed src="a.mov">')).toContain(' autoplay');
    expect(withPlayableVideos('<embed src="a.wmv" autostart="false">')).not.toContain('autoplay');
    expect(withPlayableVideos('<embed src="a.wmv" autostart="0">')).not.toContain('autoplay');
  });

  it('reads a Windows Media object from its params, and drops the embed inside it', () => {
    const html = withPlayableVideos(
      '<object classid="clsid:6BF52A52-394A-11d3-B153-00C04F79FAA6" width="640" height="480">' +
        '<param name="URL" value="movie/op.wmv"><param name="autoStart" value="true">' +
        '<embed src="movie/op.wmv" type="application/x-mplayer2"></object>',
    );
    expect(html).toBe(
      '<video src="movie/op.wmv?hearth=video" width="640" height="480" controls playsinline preload="metadata" autoplay></video>',
    );
  });

  it('falls back to the embed an object carries for other browsers', () => {
    const html = withPlayableVideos(
      '<object classid="clsid:02BF25D5-8C17-4B23-BC80-D3488ABDDC6B" width="320">' +
        '<embed src="clip.mov" width="320" height="256"></object>',
    );
    expect(html).toContain('<video src="clip.mov?hearth=video" width="320" height="256"');
  });

  it('leaves Flash for Ruffle, and other sites’ files and non-video embeds alone', () => {
    const flash =
      '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"><param name="movie" value="flash/op.swf"></object>';
    expect(withPlayableVideos(flash)).toBe(flash);
    for (const kept of [
      '<embed src="movie/title.swf">',
      '<embed src="https://example.com/a.mov">',
      '<embed src="/rooted.mov">',
      '<embed src="music.mid">',
    ]) {
      expect(withPlayableVideos(kept)).toBe(kept);
    }
  });

  it('adds the marker to a URL that already has a query', () => {
    expect(withPlayableVideos('<embed src="a.mov?v=2">')).toContain('src="a.mov?v=2&hearth=video"');
  });
});
