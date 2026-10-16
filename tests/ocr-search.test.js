import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOcrPage, nextOcrPage } from '../src/search/ocr/cache.js';
import { cleanOcrText } from '../src/search/ocr/recognize.js';
import { searchPdfPages, pdfRevision } from '../src/search/pdf/core.js';
import { searchPdfCache } from '../src/search/pdf/background.js';
import { matchExplanation } from '../src/search/relevance.js';
import { renderHandwriting } from '../src/search/ocr/page.js';

const document = { id: 'notes', pages: [{ page: 1, text: 'Printed introduction' }, { page: 2, text: 'Printed formula' }], chars: 35, totalPages: 2 };
test('OCR augments native text, persists ordered progress, and bounds cached text', () => {
  const before = structuredClone(document);
  const first = applyOcrPage(document, { page: 1, ocrText: 'Handwritten example', ocrAliases: 'summation sum' });
  assert.equal(first.pages[0].text, document.pages[0].text);
  assert.equal(first.pages[1].text, document.pages[1].text);
  assert.equal(nextOcrPage(first), 2);
  assert.equal(first.ocr.complete, false);
  const second = applyOcrPage(first, { page: 2, ocrText: 'word '.repeat(5000), ocrPartial: true });
  assert.equal(second.ocr.complete, true);
  assert.equal(second.ocr.partial, true);
  assert.equal(second.pages[1].ocrText.length, 12000);
  assert.throws(() => applyOcrPage(first, { page: 1 }), /progress changed/);
  assert.deepEqual(document, before);
});
test('native matches retain priority while handwriting and symbol aliases join the same page search', () => {
  const resource = { id: 'notes', type: 'PDF', course: 'STAT230', title: 'Week 5', path: 'Lecture notes' };
  const pages = [{ page: 5, text: 'A pmf sums to one.', ocrText: 'Recall geometric examples', ocrAliases: 'summation sum' }];
  assert.equal(searchPdfPages(resource, pages, 'pmf')[0].ocrMatch, false);
  for (const query of ['recall', 'summation', 'stat230 recall pmf']) {
    const found = searchPdfPages(resource, pages, query);
    assert.equal(found[0].page, 5);
    assert.equal(found[0].ocrMatch, true);
  }
  assert.equal(searchPdfPages(resource, [{ page: 5, text: '∑ f(x)' }], 'summation')[0].ocrMatch, false);
  assert.equal(searchPdfPages(resource, [{ page: 5, text: 'Σ covariance' }], 'summation').length, 0);
});
test('region batches resume within a page without losing prior handwriting or double-applying a batch', () => {
  const first = applyOcrPage(document, { page: 1, regionOffset: 0, nextRegion: 8, ocrPageComplete: false, ocrText: 'Recall example', ocrAliases: 'summation sum' });
  assert.equal(first.ocr.nextPage, 1);
  assert.equal(first.ocr.regionOffset, 8);
  assert.equal(first.ocr.scannedPages, 0);
  assert.throws(() => applyOcrPage(first, { page: 1, regionOffset: 0, nextRegion: 8, ocrPageComplete: false }), /region progress/);
  const next = applyOcrPage(first, { page: 1, regionOffset: 8, nextRegion: 12, ocrPageComplete: true, ocrText: 'Another passage', ocrAliases: 'summation sum infinity' });
  assert.equal(next.ocr.nextPage, 2);
  assert.match(next.pages[0].ocrText, /Recall example\nAnother passage/);
  assert.equal(next.pages[0].ocrAliases, 'summation sum infinity');
});
test('normal cached search keeps OCR labels, physical PDF links, filters and account/revision isolation', async () => {
  const resource = { id: 'notes', type: 'PDF', title: 'Week 5', path: 'Lecture notes', courseId: '230', course: 'STAT230', pdfUrl: 'https://learn.uwaterloo.ca/content/notes.pdf' };
  const saved = { ...document, accountId: 'A', revision: pdfRevision(resource), pages: [{ page: 5, text: 'Printed content', ocrText: 'Recall an example', ocrAliases: 'summation sum' }] };
  const cache = { all: async () => [saved] }, index = { accountId: 'A', resources: [resource], history: {} };
  const matches = await searchPdfCache(cache, index, 'recall');
  assert.equal(matches[0].ocrMatch, true);
  assert.match(matches[0].url, /#page=5$/);
  assert.match(matchExplanation(matches[0], 'recall'), /OCR text · page 5/);
  assert.deepEqual(await searchPdfCache(cache, index, 'recall', { courseId: '231' }), []);
  assert.deepEqual(await searchPdfCache(cache, { ...index, accountId: 'B' }, 'recall'), []);
  assert.deepEqual(await searchPdfCache(cache, { ...index, resources: [{ ...resource, modifiedAt: 'new' }] }, 'recall'), []);
});
test('text quality filtering retains useful single-word headings and drops obvious generated noise', () => {
  assert.equal(cleanOcrText('Recall'), 'Recall');
  assert.equal(cleanOcrText('Parametric Curves'), 'Parametric Curves');
  assert.equal(cleanOcrText('a b c d e f'), '');
  assert.equal(cleanOcrText('word word word word word word'), '');
  assert.equal(cleanOcrText('\\sum_{i=0}^n'), '');
  assert.equal(cleanOcrText('x'), '');
});
test('hidden-document PDF rendering avoids animation frames and respects pixel bounds', async () => {
  const canvas = { getContext: () => ({ getImageData: () => ({ width: canvas.width, height: canvas.height }) }) };
  const page = { getViewport: ({ scale }) => ({ width: 800 * scale, height: 600 * scale }), render: options => {
    assert.equal(options.intent, 'print', 'Hidden offscreen rendering must not wait for display animation frames');
    assert.ok(options.viewport.width <= 1600);
    return { promise: Promise.resolve() };
  } };
  const rendered = await renderHandwriting(page, canvas);
  assert.equal(rendered.width, 1600);
  assert.equal(rendered.height, 1200);
});
