import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridSearch, semanticConstraintsMatch } from '../src/search/hybrid.js';
import { cacheKey, embeddingFor, cosineSimilarity, courseDescription, resourceText } from '../src/search/semantic/model.js';
import { searchResources } from '../src/learn/search.js';

const resource = (id, title, extra = {}) => ({ id, title, course: 'MATH 239', courseId: '239',
  path: '', type: 'PDF', source: 'LEARN', accountId: 'student-one', ...extra });

test('sparse notes retain meaningful text without encoded course labels or technical field names', () => {
  const notes = resource('notes', 'Enumeration', { course: 'MATH239_instructor_term_section_1269', path: 'Course Notes' });
  assert.equal(resourceText(notes), 'Enumeration. Course Notes');
  assert.equal(resourceText(notes, 'title'), 'Enumeration');
  assert.equal(courseDescription('MATH 239 - Enumeration and Graph Theory'), 'Enumeration and Graph Theory');
  assert.equal(courseDescription('Combinatorics'), 'Combinatorics');
  assert.equal(courseDescription('class123456789'), '');
  assert.equal(courseDescription('CS 246'), '');
  assert.equal(resourceText({ ...notes, aliases: ['Enumeration', 'course notes'] }), 'Enumeration. Course Notes');
});

test('meaning matches recover different wording while exact titles retain priority', () => {
  const notes = resource('notes', 'Enumeration course notes');
  const exact = resource('exact', 'Combinatorics textbook');
  const records = [notes, exact];
  assert.deepEqual(searchResources(records, { query: 'combinatorics textbook' }).map((item) => item.id), ['exact']);
  const results = hybridSearch(records, { query: 'combinatorics textbook' }, [
    { id: 'notes', score: 0.8 }, { id: 'exact', score: 0.9 }
  ]);
  assert.deepEqual(results.map((item) => item.id), ['exact', 'notes']);
  assert.equal(results[1].semanticMatch, true);
  assert.equal(results[0].semanticMatch, undefined);
});

test('semantic results obey course/source/document/recent filters before limiting', () => {
  const records = [resource('notes', 'Enumeration notes'),
    resource('post', 'Counting reference', { courseId: 'piazza:239', source: 'Piazza', type: 'POST' })];
  const matches = records.map((item) => ({ id: item.id, score: 0.9 }));
  for (const filter of [{ source: 'Piazza' }, { courseId: 'piazza:239' }, { recent: true, history: { post: 1 } }]) {
    assert.deepEqual(hybridSearch(records, { query: 'combinatorics textbook', limit: 1, ...filter }, matches).map((item) => item.id), ['post']);
  }
  assert.deepEqual(hybridSearch(records, { query: 'combinatorics textbook', documents: true }, matches).map((item) => item.id), ['notes']);
});

test('semantic similarity cannot override assignment/course identifiers', () => {
  const records = [resource('right', 'Assignment 2', { course: 'CS 246' }),
    resource('a12', 'Assignment 12', { course: 'CS 246', path: 'Assignment 2 mentioned here' }),
    resource('other', 'Assignment 2', { course: 'CS 245' }),
    resource('unlabelled', 'Programming notes', { course: 'CS 246', path: 'Week 2' })];
  const matches = records.map((item) => ({ id: item.id, score: 0.99 }));
  assert.deepEqual(hybridSearch(records, { query: 'cs246 a2 preparation' }, matches).map((item) => item.id), ['right']);
  assert.equal(semanticConstraintsMatch(records[0], 'cs247 a2'), false);
  assert.equal(semanticConstraintsMatch(records[0], 'CS 246 assignment 02'), true);
  assert.equal(semanticConstraintsMatch(resource('week', 'Week 10 notes'), 'week 10 textbook'), true);
});

test('weak, invalid, deleted, duplicate, and filler-only semantic matches are excluded', () => {
  const records = [resource('notes', 'Enumeration notes')];
  const options = { query: 'combinatorics textbook' };
  for (const score of [0.2, NaN, Infinity, 1.1]) assert.deepEqual(hybridSearch(records, options, [{ id: 'notes', score }]), []);
  assert.deepEqual(hybridSearch(records, options, [{ id: 'deleted', score: 0.9 }]), []);
  assert.equal(hybridSearch(records, options, [{ id: 'notes', score: 0.9 }, { id: 'notes', score: 0.8 }]).length, 1);
  assert.deepEqual(hybridSearch(records, { query: 'please' }, [{ id: 'notes', score: 0.9 }]), []);
});

test('embedding cache reuses unchanged resources and invalidates content/course changes', async () => {
  const entries = new Map();
  const cache = { get: async (key) => entries.get(key), put: async (entry) => entries.set(entry.key, entry) };
  let calls = 0;
  const options = { cache, dimensions: 2, embed: async () => { calls++; return [1, 0]; } };
  const notes = resource('notes', 'Enumeration notes');
  await embeddingFor(notes, options);
  await embeddingFor({ ...notes }, options);
  assert.equal(calls, 1);
  await embeddingFor({ ...notes, course: 'Combinatorics' }, options);
  await embeddingFor({ ...notes, path: 'Counting techniques' }, options);
  assert.equal(calls, 3);
  await embeddingFor({ ...notes, accountId: 'student-two' }, options);
  await embeddingFor({ ...notes, source: 'Piazza' }, options);
  assert.equal(calls, 5);
  assert.notEqual(cacheKey(notes), cacheKey({ ...notes, accountId: 'student-two' }));
});

test('invalid cached vectors are rebuilt and invalid model outputs are not saved', async () => {
  const entries = new Map();
  const cache = { get: async (key) => entries.get(key), put: async (entry) => entries.set(entry.key, entry) };
  const notes = resource('notes', 'Notes');
  const options = { cache, dimensions: 2, embed: async () => [1, 0] };
  await embeddingFor(notes, options);
  entries.get(cacheKey(notes)).vector = [NaN, 0];
  assert.deepEqual(await embeddingFor(notes, options), [1, 0]);
  await assert.rejects(embeddingFor({ ...notes, title: 'Changed' }, { ...options, embed: async () => [0, 0] }), /Invalid embedding/);
});

test('title and contextual embeddings are cached separately and a path change preserves the title vector', async () => {
  const entries = new Map();
  const cache = { get: async (key) => entries.get(key), put: async (entry) => entries.set(entry.key, entry) };
  const calls = [];
  const options = { cache, dimensions: 2, embed: async (text) => { calls.push(text); return [1, 0]; } };
  const notes = resource('notes', 'Enumeration', { path: 'Course Notes' });
  await embeddingFor(notes, options);
  await embeddingFor(notes, { ...options, view: 'title' });
  assert.deepEqual(calls, ['Enumeration. Course Notes', 'Enumeration']);
  const changed = { ...notes, path: 'Course Notes / Counting exercises' };
  await embeddingFor(changed, options);
  await embeddingFor(changed, { ...options, view: 'title' });
  assert.equal(calls.length, 3);
  assert.equal(entries.size, 2);
});

test('cosine similarity handles normalized and unnormalized vectors without NaN results', () => {
  assert.equal(cosineSimilarity([2, 0], [3, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  for (const vector of [[0, 0], [NaN, 1], [1]]) assert.equal(cosineSimilarity([1, 0], vector), -1);
});
