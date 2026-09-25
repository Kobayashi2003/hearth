/**
 * User input is data, never syntax: every term is double-quoted (literal inside
 * Everything) with embedded quotes removed, so it cannot alter the expression.
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

/** Terms are ANDed, not treated as one phrase. */
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
  type: 'name',
} as const;

export type HearthSortField = keyof typeof SORT_FIELD_MAP;

export function everythingSortField(field: HearthSortField): string {
  return SORT_FIELD_MAP[field];
}
