/**
 * Everything search-expression construction.
 *
 * Everything's query language gives `|`, `!`, `<>`, `"` and the `name:` family
 * operator meaning. User input is data, never syntax, so every user term is
 * wrapped in double quotes — inside which Everything treats the content
 * literally — and any embedded quote is removed, leaving no way to break out of
 * the quoting and alter the expression.
 */

/** Quote one user term so Everything reads it literally. */
export function quoteTerm(term: string): string {
  return `"${term.replace(/"/g, '')}"`;
}

export interface EverythingQueryParts {
  /** Absolute directory the search is confined to. */
  scopeDirectory: string;
  /** Raw text the user typed. */
  text: string;
  /** Extensions (no dot) to restrict to, e.g. a media-kind filter. */
  extensions?: readonly string[];
  /** Restrict to folders or to files. */
  only?: 'files' | 'folders';
}

/**
 * Build the search expression. Terms are ANDed, which is what a user typing
 * two words expects, rather than being treated as one phrase.
 */
export function buildSearchExpression(parts: EverythingQueryParts): string {
  const clauses: string[] = [`path:${quoteTerm(parts.scopeDirectory)}`];

  if (parts.extensions && parts.extensions.length > 0) {
    // `ext:` counts inside Everything, so pagination totals stay exact.
    clauses.push(`ext:${parts.extensions.join(';')}`);
  }

  if (parts.only === 'files') clauses.push('file:');
  if (parts.only === 'folders') clauses.push('folder:');

  for (const term of parts.text.split(/\s+/).filter(Boolean)) {
    clauses.push(quoteTerm(term));
  }

  return clauses.join(' ');
}

const SORT_FIELD_MAP = {
  name: 'name',
  size: 'size',
  mtime: 'date_modified',
  // Everything has no notion of Hearth's "type" ordering; name is the closest
  // stable base, and the page is reordered by extension after retrieval.
  type: 'name',
} as const;

export type HearthSortField = keyof typeof SORT_FIELD_MAP;

export function everythingSortField(field: HearthSortField): string {
  return SORT_FIELD_MAP[field];
}
