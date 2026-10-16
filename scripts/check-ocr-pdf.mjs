import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pipeline, env } from '@huggingface/transformers';
import { OCR_MODELS } from '../src/search/ocr/config.js';
import { renderHandwriting } from '../src/search/ocr/page.js';
import { recognizeHandwriting } from '../src/search/ocr/recognize.js';
import { extractDocumentText, searchPdfPages } from '../src/search/pdf/core.js';

const [file, pageValue = '5'] = process.argv.slice(2);
if (!file) throw new Error('Supply a local annotated PDF and physical page number.');
const number = Number(pageValue);
env.localModelPath = resolve('ocr-assets/models') + '/';
env.allowRemoteModels = false;
const pipes = [];
const engines = {};
for (const model of OCR_MODELS) {
  const pipe = await pipeline('image-to-text', model.id, { local_files_only: true, dtype: 'q8', device: 'cpu' });
  pipes.push(pipe);
  engines[model.role] = async image => (await pipe(image, { max_new_tokens: model.role === 'math' ? 96 : 64, do_sample: false })).map(item => item.generated_text).join('\n');
}
const task = getDocument({ data: new Uint8Array(await readFile(file)), isEvalSupported: false, useSystemFonts: true,
  cMapUrl: resolve('node_modules/pdfjs-dist/cmaps') + '/', cMapPacked: true,
  standardFontDataUrl: resolve('node_modules/pdfjs-dist/standard_fonts') + '/' });
try {
  const pdf = await task.promise;
  const document = await extractDocumentText(pdf);
  const page = await pdf.getPage(number), canvas = createCanvas(1, 1);
  const image = await renderHandwriting(page, canvas);
  await mkdir('benchmark-results', { recursive: true });
  await writeFile(`benchmark-results/ocr-pdf-page-${number}-rendered.png`, canvas.toBuffer('image/png'));
  const started = performance.now();
  const regions = [];
  const evidence = await recognizeHandwriting(image, engines, () => {}, region => regions.push(region));
  const resource = { id: 'local-pdf', course: 'STAT230', courseId: '230', type: 'PDF', title: 'Week 5 annotated notes', path: 'Lecture notes' };
  const combined = document.pages.map(page => page.page === number ? { ...page, ...evidence } : page);
  const searches = Object.fromEntries(['summation', 'recall', 'pmf'].map(query => [query,
    searchPdfPages(resource, combined, query).map(({ page, snippet, ocrMatch }) => ({ page, snippet, ocrMatch }))]));
  const handwritingOnly = searchPdfPages(resource, [{ page: number, text: '', ...evidence }], 'summation');
  const report = { totalPages: pdf.numPages, physicalPage: number, nativeText: document.pages.find(page => page.page === number).text,
    ...evidence, regions, inferenceMs: Math.round(performance.now() - started), searches,
    handwritingOnlySummation: handwritingOnly.some(match => match.ocrMatch) };
  await writeFile(`benchmark-results/ocr-pdf-page-${number}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await task.destroy(); await Promise.all(pipes.map(pipe => pipe.dispose())); }
