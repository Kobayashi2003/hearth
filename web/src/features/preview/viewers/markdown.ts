import { Marked } from 'marked';

const SAFE_URL = /^(https?:|mailto:|#|\/|\.{0,2}\/|[^:]*$)/i;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
}

/**
 * Markdown is rendered into the app's own origin, so raw HTML is shown as text
 * and only harmless URL schemes survive — a downloaded README must not be able
 * to run script with the reader's session.
 */
const safe = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_URL.test(href)) return label;
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${titleAttribute} target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
    image({ href, text }) {
      return /^https?:/i.test(href) || !SAFE_URL.test(href)
        ? escapeHtml(text)
        : `<img alt="${escapeHtml(text)}" src="${escapeHtml(href)}">`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return safe.parse(source, { async: false }) as string;
}
