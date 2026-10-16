import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_PDF_BYTES } from '../pdf/core.js';
import { renderHandwriting } from './page.js';
const jobs = new Map();
export function cancelOcr(id) { jobs.get(id)?.(); }
export async function scanPdfPage(base64, pageNumber, id, regionOffset = 0) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 400) throw new Error('Unsupported handwriting scan.');
  const task = getDocument({ data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)), isEvalSupported: false, useSystemFonts: true,
    cMapUrl: chrome.runtime.getURL('dist/pdf-cmaps/'), cMapPacked: true, standardFontDataUrl: chrome.runtime.getURL('dist/pdf-fonts/'), wasmUrl: chrome.runtime.getURL('dist/pdf-wasm/') });
  let worker, rejectWorker, cancelled = false;
  const cancel = () => { cancelled = true; worker?.terminate(); rejectWorker?.(new Error('Handwriting scan cancelled.')); task.destroy().catch(() => {}); };
  jobs.set(id, cancel);
  const timer = setTimeout(cancel, 180000);
  const check = () => { if (cancelled) throw new Error('Handwriting scan cancelled.'); };
  const progress = stage => chrome.runtime.sendMessage({ type: 'ocr-stage', id, stage }).catch(() => {});
  try {
    progress('rendering PDF page');
    const pdf = await task.promise;
    if (pageNumber > pdf.numPages) throw new Error('Page unavailable.');
    const image = await renderHandwriting(await pdf.getPage(pageNumber), document.createElement('canvas'), check);
    check();
    progress('starting recognition worker');
    worker = new Worker(chrome.runtime.getURL('dist/ocr-worker.js'), { type: 'module' });
    return await new Promise((resolve, reject) => {
      rejectWorker = reject;
      worker.onmessage = ({ data }) => {
        if (data.progress) { progress(data.progress); return; }
        data.ok ? resolve({ page: pageNumber, ...data.result }) : reject(new Error(data.error));
      };
      worker.onerror = event => reject(new Error(`Handwriting worker could not start: ${String(event.message || 'unavailable').slice(0, 200)}`));
      worker.postMessage({ id, regionOffset, image: { data: image.data, width: image.width, height: image.height } }, [image.data.buffer]);
    });
  } finally { clearTimeout(timer); jobs.delete(id); worker?.terminate(); await task.destroy(); }
}
