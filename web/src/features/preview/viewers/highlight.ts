import { useEffect, useState } from 'react';
import type { HighlighterCore } from 'shiki/core';

import { extensionOf } from '@/lib/format';
import { clientLimits } from '@/lib/limits';

const LANGUAGES: Record<string, () => Promise<{ default: unknown }>> = {
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
  kotlin: () => import('@shikijs/langs/kotlin'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  shell: () => import('@shikijs/langs/shellscript'),
  powershell: () => import('@shikijs/langs/powershell'),
  sql: () => import('@shikijs/langs/sql'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  ini: () => import('@shikijs/langs/ini'),
  xml: () => import('@shikijs/langs/xml'),
  ruby: () => import('@shikijs/langs/ruby'),
  php: () => import('@shikijs/langs/php'),
};

const BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cs': 'csharp',
  '.sh': 'shell',
  '.bash': 'shell',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.xml': 'xml',
  '.rb': 'ruby',
  '.php': 'php',
};

let highlighter: Promise<HighlighterCore> | null = null;
const loaded = new Set<string>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createOnigurumaEngine }, light, dark] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/oniguruma'),
      import('@shikijs/themes/github-light'),
      import('@shikijs/themes/github-dark'),
    ]);
    return createHighlighterCore({
      themes: [light.default, dark.default],
      langs: [],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  })();
  return highlighter;
}

/** HTML with both themes' colours as CSS variables, or null for plain text. */
export function useHighlighted(code: string, filename: string): string | null {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const language = BY_EXTENSION[extensionOf(filename)];
    if (!code || !language || code.length > clientLimits.maxHighlightChars) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const instance = await getHighlighter();
        if (!loaded.has(language)) {
          await instance.loadLanguage((await LANGUAGES[language]!()).default as never);
          loaded.add(language);
        }
        const rendered = instance.codeToHtml(code, {
          lang: language,
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
