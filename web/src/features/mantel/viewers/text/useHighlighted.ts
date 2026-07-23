import { useEffect, useState } from 'react';
import type { HighlighterCore } from 'shiki/core';

/** Files above this are shown unhighlighted; tokenising them janks the tab. */
const MAX_HIGHLIGHT_BYTES = 400_000;

/**
 * Grammars Hearth ships. Kept to a deliberate set — loading every language Shiki
 * knows would add megabytes of grammar for formats a file server rarely opens.
 * Each maps to a dynamic import so only the grammars actually used are fetched.
 */
const LANGUAGE_LOADERS: Record<string, () => Promise<unknown>> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  python: () => import('@shikijs/langs/python'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  java: () => import('@shikijs/langs/java'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  shell: () => import('@shikijs/langs/shellscript'),
  powershell: () => import('@shikijs/langs/powershell'),
  sql: () => import('@shikijs/langs/sql'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  xml: () => import('@shikijs/langs/xml'),
  markdown: () => import('@shikijs/langs/markdown'),
  ruby: () => import('@shikijs/langs/ruby'),
  php: () => import('@shikijs/langs/php'),
};

const EXTENSION_TO_LANGUAGE: Record<string, keyof typeof LANGUAGE_LOADERS> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'css', less: 'css',
  py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'java',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'toml', xml: 'xml',
  md: 'markdown', markdown: 'markdown', rb: 'ruby', php: 'php',
};

function languageFor(filename: string): keyof typeof LANGUAGE_LOADERS | null {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TO_LANGUAGE[extension] ?? null;
}

/** One core highlighter, built on first use and shared across every text viewer. */
let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createOnigurumaEngine }, githubLight, githubDark] =
      await Promise.all([
        import('shiki/core'),
        import('shiki/engine/oniguruma'),
        import('@shikijs/themes/github-light'),
        import('@shikijs/themes/github-dark'),
      ]);
    return createHighlighterCore({
      themes: [githubLight.default, githubDark.default],
      langs: [],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  })();
  return highlighterPromise;
}

/**
 * Syntax highlighting via Shiki, loaded on demand. The core engine and each
 * grammar are separate lazy chunks, so opening a Python file fetches only the
 * Python grammar — not the whole language set.
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
        const highlighter = await getHighlighter();
        if (!loadedLanguages.has(language)) {
          const grammar = (await LANGUAGE_LOADERS[language]!()) as { default: unknown };
          await highlighter.loadLanguage(grammar.default as never);
          loadedLanguages.add(language);
        }
        const rendered = highlighter.codeToHtml(code, {
          lang: language,
          // Both themes render; CSS variables pick one at display time, so a
          // theme switch needs no re-highlight.
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
        if (!cancelled) setHtml(rendered);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, filename]);

  return html;
}
