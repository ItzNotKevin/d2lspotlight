import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareQuery, prepareSearchQuery, rankResource, semanticQueryText } from '../src/search/rank.js';
import { searchResources } from '../src/learn/search.js';
import { hybridSearch } from '../src/search/hybrid.js';

const resource = (id, title, extra = {}) => ({ id, title, path: '', course: 'CS 246', courseId: '246', type: 'PDF', source: 'LEARN', ...extra });

test('topic titles outrank generic notes with an incidental topic mention', () => {
  for (const topic of ['inheritance', 'combinatorics', 'probability']) {
    const resources = [resource('generic', 'Lecture notes', { path: `${topic} mentioned in overview` }),
      resource('specific', `${topic} fundamentals`, { path: 'Course Notes' }),
      resource('unrelated', 'Lecture notes', { path: 'Chemistry' })];
    assert.deepEqual(searchResources(resources, { query: `${topic} notes` }).map((item) => item.id), ['specific', 'generic']);
  }
});

test('resource words are soft preferences only when a subject is present', () => {
  const resources = [resource('topic', 'Inheritance and polymorphism'), resource('generic', 'Lecture notes')];
  assert.equal(searchResources(resources, { query: 'inheritance notes' })[0].id, 'topic');
  assert.deepEqual(searchResources(resources, { query: 'notes' }).map((item) => item.id), ['generic']);
  assert.deepEqual(searchResources(resources, { query: 'cs246 lecture notes' }).map((item) => item.id), ['generic']);
  assert.deepEqual(prepareQuery('inheritance notes').topics, ['inheritance']);
  assert.deepEqual(prepareQuery('cs246 notes').preferences, []);
});

test('index frequency gives distinctive topics more weight than ubiquitous words', () => {
  const records = Array.from({ length: 30 }, (_, i) => resource(`general-${i}`, 'Introduction', { path: 'Course Notes' }));
  records.push(resource('generic', 'Introduction', { path: 'Inheritance' }),
    resource('topic', 'Inheritance', { path: 'Introduction' }));
  const query = prepareSearchQuery(records, 'introduction inheritance');
  assert.ok(query.weights.get('inheritance') > query.weights.get('introduction'));
  assert.equal(searchResources(records, { query: 'introduction inheritance' })[0].id, 'topic');
});

test('semantic query embeddings focus on topics rather than generic resource words', () => {
  for (const [query, expected] of [
    ['inheritance notes', 'inheritance'], ['combinatorics textbook', 'combinatorics'],
    ['probability slides', 'probability'], ['please find notes about inheritance', 'inheritance'],
    ['cs246 inheritance notes', 'inheritance'], ['lecture notes', 'lecture notes']
  ]) assert.equal(semanticQueryText(query), expected);
});

test('strong semantic topic matches can outrank weak keyword matches across sources', () => {
  const resources = [resource('weak', 'Lecture notes', { path: 'Inheritance mentioned in passing' }),
    resource('meaning', 'Class hierarchies', { path: 'Object oriented programming', source: 'Piazza' }),
    resource('exact', 'Inheritance notes')];
  const results = hybridSearch(resources, { query: 'inheritance notes' }, [
    { id: 'weak', score: 0.55 }, { id: 'meaning', score: 0.85 }, { id: 'exact', score: 0.6 }
  ]);
  assert.deepEqual(results.map((item) => item.id), ['exact', 'meaning', 'weak']);
  assert.equal(results[1].semanticMatch, true);
});

test('blending ranks before limiting and does not duplicate lexical/semantic candidates', () => {
  const resources = [...Array.from({ length: 120 }, (_, i) => resource(`weak-${i}`, 'Lecture notes', { path: 'Inheritance overview' })),
    resource('meaning', 'Class hierarchies', { source: 'Piazza' })];
  const results = hybridSearch(resources, { query: 'inheritance notes', limit: 1 }, [
    { id: 'weak-0', score: 0.45 }, { id: 'meaning', score: 0.95 }, { id: 'meaning', score: 0.9 }
  ]);
  assert.deepEqual(results.map((item) => item.id), ['meaning']);
});

test('exact assignment identity stays ahead of semantic materials in its module and other courses are excluded', () => {
  const records = [resource('assignment', 'Assignment 2', { path: 'Preparation' }),
    resource('related', 'Preparation notes', { path: 'Assignment 2' }),
    resource('wrong-assignment', 'Assignment 12', { path: 'Assignment 2 preparation' }),
    resource('wrong-course', 'Assignment 2', { course: 'CS 245', path: 'CS 246 preparation' })];
  const matches = records.map((item) => ({ id: item.id, score: item.id === 'assignment' ? 0.5 : 0.95 }));
  assert.deepEqual(hybridSearch(records, { query: 'cs246 a2 preparation' }, matches).map((item) => item.id), ['assignment', 'related']);
  assert.equal(rankResource(records[3], prepareQuery('cs246 a2')), null);
});
