import { OCR_VERSION } from './config.js';

export function hasPendingHandwriting(document, revision) {
  return Boolean(document && document.revision === revision && !document.ocr?.error
    && !(document.ocr?.version === OCR_VERSION && document.ocr.complete));
}

export function handwritingProgress(document) {
  const ocr = document.ocr?.version === OCR_VERSION ? document.ocr : null;
  const total = document.totalPages || document.pages || 0;
  const scanned = ocr?.scannedPages || 0;
  const nextPage = ocr?.nextPage || 1;
  const regions = ocr?.regionOffset || 0;
  return `${scanned} of ${total} PDF pages scanned${ocr?.complete ? ' · scan complete' : ` · next: PDF page ${nextPage} · ${regions} regions saved on this page`}${ocr?.partial ? ' · some regions omitted' : ''}${document.ocr?.error ? ` · ${document.ocr.error} Use Retry document indexing.` : ''}`;
}
