import fsp from 'node:fs/promises';
import path from 'node:path';

import sanitizeHtml from 'sanitize-html';
import { OFFICE_EXTENSIONS, type OfficeContentResponse } from '@hearth/shared';

import type { RuntimeState } from '../../config/runtime-state.js';
import { declaredHtmlCharset, decodeText, detectEncoding } from '../../lib/charset.js';
import { HearthError } from '../../lib/errors.js';
import { runWorker } from '../../lib/worker.js';
import type { SafePath } from '../../lib/vault.js';
import type { OfficeRequest, OfficeResponse } from '../../workers/office.worker.js';

/** Everything leaving here is sanitised against an allow-list. */
const DOCUMENT_ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  'img',
  'h1',
  'h2',
  'section',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'col',
  'colgroup',
];

/** Presentational inline styles only; `url()` would phone home when the document is opened. */
const DOCUMENT_ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    color: [/^[^;{}()]+$/],
    'background-color': [/^[^;{}()]+$/],
    'font-size': [/^[\d.]+(px|pt|em|rem|%)$/],
    'font-weight': [/^(normal|bold|\d{3})$/],
    'font-style': [/^(normal|italic)$/],
    'text-align': [/^(left|right|center|justify)$/],
    'text-decoration': [/^[a-z -]+$/],
    width: [/^[\d.]+(px|pt|em|rem|%)$/],
    height: [/^[\d.]+(px|pt|em|rem|%)$/],
    margin: [/^[\d.a-z %]+$/],
    padding: [/^[\d.a-z %]+$/],
    border: [/^[\d.a-z #%]+$/],
  },
};

const DOCUMENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: DOCUMENT_ALLOWED_TAGS,
  allowedStyles: DOCUMENT_ALLOWED_STYLES,
  // Dropped with their text: a page's <title> is not part of its body.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'],
  allowedAttributes: {
    '*': ['style', 'class', 'colspan', 'rowspan', 'id', 'data-sheet'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['data', 'http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['data'] },
  transformTags: {
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

  /** External resources are off by default: a saved page fetching remotely would report that it was opened. */
  async renderHtml(target: SafePath): Promise<{ html: string; externalResources: boolean }> {
    if (!this.runtime.get('htmlViewerEnabled')) {
      throw HearthError.forbidden('The HTML viewer is disabled');
    }

    const bytes = await fsp.readFile(target);
    // Older saved pages are often GBK or Shift_JIS; trust the page's own <meta charset> first.
    const raw = decodeText(bytes, declaredHtmlCharset(bytes) ?? detectEncoding(bytes));
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
