import test from 'node:test';
import assert from 'node:assert/strict';
import { filterResources, searchResources } from '../src/learn/search.js';
import { hybridSearch } from '../src/search/hybrid.js';
import { pdfRevision } from '../src/search/pdf/core.js';
import { searchPdfCache } from '../src/search/pdf/background.js';
import { indexingCandidates } from '../src/search/pdf/scope.js';
const resources = ['one', 'two'].map(id => ({ id, title: 'Course notes', course: 'CS246', courseId: '246', source: 'LEARN', type: 'PDF', pdfUrl: `https://learn.uwaterloo.ca/content/${id}.pdf`, url: `https://learn.uwaterloo.ca/content/${id}.pdf` }));

test('document scope separates files in the same course and also recognizes passage parents', () => {
  assert.deepEqual(filterResources(resources, { documentId: 'one' }).map(item => item.id), ['one']);
  assert.deepEqual(filterResources([...resources, { ...resources[0], id: 'one:page:2', resourceId: 'one' }], { documentId: 'one' }).map(item => item.id), ['one', 'one:page:2']);
  assert.deepEqual(filterResources(resources, { documentId: 'missing' }), []);
  assert.deepEqual(filterResources(resources, { documentId: 'one', source: 'Piazza' }), []);
});

test('keyword and metadata meaning matches obey the same document scope', () => {
  assert.deepEqual(searchResources(resources, { query: 'course notes', documentId: 'one' }).map(item => item.id), ['one']);
  assert.deepEqual(hybridSearch(resources, { query: 'textbook', documentId: 'one' }, resources.map(item => ({ id: item.id, score: .8 }))).map(item => item.id), ['one']);
});

test('document text search retains physical page links and cannot escape to another file', async () => {
  const documents = resources.map(resource => ({ id: resource.id, accountId: 'A', revision: pdfRevision(resource), pages: [{ page: 3, text: 'A permutation is an ordered arrangement.' }] }));
  const matches = await searchPdfCache({ all: async () => documents }, { accountId: 'A', resources, history: {} }, 'permutation', { documentId: 'two' });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].resourceId, 'two');
  assert.equal(matches[0].url, `${resources[1].pdfUrl}#page=3`);
});

test('follow-search indexing can focus one document while explicit course selections keep their scope', () => {
  const index = { resources };
  assert.deepEqual(indexingCandidates(index, { documentId: 'one' }, null).map(item => item.id), ['one']);
  assert.deepEqual(indexingCandidates(index, { documentId: 'one' }, ['246']).map(item => item.id), ['one', 'two']);
});
