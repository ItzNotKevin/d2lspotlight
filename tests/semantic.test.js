import test from 'node:test';
import assert from 'node:assert/strict';
import { cosine, semanticCandidates, mergeSemantic, embeddingText } from '../src/semantic/retrieval.js';
import { associateCourses } from '../src/search/associations.js';
import { searchResources } from '../src/learn/search.js';
import { semanticRequest } from '../src/semantic/broker.js';

test('assignment aliases work both ways across actual filename separators and leading zeroes', () => {
  const names = ['A1', 'Assignment1', 'Assignment 01', 'a_01_notes.pdf', 'assn-1', 'homework1', 'HW_01'];
  for (const title of names) for (const query of ['a1', 'assignment1', 'assignment 1', 'assn_01']) {
    const resource = { id: title, title, course: 'CS 246', path: '' };
    assert.equal(searchResources([resource], { query })[0], resource, `${query} → ${title}`);
  }
  assert.equal(searchResources([{ id: '12', title: 'a_12_notes', path: 'Assignment 1 discussion' }], { query: 'assignment 1' }).length, 0);
});

test('unique course codes associate; duplicates remain separate with explicit ambiguity', () => {
  const learn = [{ id: '100', code: 'CS_246_F26', name: 'CS 246' }];
  const piazza = [{ id: 'piazza:abc', name: 'CS246' }];
  const post = { id: 'post', courseId: 'piazza:abc', source: 'Piazza' };
  const combined = associateCourses(learn, piazza, [post]);
  assert.equal(combined.resources[0].courseId, '100');
  assert.equal(combined.resources[0].sourceCourseId, 'piazza:abc');
  assert.equal(combined.courses.length, 1);
  assert.equal(post.courseId, 'piazza:abc');
  const duplicate = associateCourses([...learn, { id: '101', code: 'CS246', name: 'CS 246' }], piazza, [post]);
  assert.deepEqual(duplicate.ambiguous, ['CS 246']);
  assert.equal(duplicate.resources[0], post);
  const confirmed = associateCourses([...learn, { id: '101', code: 'CS246', name: 'CS 246 other section' }], piazza, [post], { 'piazza:abc': '101' });
  assert.equal(confirmed.resources[0].courseId, '101');
  assert.deepEqual(confirmed.ambiguous, []);
});

test('model broker rejects untrusted callers and bounds requests before creating an offscreen document', async () => {
  let created = 0;
  const api = { runtime: { id: 'extension', getURL: (path) => `chrome-extension://extension/${path}`,
    getContexts: async () => [], sendMessage: async (message) => ({ ok: true, type: message.type }) },
    offscreen: { createDocument: async () => { created++; } } };
  const message = { scope: 'accounts', query: 'counting', documents: [{ id: 'doc', text: 'Combinatorics' }] };
  await assert.rejects(semanticRequest(message, { id: 'other', tab: { id: 1 }, frameId: 0 }, api));
  await assert.rejects(semanticRequest({ ...message, query: 'a'.repeat(501) }, { id: 'extension', tab: { id: 1 }, frameId: 0 }, api));
  assert.equal(created, 0);
  const result = await semanticRequest(message, { id: 'extension', tab: { id: 1 }, frameId: 0 }, api);
  assert.equal(created, 1);
  assert.equal(result.type, 'semantic-engine');
});

test('explicitly conflicting course terms require confirmation despite a unique course code', () => {
  const combined = associateCourses([{ id: '100', code: 'CS_246_F26', name: 'CS 246' }],
    [{ id: 'piazza:abc', name: 'CS 246 Winter 2026' }], []);
  assert.equal(combined.courses.length, 2);
  assert.equal(combined.choices[0].conflictingTerm, true);
});

test('semantic results obey hard course/assignment filters and cannot fabricate destinations', () => {
  const records = [{ id: 'right', title: 'A2 class hierarchies', course: 'CS 246', courseId: '100', source: 'Piazza', type: 'POST', path: '', url: 'https://piazza.com/class/abc?cid=2' },
    { id: 'wrong', title: 'A12 inheritance', course: 'CS 246', courseId: '100', source: 'Piazza', path: '' }];
  const options = { query: 'cs246 assignment2 inheritance', courseId: '100' };
  const candidates = semanticCandidates(records, options);
  assert.deepEqual(candidates.map((resource) => resource.id), ['right']);
  const results = mergeSemantic([], candidates, [{ id: 'fake', score: 1 }, { id: 'wrong', score: 1 }, { id: 'right', score: .8 }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, records[0].url);
  assert.equal(mergeSemantic([records[0]], candidates, [{ id: 'right', score: 1 }]).length, 1);
  assert.equal(mergeSemantic([], candidates, [{ id: 'right', score: .1 }]).length, 0);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 2], [1, 2]), 1);
  assert.ok(embeddingText(records[0]).includes('CS 246'));
});
