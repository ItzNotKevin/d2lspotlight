import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractDocumentText, searchPdfPages, pdfPageUrl, notesSection, pdfRevision, downloadPdf, MAX_PDF_BYTES, MAX_PAGES, MAX_PAGE_CHARS, MAX_DOCUMENT_CHARS, mergePdfResults } from '../src/search/pdf/core.js';
import { searchPdfCache, pdfStatus } from '../src/search/pdf/background.js';
import { createIndexStore } from '../src/learn/cache.js';
import { searchPdfFixture } from './fixtures/search-pdf.js';

const resource = { id: 'notes', title: 'week_02.pdf', path: 'Notes / Instructor A', type: 'PDF',
  url: 'https://learn.uwaterloo.ca/d2l/le/content/230/viewContent/1/View',
  source: 'LEARN', course: 'STAT_230_001_F26', courseId: '230', pdfUrl: 'https://learn.uwaterloo.ca/content/enforced/230/notes.pdf', modifiedAt: '2026-10-12' };
const pages = [{ page: 1, text: 'Sample spaces and events.' }, { page: 2, text: 'Permutations. A permutation is an ordered arrangement of distinct objects.' }];
const document = { id: resource.id, accountId: 'A', revision: pdfRevision(resource), pages, chars: 100, totalPages: 2, emptyPages: 0, partial: false };
const index = { accountId: 'A', resources: [resource], history: {}, pdfLabels: { [notesSection(resource)]: 'Instructor A' } };

test('extracts actual PDF text and finds permutation on physical page two despite a generic filename', async () => {
  const loading = getDocument({ data: searchPdfFixture(), isEvalSupported: false, useSystemFonts: true });
  try {
    const extracted = await extractDocumentText(await loading.promise);
    assert.equal(extracted.totalPages, 3);
    assert.equal(extracted.partial, false);
    const result = searchPdfPages(resource, extracted.pages, 'stat230 permutation notes');
    assert.equal(result[0].page, 2);
    assert.match(result[0].snippet, /ordered arrangement/);
    assert.deepEqual(searchPdfPages(resource, extracted.pages, 'stat231 permutation'), []);
    assert.deepEqual(searchPdfPages(resource, extracted.pages, 'permutation eigenvalue'), []);
    assert.deepEqual(searchPdfPages(resource, extracted.pages, 'please'), []);
  } finally { await loading.destroy(); }
});

