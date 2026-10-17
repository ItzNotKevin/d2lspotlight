import { OCR_VERSION } from './config.js';

export function hasPendingHandwriting(document, revision) {
  return Boolean(document && document.revision === revision && !document.ocr?.error
    && !(document.ocr?.version === OCR_VERSION && document.ocr.complete));
}
