/**
 * Video that old pages embed for a plugin no browser has any more: QuickTime
 * (`<embed src="clip.mov" type="video/quicktime">`) or Windows Media
 * (`<object classid=…><param name="URL" value="clip.wmv">`). Each becomes a
 * `<video>` whose URL carries a marker, so the site route can send the file as
 * it is when the browser can play it and a transcode when it cannot. URLs stay
 * relative, so they resolve beside the page exactly as the original did.
 *
 * Plain pattern matching rather than a parser: it only has to recognise these
 * two shapes, and it runs on pages whose scripts are left untouched.
 */

/** The query a `<video>` adds to its file's URL; the site route answers it. */
const VIDEO_MARKER = 'hearth=video';

const VIDEO_FILE = /\.(mov|qt|wmv|asf|avi|mpe?g|mp4|m4v|3gp|flv|mkv|webm)(?:[?#]|$)/i;
const VIDEO_TYPE = /^(video\/|application\/(x-mplayer2|x-ms-wmp|vnd\.ms-asf))/i;
const SCHEME = /^([a-z][a-z\d+.-]*:|\/\/)/i;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function attributes(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    found.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return found;
}

function isLocalVideo(src: string | undefined, type: string | undefined): src is string {
  if (!src || SCHEME.test(src) || src.startsWith('/')) return false;
  return VIDEO_FILE.test(src) || VIDEO_TYPE.test(type ?? '');
}

/** Plugins played on load unless told not to; `false`, `0` and `no` are how pages said so. */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !/^(false|0|no)$/i.test(value.trim());
}

function videoTag(src: string, settings: Map<string, string>): string {
  const size = ['width', 'height']
    .filter(name => /^\d+$/.test(settings.get(name) ?? ''))
    .map(name => ` ${name}="${settings.get(name)}"`)
    .join('');
  const autoplay = flag(settings.get('autostart') ?? settings.get('autoplay'), true);
  const loop = flag(settings.get('loop'), false);
  const url = `${src}${src.includes('?') ? '&' : '?'}${VIDEO_MARKER}`.replace(/"/g, '&quot;');
  return (
    `<video src="${url}"${size} controls playsinline preload="metadata"` +
    `${autoplay ? ' autoplay' : ''}${loop ? ' loop' : ''}></video>`
  );
}

export function withPlayableVideos(html: string): string {
  const objects = html.replace(/<object\b([^>]*)>([\s\S]*?)<\/object>/gi, (whole, open, inner) => {
    const settings = attributes(open as string);
    for (const param of (inner as string).matchAll(/<param\b([^>]*)>/gi)) {
      const { name, value } = Object.fromEntries(attributes(param[1]!));
      if (name) settings.set(name.toLowerCase(), value ?? '');
    }
    const src =
      settings.get('data') ||
      settings.get('src') ||
      settings.get('filename') ||
      settings.get('url') ||
      settings.get('movie');
    if (isLocalVideo(src, settings.get('type'))) return videoTag(src, settings);
    // Often the object carries an <embed> for the other browsers of the day.
    const embed = /<embed\b([^>]*)>/i.exec(inner as string);
    const fallback = embed ? attributes(embed[1]!) : null;
    const fallbackSrc = fallback?.get('src');
    if (fallback && isLocalVideo(fallbackSrc, fallback.get('type'))) {
      return videoTag(fallbackSrc, new Map([...settings, ...fallback]));
    }
    return whole;
  });
  return objects.replace(/<embed\b([^>]*)>/gi, (whole, open) => {
    const settings = attributes(open as string);
    const src = settings.get('src');
    return isLocalVideo(src, settings.get('type')) ? videoTag(src, settings) : whole;
  });
}
