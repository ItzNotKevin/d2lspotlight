import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { extractOffice } from '../src/search/office/core.js';
import { openOfficeZip } from '../src/search/office/zip.js';
import { wordFixture, slideFixture, slideParts, officeZip, wordXml, wordParagraph } from './fixtures/office.js';
import { searchPdfCache } from '../src/search/pdf/background.js';
import { pdfRevision, downloadDocument } from '../src/search/pdf/core.js';
import { normalizeToc } from '../src/learn/normalize.js';
import { reconcilePdfProgress, updatePdfProgress } from '../src/search/pdf/progress.js';
import { matchExplanation } from '../src/search/relevance.js';

const options = { Parser: DOMParser };
const resource = format => ({ id: format, type: format === 'PPTX' ? 'SLIDES' : 'DOC', documentFormat: format,
  title: 'Week 2', path: 'Lecture notes', course: 'STAT230', courseId: '230',
  url: `https://learn.uwaterloo.ca/d2l/le/content/230/viewContent/${format}/View`,
  documentUrl: `https://learn.uwaterloo.ca/content/notes.${format.toLowerCase()}` });

test('PowerPoint follows presentation relationships rather than ZIP filenames and joins formatting runs', async () => {
  const document = await extractOffice(slideFixture(), 'PPTX', options);
  assert.equal(document.pages[0].text, 'Sample spaces and events.');
  assert.equal(document.pages[1].text, 'Permutation is an ordered arrangement.');
  assert.equal(document.pages[1].location, 'Slide 2');
  assert.equal(document.totalPages, 2);
  assert.equal(document.partial, false);
});

test('Word extracts body and table paragraphs with honest paragraph ranges, not invented pages', async () => {
  const document = await extractOffice(wordFixture(), 'DOCX', options);
  assert.match(document.pages[0].text, /Permutation counts ordered arrangements/);
  assert.match(document.pages[0].text, /Conditional probability/);
  assert.equal(document.pages[0].location, 'Paragraphs 1–2');
  assert.equal(document.partial, false);
});

test('Office passage search respects filters, current revisions and accounts, and opens the LEARN viewer', async () => {
  for (const [format, bytes, expected] of [['PPTX', slideFixture(), 'slide 2'], ['DOCX', wordFixture(), 'paragraphs 1–2']]) {
    const item = resource(format), document = await extractOffice(bytes, format, options);
    const cache = { all: async () => [{ ...document, id: item.id, accountId: 'A', revision: pdfRevision(item) }] };
    const index = { accountId: 'A', resources: [item], history: {}, pdfLabels: {} };
    const found = await searchPdfCache(cache, index, 'stat230 permutation');
    assert.equal(found.length, 1);
    assert.equal(found[0].url, item.url);
    assert.match(matchExplanation(found[0], 'permutation'), new RegExp(expected));
    for (const filters of [{ courseId: '231' }, { source: 'Piazza' }, { recent: true }, { instructor: 'Other' }]) assert.deepEqual(await searchPdfCache(cache, index, 'permutation', filters), []);
    assert.deepEqual(await searchPdfCache(cache, { ...index, accountId: 'B' }, 'permutation'), []);
    assert.deepEqual(await searchPdfCache(cache, { ...index, resources: [{ ...item, modifiedAt: 'changed' }] }, 'permutation'), []);
  }
});

test('LEARN distinguishes modern Office formats from legacy title-only documents', () => {
  const resources = normalizeToc({ Modules: [{ Title: 'Notes', Topics: ['pptx', 'docx', 'ppt', 'doc'].map((extension, i) => ({ TopicId: i + 1, Title: 'Notes', Url: `/content/notes.${extension}` })) }] }, { id: '230', code: 'STAT230' }, 'A');
  assert.deepEqual(resources.map(item => item.documentFormat), ['PPTX', 'DOCX', undefined, undefined]);
  assert.equal(resources[0].documentUrl, 'https://learn.uwaterloo.ca/content/notes.pptx');
  assert.equal(resources[2].legacyOffice, true);
});

