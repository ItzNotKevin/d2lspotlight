import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_PDF_BYTES, extractDocumentText } from './core.js';
import { extractOffice } from '../office/core.js';
import { scanPdfPage, cancelOcr } from '../ocr/offscreen.js';

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('dist/pdf.worker.mjs');
const tasks = new Map();
const officeTasks = new Map();
async function extractOfficeFile(base64, id, format) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4) throw new Error('Document exceeds extraction limit.');
  const controller = new AbortController();
  officeTasks.set(id, controller);
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    return await extractOffice(Uint8Array.from(atob(base64), char => char.charCodeAt(0)), format, { signal: controller.signal });
  } finally { clearTimeout(timer); officeTasks.delete(id); }
}
export async function extractPdf(base64, id) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4) throw new Error('PDF exceeds the extraction limit.');
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true,
    cMapUrl: chrome.runtime.getURL('dist/pdf-cmaps/'), cMapPacked: true,
    standardFontDataUrl: chrome.runtime.getURL('dist/pdf-fonts/'),
    wasmUrl: chrome.runtime.getURL('dist/pdf-wasm/') });
  tasks.set(id, task);
  const timer = setTimeout(() => task.destroy(), 60000);
  try {
    const pdf = await task.promise;
    return await extractDocumentText(pdf, () => {
      if (tasks.get(id) !== task) throw new Error('PDF indexing cancelled.');
    });
  } finally {
    clearTimeout(timer);
    if (tasks.get(id) === task) tasks.delete(id);
    await task.destroy();
  }
}
export function cancelPdf(id) {
  cancelOcr(id);
  officeTasks.get(id)?.abort();
  officeTasks.delete(id);
  const task = tasks.get(id);
  tasks.delete(id);
  task?.destroy().catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== 'pdf-offscreen' || sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.action === 'cancel') { cancelPdf(message.id); reply({ ok: true }); return; }
  if (!['extract', 'ocr'].includes(message.action)) return;
  (message.action === 'ocr' ? scanPdfPage(message.bytes, message.page, message.id, message.regionOffset) : message.format && message.format !== 'PDF' ? extractOfficeFile(message.bytes, message.id, message.format) : extractPdf(message.bytes, message.id)).then(document => reply({ ok: true, document }),
    error => reply({ ok: false, error: message.action === 'ocr' ? error.message : 'Document could not be read (encrypted, damaged, cancelled, unsupported, or extraction limit reached).' }));
  return true;
});
