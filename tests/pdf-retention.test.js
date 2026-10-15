import test from 'node:test';
import assert from 'node:assert/strict';
import { planPdfRetention, shouldIndexPdf } from '../src/search/pdf/retention.js';
import { pdfRevision } from '../src/search/pdf/core.js';

const resources = [{ id: 'a', courseId: 'A' }, { id: 'b', courseId: 'B' }, { id: 'c', courseId: 'C' }];
const documents = [{ id: 'a', chars: 40, lastUsedAt: 100 }, { id: 'b', chars: 40, lastUsedAt: 200 }];
const incoming = { id: 'c', chars: 40 };

test('cache replacement retains recently used text and respects both count and size limits', () => {
  assert.deepEqual(planPdfRetention(documents, incoming, resources, [], { documents: 2, chars: 100 }), ['a']);
  assert.deepEqual(planPdfRetention(documents, { ...incoming, chars: 70 }, resources, [], { documents: 10, chars: 100 }), ['a', 'b']);
  assert.deepEqual(planPdfRetention(documents, { ...incoming, chars: 1 }, resources, [], { documents: 10, chars: 100 }), []);
});

test('pinned courses are protected and impossible inserts do not produce a destructive plan', () => {
  assert.deepEqual(planPdfRetention(documents, incoming, resources, ['A'], { documents: 2, chars: 100 }), ['b']);
  assert.throws(() => planPdfRetention(documents, incoming, resources, ['A', 'B'], { documents: 2, chars: 100 }), /Unpin/);
  assert.throws(() => planPdfRetention(documents, { ...incoming, chars: 101 }, resources, [], { documents: 10, chars: 100 }), /cache is full/);
  assert.equal(documents.length, 2);
});

test('updating a document excludes its old copy, and legacy entries use deterministic oldest-first replacement', () => {
  assert.deepEqual(planPdfRetention(documents, { id: 'a', chars: 45 }, resources, [], { documents: 2, chars: 100 }), []);
  assert.deepEqual(planPdfRetention([{ id: 'b', chars: 40 }, { id: 'a', chars: 40 }], incoming, resources, [], { documents: 2, chars: 100 }), ['a']);
});

test('automatic indexing does not cycle through replaced files, while course selection and retry can restore them', () => {
  const resource = { id: 'a', pdfUrl: 'https://learn.uwaterloo.ca/content/a.pdf' };
  const progress = { revision: pdfRevision(resource), state: 'evicted' };
  assert.equal(shouldIndexPdf(resource, undefined, progress, null), false);
  assert.equal(shouldIndexPdf(resource, undefined, progress, '@selection'), true);
  assert.equal(shouldIndexPdf(resource, undefined, progress, '*'), true);
  assert.equal(shouldIndexPdf(resource, pdfRevision(resource), progress, '*'), false);
  assert.equal(shouldIndexPdf({ ...resource, modifiedAt: 'new' }, undefined, progress, null), true);
});

test('selecting a course restores replaced text without silently retrying saved failures', () => {
  const resource = { id: 'a', pdfUrl: 'https://learn.uwaterloo.ca/content/a.pdf' };
  const progress = { revision: pdfRevision(resource), state: 'failed' };
  assert.equal(shouldIndexPdf(resource, undefined, progress, '@selection'), false);
  assert.equal(shouldIndexPdf(resource, undefined, progress, '*'), true);
  assert.equal(shouldIndexPdf(resource, undefined, progress, 'a'), true);
});
