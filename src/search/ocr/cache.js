import { OCR_VERSION } from './config.js';
import { MAX_DOCUMENT_CHARS } from '../pdf/core.js';

export function nextOcrPage(document) {
  return document.ocr?.version === OCR_VERSION ? document.ocr.nextPage : 1;
}
export const nextOcrRegion = document => document.ocr?.version === OCR_VERSION ? document.ocr.regionOffset || 0 : 0;
export function applyOcrPage(document, evidence) {
  if (evidence.page !== nextOcrPage(document) || !document.pages.some(page => page.page === evidence.page)) throw new Error('Handwriting progress changed. Reopen Spotlight.');
  if ((evidence.regionOffset || 0) !== nextOcrRegion(document)) throw new Error('Handwriting region progress changed. Reopen Spotlight.');
  const existing = document.ocr?.version === OCR_VERSION ? document.pages.find(page => page.page === evidence.page) : null;
  const nativeChars = document.pages.reduce((sum, page) => sum + page.text.length, 0);
  const oldOcrChars = document.ocr?.version === OCR_VERSION ? document.pages.filter(page => page.page !== evidence.page).reduce((sum, page) => sum + (page.ocrText?.length || 0) + (page.ocrAliases?.length || 0), 0) : 0;
  const remaining = Math.max(0, MAX_DOCUMENT_CHARS - nativeChars - oldOcrChars);
  const fullText = [existing?.ocrText, evidence.ocrText].filter(Boolean).join('\n');
  const fullAliases = [...new Set(`${existing?.ocrAliases || ''} ${evidence.ocrAliases || ''}`.split(/\s+/).filter(Boolean))].join(' ');
  const text = fullText.slice(0, Math.min(12000, remaining));
  const aliases = fullAliases.slice(0, Math.min(500, Math.max(0, remaining - text.length)));
  const pageComplete = evidence.ocrPageComplete !== false;
  if (!pageComplete && (!Number.isInteger(evidence.nextRegion) || evidence.nextRegion <= nextOcrRegion(document) || evidence.nextRegion > 40)) throw new Error('Invalid handwriting region progress.');
  const pages = document.pages.map(page => {
    const { ocrText, ocrAliases, ocrScanned, ...native } = page;
    const old = document.ocr?.version === OCR_VERSION ? page : native;
    return page.page === evidence.page ? { ...old, ocrText: text, ocrAliases: aliases, ocrScanned: pageComplete } : old;
  });
  const nextPage = evidence.page + Number(pageComplete);
  return { ...document, pages, chars: nativeChars + oldOcrChars + text.length + aliases.length,
    ocr: { version: OCR_VERSION, nextPage, regionOffset: pageComplete ? 0 : evidence.nextRegion, scannedPages: evidence.page - Number(!pageComplete), totalPages: document.totalPages,
      complete: nextPage > pages.length, partial: Boolean(document.ocr?.partial || evidence.ocrPartial || text.length < fullText.length || aliases.length < fullAliases.length || document.partial) } };
}