test('page results compose course, source, notes-section, instructor and recent filters with original history IDs', async () => {
  const cache = { all: async () => [document] };
  for (const filters of [{ courseId: '230' }, { source: 'LEARN' }, { notesSection: notesSection(resource) }, { instructor: 'Instructor A' }]) {
    const result = await searchPdfCache(cache, index, 'permutation', filters);
    assert.equal(result[0].resourceId, resource.id);
    assert.equal(result[0].pdfPage, 2);
    assert.match(result[0].url, /#page=2$/);
    assert.equal(result[0].parentUrl, resource.url);
  }
  for (const filters of [{ courseId: '231' }, { source: 'Piazza' }, { instructor: 'Instructor B' }, { notesSection: 'different' }, { recent: true }]) {
    assert.deepEqual(await searchPdfCache(cache, index, 'permutation', filters), []);
  }
  assert.equal((await searchPdfCache(cache, { ...index, history: { notes: 10 } }, 'permutation', { recent: true })).length, 1);
});

test('verified passages precede suggestions, retain distinct pages and replace duplicate parent results', async () => {
  const matched = await searchPdfCache({ all: async () => [document] }, index, 'permutation');
  const suggestion = { id: 'other', title: 'Permutations overview' };
  assert.deepEqual(mergePdfResults([resource, suggestion], matched).map(result => result.id), ['notes:page:2', 'other']);
  assert.equal(mergePdfResults([resource, suggestion], matched, 1).length, 1);
  assert.deepEqual(mergePdfResults([resource], []), [resource]);
});

test('account switches, removed resources and changed files exclude cached private text and prune stale documents', async () => {
  for (const changed of [{ ...index, accountId: 'B' }, { ...index, resources: [] },
    { ...index, resources: [{ ...resource, modifiedAt: 'new' }] }, { ...index, resources: [{ ...resource, pdfUrl: `${resource.pdfUrl}?revision=2` }] }]) {
    const deleted = [];
    const cache = { all: async () => [document], remove: async ids => deleted.push(...ids) };
    assert.deepEqual(await searchPdfCache(cache, changed, 'permutation'), []);
    assert.equal((await pdfStatus(cache, changed)).documents.length, 0);
    assert.deepEqual(deleted, ['notes']);
  }
});

test('page links reject external origins, credentials, invalid routes and invalid page numbers', () => {
  assert.match(pdfPageUrl(resource, 2), /notes\.pdf#page=2$/);
  for (const pdfUrl of ['https://evil.test/notes.pdf', 'https://x@learn.uwaterloo.ca/content/notes.pdf', 'https://learn.uwaterloo.ca/login']) {
    assert.throws(() => pdfPageUrl({ pdfUrl }, 2), /Unsupported/);
  }
  for (const page of [0, -1, 1.5, NaN]) assert.throws(() => pdfPageUrl(resource, page), /Unsupported/);
  assert.match(pdfPageUrl({ ...resource, pdfUrl: 'https://learn.uwaterloo.ca/d2l/api/le/1.82/230/content/topics/1/file?stream=true' }, 2), /stream=true#page=2$/);
});

test('downloads are credentialed, bounded, cancellable and reject login pages and throttling', async () => {
  const bytes = await downloadPdf(resource.pdfUrl, { fetchImpl: async (url, options) => {
    assert.equal(url, resource.pdfUrl);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    return new Response(searchPdfFixture(), { headers: { 'Content-Type': 'application/pdf' } });
  } });
  assert.ok(bytes.length > 100);
  for (const response of [new Response('login', { headers: { 'Content-Type': 'text/html' } }), new Response('', { status: 429 }),
    new Response('', { headers: { 'Content-Length': String(MAX_PDF_BYTES + 1) } }), new Response('not a PDF')]) {
    await assert.rejects(downloadPdf(resource.pdfUrl, { fetchImpl: async () => response }));
  }
  let reads = 0;
  const huge = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(MAX_PDF_BYTES / 2)); } });
  await assert.rejects(downloadPdf(resource.pdfUrl, { fetchImpl: async () => new Response(huge) }), /12 MiB/);
  assert.ok(reads <= 4);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(downloadPdf(resource.pdfUrl, { signal: abort.signal, fetchImpl: async () => new Response(searchPdfFixture()) }), { name: 'AbortError' });
});

test('extraction labels missing text and page limits, dehyphenates lines and checks cancellation', async () => {
  let cleaned = 0;
  const fake = { numPages: MAX_PAGES + 1, getPage: async number => ({ getTextContent: async () => ({ items: number === 2 ? [] : [{ str: 'permu-', hasEOL: true }, { str: 'tation' }] }), cleanup: () => cleaned++ }) };
  const extracted = await extractDocumentText(fake);
  assert.equal(extracted.pages[0].text, 'permutation');
  assert.equal(extracted.pages.length, MAX_PAGES);
  assert.equal(extracted.emptyPages, 1);
  assert.equal(extracted.partial, true);
  assert.equal(cleaned, MAX_PAGES);
  await assert.rejects(extractDocumentText(fake, () => { throw new Error('cancelled'); }), /cancelled/);
});

test('extraction bounds both individual page text and the total document text', async () => {
  const fake = { numPages: 60, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'x'.repeat(MAX_PAGE_CHARS + 10) }] }), cleanup() {} }) };
  const result = await extractDocumentText(fake);
  assert.equal(result.chars, MAX_DOCUMENT_CHARS);
  assert.equal(result.pages[0].text.length, MAX_PAGE_CHARS);
  assert.equal(result.partial, true);
  assert.ok(result.pages.length < fake.numPages);
});

test('instructor labels persist across refresh and worker reload, stay course-specific and clear on account switch', async () => {
  let saved = {};
  const storage = { get: async () => structuredClone(saved), set: async value => { saved = structuredClone(value); } };
  const store = createIndexStore(storage);
  const begun = await store('begin', { accountId: 'A' });
  const committed = await store('commit', { ...begun, resources: [resource] });
  await store('label-notes', { accountId: 'A', section: notesSection(resource), name: 'Instructor A' });
  await store('commit', committed);
  assert.equal((await createIndexStore(storage)('read')).pdfLabels[notesSection(resource)], 'Instructor A');
  assert.notEqual(notesSection(resource), notesSection({ ...resource, courseId: '231' }));
  await assert.rejects(store('label-notes', { accountId: 'B', section: notesSection(resource), name: 'wrong' }));
  assert.deepEqual((await store('begin', { accountId: 'B' })).pdfLabels, {});
});