test('Office failures and unfinished work use the durable account-scoped progress ledger', () => {
  const item = resource('DOCX'), index = { accountId: 'A', generation: 'G', resources: [item] };
  const payload = { accountId: 'A', generation: 'G', resourceId: item.id, revision: pdfRevision(item), requestId: 'run', state: 'pending' };
  const started = updatePdfProgress(null, index, payload);
  const failed = updatePdfProgress(started, index, { ...payload, state: 'failed', error: 'Damaged archive' });
  assert.equal(reconcilePdfProgress(failed, index).entries.DOCX.state, 'failed');
  assert.deepEqual(reconcilePdfProgress(failed, { ...index, accountId: 'B' }).entries, {});
  assert.deepEqual(reconcilePdfProgress(failed, index, [{ id: item.id }]).entries, {});
});

test('ZIP reader supports stored XML and rejects corruption, traversal, and expansion beyond declared or actual limits', async () => {
  assert.equal(await openOfficeZip(officeZip({ 'word/document.xml': 'hello' }, { stored: true }))('word/document.xml'), 'hello');
  const corrupt = officeZip({ 'word/document.xml': 'hello' }, { stored: true });
  corrupt[30 + 'word/document.xml'.length] ^= 1;
  await assert.rejects(openOfficeZip(corrupt)('word/document.xml'), /damaged/);
  assert.throws(() => openOfficeZip(officeZip({ '../bad.xml': 'hello' })), /damaged/);
  await assert.rejects(openOfficeZip(officeZip({ 'word/document.xml': 'x'.repeat(10000) }, { declaredSize: 2 }))('word/document.xml'), /limit/);
  await assert.rejects(openOfficeZip(officeZip({ 'word/document.xml': 'x'.repeat(4 * 1024 * 1024 + 1) }))('word/document.xml'), /limit/);
  assert.throws(() => openOfficeZip(new Uint8Array(4)), /damaged/);
  const encrypted = officeZip({ 'word/document.xml': 'hello' });
  const view = new DataView(encrypted.buffer);
  view.setUint16(6, 1, true);
  const centralOffset = view.getUint32(encrypted.length - 6, true);
  view.setUint16(centralOffset + 8, 1, true);
  await assert.rejects(openOfficeZip(encrypted)('word/document.xml'), /damaged/);
});

test('external slide relationships, missing parts, XML declarations, and cancellation fail without fetching anything', async () => {
  const parts = slideParts();
  parts['ppt/_rels/presentation.xml.rels'] = parts['ppt/_rels/presentation.xml.rels'].replace('Target="slides/slide2.xml"', 'Target="https://example.test/evil.xml" TargetMode="External"');
  await assert.rejects(extractOffice(officeZip(parts), 'PPTX', options), /relationship/);
  await assert.rejects(extractOffice(officeZip({ 'word/document.xml': '<!DOCTYPE x><x/>' }), 'DOCX', options), /declarations/);
  await assert.rejects(extractOffice(wordFixture(), 'PPTX', options), /missing/);
  await assert.rejects(extractOffice(officeZip({ 'word/document.xml': '<document><p>Wrong namespace</p></document>' }), 'DOCX', options), /Invalid Word/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(extractOffice(wordFixture(), 'DOCX', { ...options, signal: abort.signal }), { name: 'AbortError' });
});

test('Word passages are bounded and long paragraphs explicitly report truncated coverage', async () => {
  const document = await extractOffice(officeZip({ 'word/document.xml': wordXml(wordParagraph('word '.repeat(7000))) }), 'DOCX', options);
  assert.equal(document.pages[0].text.length, 30000);
  assert.equal(document.partial, true);
});

test('Office downloads are same-origin and reject login responses, wrong signatures and external URLs', async () => {
  const item = resource('DOCX');
  assert.ok((await downloadDocument(item, { fetchImpl: async (_, init) => {
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error');
    return new Response(wordFixture());
  } })).length);
  await assert.rejects(downloadDocument(item, { fetchImpl: async () => new Response('login', { headers: { 'Content-Type': 'text/html' } }) }), /page instead/);
  await assert.rejects(downloadDocument(item, { fetchImpl: async () => new Response('%PDF-1.0') }), /DOCX/);
  await assert.rejects(downloadDocument({ ...item, documentUrl: 'https://example.test/notes.docx' }), /Unsupported/);
});
