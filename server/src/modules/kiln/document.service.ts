import fsp from 'node:fs/promises';
import path from 'node:path';

import sanitizeHtml from 'sanitize-html';
import { OFFICE_EXTENSIONS, type OfficeContentResponse } from '@hearth/shared';

import type { RuntimeState } from '../../config/runtime-state.js';
import { HearthError } from '../../lib/errors.js';
import { runWorker } from '../../lib/worker-pool.js';
import type { SafePath } from '../../lib/vault.js';
import type { OfficeRequest, OfficeResponse } from '../../workers/office.worker.js';

/**
 * Rendering a document means turning a file the user owns into markup the
 * browser will execute — so everything that leaves here is sanitised. The
 * allow-list approach means a format that gains a new scripting vector in some
 * future version still cannot introduce one here.
 */
const DOCUMENT_ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  'img', 'h1', 'h2', 'section', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'col', 'colgroup',
];

/**
 * Inline styles are kept because they carry a document's layout, but only
 * presentational properties survive — `url()` in a background would otherwise
 * fetch from the network and report that the document had been opened.
 */
const DOCUMENT_ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    'color': [/^[^;{}()]+$/],
    'background-color': [/^[^;{}()]+$/],
    'font-size': [/^[\d.]+(px|pt|em|rem|%)$/],
    'font-weight': [/^(normal|bold|\d{3})$/],
    'font-style': [/^(normal|italic)$/],
    'text-align': [/^(left|right|center|justify)$/],
    'text-decoration': [/^[a-z -]+$/],
    'width': [/^[\d.]+(px|pt|em|rem|%)$/],
    'height': [/^[\d.]+(px|pt|em|rem|%)$/],
    'margin': [/^[\d.a-z %]+$/],
    'padding': [/^[\d.a-z %]+$/],
    'border': [/^[\d.a-z #%]+$/],
  },
};

const DOCUMENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: DOCUMENT_ALLOWED_TAGS,
  allowedStyles: DOCUMENT_ALLOWED_STYLES,
  allowedAttributes: {
    '*': ['style', 'class', 'colspan', 'rowspan', 'id', 'data-sheet'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
  },
  // Images inside a .docx arrive as data URIs; anything remote is dropped.
  allowedSchemes: ['data', 'http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['data'] },
  transformTags: {
    // A document link must not be able to reach back into the opener.
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

export class DocumentService {
  constructor(private readonly runtime: RuntimeState) {}

  async renderOffice(target: SafePath, signal?: AbortSignal): Promise<OfficeContentResponse> {
    if (!OFFICE_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      throw HearthError.badRequest('That file is not an Office document');
    }

    const rendered = await runWorker<OfficeRequest, OfficeResponse>(
      'office',
      { filePath: target },
      signal,
    );

    return {
      html: sanitizeHtml(rendered.html, DOCUMENT_SANITIZE_OPTIONS),
      ...(rendered.sheets ? { sheets: rendered.sheets } : {}),
    };
  }

  /**
   * Local HTML rendered for viewing. External resource loading is off by
   * default: a saved web page that silently fetches from the network would
   * report back that a private file had been opened, and would let a remote
   * host see the reader's address.
   */
  async renderHtml(target: SafePath): Promise<{ html: string; externalResources: boolean }> {
    if (!this.runtime.get('htmlViewerEnabled')) {
      throw HearthError.forbidden('The HTML viewer is disabled');
    }

    const raw = await fsp.readFile(target, 'utf8');
    const externalResources = this.runtime.get('htmlExternalResourcesEnabled');

    const options: sanitizeHtml.IOptions = {
      ...DOCUMENT_SANITIZE_OPTIONS,
      allowedAttributes: {
        ...DOCUMENT_SANITIZE_OPTIONS.allowedAttributes,
        img: ['src', 'alt', 'width', 'height', 'style'],
      },
      allowedSchemesByTag: externalResources
        ? { img: ['data', 'http', 'https'] }
        : { img: ['data'] },
    };

    return { html: sanitizeHtml(raw, options), externalResources };
  }
}
