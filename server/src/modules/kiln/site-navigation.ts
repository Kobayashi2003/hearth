import { SITE_FRAME_NAME } from '@hearth/shared';

/**
 * Framesets in a sandbox. A sandboxed frame may navigate only itself and the
 * frames inside it, so a menu frame's `<a target="main">` cannot load its
 * sibling, and `_top` cannot be reached at all; the browser opens a new tab
 * instead. This helper, put at the top of every page of a sandboxed site,
 * catches such clicks and passes them up as messages: the first page that
 * owns a frame of that name loads it (a page may set its own frames' src),
 * `_parent` is handled by the parent itself, and anything that reaches the
 * viewer (`_top`, unknown names) is loaded there. Messages are taken only
 * from a page's own frames.
 */
const helper = `(function () {
  var TYPE = 'hearth-site-navigate';
  function ownFrame(name) {
    var frames = document.querySelectorAll('frame[name], iframe[name]');
    for (var i = 0; i < frames.length; i++) if (frames[i].name === name) return frames[i];
    return null;
  }
  function isChild(source) {
    var frames = document.querySelectorAll('frame, iframe');
    for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === source) return true;
    return false;
  }
  function up(target, url) {
    if (window.parent !== window) window.parent.postMessage({ type: TYPE, target: target, url: url }, '*');
  }
  function route(target, url, fromChild) {
    if (target === '_parent' && fromChild) { location.href = url; return; }
    var frame = target.charAt(0) === '_' ? null : ownFrame(target);
    if (frame) { frame.src = url; return; }
    up(target, url);
  }
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== TYPE || !isChild(event.source)) return;
    route(String(data.target), String(data.url), true);
  });
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href], area[href]') : null;
    if (!link || event.defaultPrevented) return;
    var base = document.querySelector('base[target]');
    var target = (link.getAttribute('target') || (base && base.getAttribute('target')) || '').trim();
    if (!target || target === '_self' || target === '_blank' || target === window.name) return;
    event.preventDefault();
    route(target, link.href, false);
  }, true);
})();`;

export const SITE_NAVIGATION_SCRIPT = `<script>${helper.replace(/\n\s*/g, ' ')}</script>`;

/**
 * Without a sandbox (a sanitised page, where nothing runs) frames navigate one
 * another as written; only `_top` and `_parent` from the site's top page would
 * leave the viewer and replace Hearth itself, so they name the viewer's frame.
 */
export function viewerTarget(target: string | undefined): string | undefined {
  return target === '_top' || target === '_parent' ? SITE_FRAME_NAME : target;
}
