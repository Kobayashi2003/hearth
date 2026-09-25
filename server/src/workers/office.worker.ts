import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import * as xlsx from 'xlsx';

import { rethrow } from './comic-pages.js';

/** Office documents to an HTML fragment. Sanitising happens on the main thread, not here. */
export interface OfficeRequest {
  filePath: string;
}

export interface OfficeResponse {
  html: string;
  sheets?: string[];
}

async function convertDocx(filePath: string): Promise<OfficeResponse> {
  const { value } = await mammoth.convertToHtml({ path: filePath });
  return { html: value };
}

/** Legacy binary .doc, which mammoth cannot read. */
async function convertDoc(filePath: string): Promise<OfficeResponse> {
  const document = await new WordExtractor().extract(filePath);
  const paragraphs = document
    .getBody()
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => `<p>${escapeHtml(line)}</p>`);
  return { html: paragraphs.join('\n') };
}

function convertSpreadsheet(filePath: string): OfficeResponse {
  const workbook = xlsx.read(fs.readFileSync(filePath), { type: 'buffer' });

  const sections = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const table = sheet ? xlsx.utils.sheet_to_html(sheet, { id: `sheet-${name}` }) : '';
    return `<section data-sheet="${escapeHtml(name)}"><h2>${escapeHtml(name)}</h2>${table}</section>`;
  });

  return { html: sections.join('\n'), sheets: workbook.SheetNames };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function run(request: OfficeRequest): Promise<OfficeResponse> {
  switch (path.extname(request.filePath).toLowerCase()) {
    case '.docx':
      return convertDocx(request.filePath);
    case '.doc':
      return convertDoc(request.filePath);
    case '.xlsx':
    case '.xls':
      return convertSpreadsheet(request.filePath);
    default:
      throw new Error('Unsupported document type');
  }
}

run(workerData as OfficeRequest).then(response => parentPort?.postMessage(response), rethrow);
