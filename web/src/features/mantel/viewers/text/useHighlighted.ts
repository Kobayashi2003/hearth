import { useEffect, useState } from 'react';

/** Files above this are shown unhighlighted; tokenising them janks the tab. */
const MAX_HIGHLIGHT_BYTES = 400_000;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell', bat: 'bat',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', xml: 'xml',
  vue: 'vue', svelte: 'svelte', php: 'php', lua: 'lua', r: 'r', dart: 'dart',
};

function languageFor(filename: string): string | null {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_BY_EXTENSION[extension] ?? null;
}

/**
 * Syntax highlighting via Shiki, loaded on demand. Shiki carries a large
 * grammar and theme payload, so it is imported only when a code file is
 * actually opened rather than bundled into the entry chunk.
 */
export function useHighlighted(code: string, filename: string): string | null {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const language = languageFor(filename);
    if (!code || !language || code.length > MAX_HIGHLIGHT_BYTES) {
      setHtml(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { codeToHtml } = await import('shiki');
        const rendered = await codeToHtml(code, {
          lang: language,
          // Both themes are produced; CSS variables pick one at display time,
          // so switching theme does not require re-highlighting.
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
        if (!cancelled) setHtml(rendered);
      } catch {
        // An unknown grammar simply falls back to plain text.
        if (!cancelled) setHtml(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, filename]);

  return html;
}
