import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPendingHandwriting } from '../src/search/ocr/progress.js';
import { indexingCandidates } from '../src/search/pdf/scope.js';
import { OCR_VERSION } from '../src/search/ocr/config.js';

const resource = (id, courseId) => ({ id, courseId, type: 'PDF', pdfUrl: `https://learn.uwaterloo.ca/${id}.pdf` });
test('continuing handwriting respects indexing selection and search filters', () => {
  const index = { resources: [resource('a', 'stat'), resource('b', 'math')] };
  const ids = (filters, selection) => indexingCandidates(index, filters, selection, '@handwriting').map(resource => resource.id);
  assert.deepEqual(ids({ courseId: 'stat' }, null), ['a']);
  assert.deepEqual(ids({ courseId: 'stat' }, ['math']), ['b']);
  assert.deepEqual(ids({}, []), []);
  assert.deepEqual(ids({ source: 'Piazza' }, null), []);
  assert.deepEqual(ids({}, null), ['a', 'b']);
});
test('continuing handwriting skips missing, stale, failed and completed documents', () => {
  const document = { revision: 'current', ocr: { version: OCR_VERSION, nextPage: 5, regionOffset: 8 } };
  assert.equal(hasPendingHandwriting(document, 'current'), true);
  assert.equal(hasPendingHandwriting({ revision: 'current' }, 'current'), true);
  assert.equal(hasPendingHandwriting(undefined, 'current'), false);
  assert.equal(hasPendingHandwriting(document, 'new'), false);
  assert.equal(hasPendingHandwriting({ ...document, ocr: { ...document.ocr, error: 'Could not read page' } }, 'current'), false);
  assert.equal(hasPendingHandwriting({ ...document, ocr: { ...document.ocr, complete: true } }, 'current'), false);
  assert.equal(hasPendingHandwriting({ ...document, ocr: { version: 'old', complete: true } }, 'current'), true);
});
