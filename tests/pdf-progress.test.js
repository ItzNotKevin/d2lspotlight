import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePdfProgress, updatePdfProgress } from '../src/search/pdf/progress.js';
import { pdfRevision } from '../src/search/pdf/core.js';

const resource = { id: 'pdf', courseId: '246', type: 'PDF', pdfUrl: 'https://learn.uwaterloo.ca/content/notes.pdf', modifiedAt: 'v1' };
const index = { accountId: 'A', generation: 'g1', resources: [resource] };
const attempt = { accountId: 'A', generation: 'g1', resourceId: 'pdf', revision: pdfRevision(resource), requestId: 'attempt-1', state: 'pending' };

test('unfinished attempts and failures survive serialization and a new refresh generation', () => {
  const pending = updatePdfProgress(null, index, attempt);
  assert.equal(reconcilePdfProgress(JSON.parse(JSON.stringify(pending)), { ...index, generation: 'g2' }).entries.pdf.state, 'pending');
  const failed = updatePdfProgress(pending, index, { ...attempt, state: 'failed', error: 'PDF unavailable (HTTP 404).' });
  assert.equal(reconcilePdfProgress(JSON.parse(JSON.stringify(failed)), { ...index, generation: 'g2' }).entries.pdf.error, 'PDF unavailable (HTTP 404).');
});

test('completed, removed, changed or other-account documents do not retain stale failures', () => {
  const pending = updatePdfProgress(null, index, attempt);
  assert.deepEqual(reconcilePdfProgress(pending, index, [{ id: 'pdf', revision: pdfRevision(resource) }]).entries, {});
  assert.deepEqual(reconcilePdfProgress(pending, { ...index, resources: [] }).entries, {});
  assert.deepEqual(reconcilePdfProgress(pending, { ...index, resources: [{ ...resource, modifiedAt: 'v2' }] }).entries, {});
  assert.deepEqual(reconcilePdfProgress(pending, { ...index, accountId: 'B' }).entries, {});
});

test('old accounts, generations and attempt replies cannot overwrite a newer retry', () => {
  const first = updatePdfProgress(null, index, attempt);
  const second = updatePdfProgress(first, index, { ...attempt, requestId: 'attempt-2' });
  assert.equal(updatePdfProgress(second, index, { ...attempt, state: 'failed', error: 'Old failure' }).entries.pdf.requestId, 'attempt-2');
  assert.throws(() => updatePdfProgress(second, index, { ...attempt, generation: 'old' }), /data changed/);
  assert.throws(() => updatePdfProgress(second, index, { ...attempt, accountId: 'B' }), /data changed/);
  assert.throws(() => updatePdfProgress(second, index, { ...attempt, revision: 'old' }), /data changed/);
});
