import test from 'node:test';
import assert from 'node:assert/strict';
import { documentPassages, passageMatches, mergePassageMatches, PASSAGE_CHARS } from '../src/search/semantic/passages.js';
import { pdfRevision, notesSection } from '../src/search/pdf/core.js';
import { resourceText, embeddingFor } from '../src/search/semantic/model.js';
import { filterResources } from '../src/learn/search.js';
import { matchExplanation } from '../src/search/relevance.js';

const resource = (id = 'pdf', extra = {}) => ({ id, title: 'Week 4', source: 'LEARN', accountId: 'A', course: 'CS246', courseId: '246', path: 'Lectures', type: 'PDF', pdfUrl: `https://learn.uwaterloo.ca/content/${id}.pdf`, url: `https://learn.uwaterloo.ca/content/${id}.pdf`, ...extra });
const document = (parent, pages, extra = {}) => ({ id: parent.id, accountId: parent.accountId, revision: pdfRevision(parent), pages, ...extra });

test('passages preserve physical pages and overlap within one page only', () => {
  const parent = resource();
  const { passages, totals } = documentPassages([parent], [document(parent, [{ page: 4, text: 'a'.repeat(1000) }, { page: 5, text: 'Second page' }])]);
  assert.equal(totals.pdf, 3);
  assert.deepEqual(passages.map(p => p.pdfPage), [4, 4, 5]);
  assert.equal(passages[0].passageText.length, PASSAGE_CHARS);
  assert.equal(passages[1].passageText.length, 500);
  assert.equal(passages[2].passageText, 'Second page');
});

test('different accounts, revisions, removed resources and OCR-only pages cannot supply semantic passages', () => {
  const parent = resource();
  const page = [{ page: 1, text: 'Native evidence' }];
  for (const stale of [document(parent, page, { accountId: 'B' }), document(parent, page, { revision: 'old' }), document(parent, page, { id: 'removed' })]) {
    assert.equal(documentPassages([parent], [stale]).passages.length, 0);
  }
  assert.equal(documentPassages([parent], [document(parent, [{ page: 1, text: '', ocrText: 'Handwriting stays in keyword search' }])]).passages.length, 0);
  assert.equal(documentPassages([resource('pdf', { source: 'Piazza' })], [document(parent, page)]).passages.length, 0);
});

test('limited budgets cover multiple documents and sample beyond the opening of a long book', () => {
  const parents = [resource('one'), resource('two')];
  const documents = parents.map(parent => document(parent, Array.from({ length: 10 }, (_, i) => ({ page: i + 1, text: `Evidence on physical page ${i + 1}` }))));
  const { passages, totals } = documentPassages(parents, documents, { maxPassages: 4 });
  assert.equal(passages.length, 4);
  assert.deepEqual(totals, { one: 10, two: 10 });
  assert.deepEqual(passages.map(p => [p.resourceId, p.pdfPage]), [['one', 1], ['one', 6], ['two', 1], ['two', 6]]);
  assert.equal(documentPassages(parents, documents, { maxPassages: 0 }).passages.length, 0);
});

test('PDF meaning matches open physical pages and Office matches keep viewer locations', () => {
  const pdf = resource(), office = resource('office', { type: 'DOC', documentFormat: 'DOCX', documentUrl: 'https://learn.uwaterloo.ca/content/notes.docx', url: 'https://learn.uwaterloo.ca/d2l/le/content/246/viewContent/1/View' });
  const { passages } = documentPassages([pdf, office], [document(pdf, [{ page: 4, text: 'Allocation and deallocation' }]), document(office, [{ page: 2, location: 'Paragraphs 8–10', text: 'Object lifetime' }])]);
  const matches = passageMatches(passages.map(p => ({ id: p.id, score: .8 })), passages);
  assert.equal(matches[0].url, `${pdf.pdfUrl}#page=4`);
  assert.equal(matches[0].resourceId, 'pdf');
  assert.equal(matches[1].url, office.url);
  assert.equal(matches[1].documentLocation, 'Paragraphs 8–10');
  assert.equal(matchExplanation(matches[0], 'memory'), 'Related meaning · pdf page 4');
  assert.equal(matchExplanation(matches[1], 'memory'), 'Related meaning · paragraphs 8–10');
  assert.equal(passageMatches([{ id: passages[0].id, score: .1 }, { id: 'injected', score: 1 }, { id: passages[0].id, score: NaN }], passages).length, 0);
});

test('keyword evidence wins when semantic chunks hit the same document page', () => {
  const keyword = { id: 'keyword', resourceId: 'pdf', pdfPage: 4 };
  const semantic = [{ id: 'one', resourceId: 'pdf', pdfPage: 4 }, { id: 'two', resourceId: 'pdf', pdfPage: 5 }, { id: 'three', resourceId: 'pdf', pdfPage: 5 }];
  assert.deepEqual(mergePassageMatches([keyword], semantic).map(m => m.id), ['keyword', 'two']);
});

test('passage embeddings depend on body text and refresh when that text changes', async () => {
  const parent = resource(), cache = new Map();
  const body = documentPassages([parent], [document(parent, [{ page: 1, text: 'Storage allocation' }])]).passages[0];
  assert.equal(resourceText(body), 'Storage allocation');
  let calls = 0;
  const options = { view: 'passage', dimensions: 2, embed: async () => { calls++; return [1, 0]; }, cache: { get: async key => cache.get(key), put: async entry => cache.set(entry.key, entry) } };
  await embeddingFor(body, options);
  await embeddingFor(body, options);
  assert.equal(calls, 1);
  await embeddingFor({ ...body, passageText: 'Updated storage evidence' }, options);
  assert.equal(calls, 2);
});

test('source, section and instructor labels remain available on passage records', () => {
  const parent = resource('pdf', { instructor: 'Example instructor' });
  const { passages } = documentPassages([parent], [document(parent, [{ page: 1, text: 'Evidence' }])]);
  assert.equal(filterResources(passages, { courseId: '246', source: 'LEARN', notesSection: notesSection(parent), instructor: 'Example instructor' }).length, 1);
  assert.equal(filterResources(passages, { source: 'Piazza' }).length, 0);
  assert.equal(filterResources(passages, { instructor: 'Other instructor' }).length, 0);
});

