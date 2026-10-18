import test from 'node:test';
import assert from 'node:assert/strict';
import { documentCoverage } from '../src/search/pdf/coverage.js';
import { pdfRevision } from '../src/search/pdf/core.js';

const resources = ['cached', 'partial', 'failed', 'replaced', 'pending'].map(id => ({
  id, type: 'PDF', pdfUrl: `https://learn.uwaterloo.ca/${id}.pdf`, modifiedAt: 'v1',
}));
const revision = id => pdfRevision(resources.find(resource => resource.id === id));

test('coverage separates searchable, partial, failed, replaced and pending documents', () => {
  const result = documentCoverage(resources, {
    documents: [{ id: 'cached', revision: revision('cached') }, { id: 'partial', revision: revision('partial'), emptyPages: 1 }],
    progress: {
      cached: { revision: revision('cached'), state: 'failed', error: 'Old attempt' },
      failed: { revision: revision('failed'), state: 'failed', error: 'HTTP 404' },
      replaced: { revision: revision('replaced'), state: 'evicted' },
    },
  });
  assert.deepEqual(result, { total: 5, indexed: 2, partial: 1, pending: 1, replaced: 1,
    failures: [{ resource: resources[2], error: 'HTTP 404' }] });
});

test('changed documents do not count stale cached text or show stale failures', () => {
  const result = documentCoverage(resources.slice(0, 2), {
    documents: [{ id: 'cached', revision: 'old' }],
    progress: { partial: { revision: 'old', state: 'failed', error: 'Stale failure' } },
  });
  assert.equal(result.indexed, 0);
  assert.equal(result.pending, 2);
  assert.deepEqual(result.failures, []);
});

test('coverage stays within the supplied search scope and handles empty status', () => {
  assert.equal(documentCoverage(resources.slice(0, 1), null).pending, 1);
  assert.deepEqual(documentCoverage([], { documents: [{ id: 'outside', revision: 'v1' }] }),
    { total: 0, indexed: 0, partial: 0, pending: 0, replaced: 0, failures: [] });
});
