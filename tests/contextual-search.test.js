import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceContext, queryIntent } from '../src/search/context.js';
import { prepareQuery, rankResource } from '../src/search/rank.js';
import { searchResources } from '../src/learn/search.js';

const note = (id, title, extra = {}) => ({ id, title, courseId: 'stat230-fall', course: 'STAT 230', path: 'Course material', type: 'PDF', source: 'LEARN', ...extra });

test('actual LEARN-style section and term codes support subject inference', () => {
  for (const course of ['STAT_230_001_F26', 'STAT230_F26', 'STAT-230-001', 'STAT 230 (Fall 2026)']) {
    const resource = note(course, 'week_05_annotated.pdf', { course });
    assert.equal(resourceContext(resource).subject, 'probability', course);
    assert.equal(searchResources([resource], { query: 'probability lecture notes' })[0], resource);
  }
  assert.equal(resourceContext(note('other', 'week_05_annotated.pdf', { course: 'STAT_2300_F26' })).subject, '');
});

test('filenames plus course context answer subject and annotation queries without inventing topics', () => {
  const resource = note('week5', 'week_05_annotated.pdf');
  assert.deepEqual(resourceContext(resource), { week: 5, annotated: true, notes: true, subject: 'probability',
    aliases: ['lecture notes', 'annotated notes', 'week 5', 'probability'], related: [] });
  for (const query of ['probability lecture notes', 'stat230 week 5', 'professor notes stat230', "teacher's personal notes", 'annotations']) {
    assert.equal(searchResources([resource], { query })[0]?.id, 'week5', query);
  }
  assert.equal(searchResources([resource], { query: 'conditional probability' }).length, 0);
  assert.equal(searchResources([resource], { query: 'combinatorics' }).length, 0);
  assert.ok(rankResource(resource, prepareQuery('probability notes')).reasons.includes('Course/file context'));
});

test('latest picks the highest indexed lecture week within the requested course', () => {
  const records = [note('old', 'week_02_annotated.pdf'), note('new', 'week_05_annotated.pdf'),
    note('assessment', 'Assignment 12 annotated'), note('other', 'week_12_annotated.pdf', { course: 'STAT 231', courseId: 'stat231-fall' })];
  for (const query of ['latest stat230 notes', 'newest probability notes', 'this week stat230 notes']) {
    assert.deepEqual(searchResources(records, { query }).map((resource) => resource.id), ['new', 'old']);
  }
  assert.equal(queryIntent('most recent notes').latest, true);
  assert.equal(resourceContext(records[2]).notes, false);
  assert.equal(searchResources(records, { query: 'stat230 week 2 notes' })[0].id, 'old');
});

test('latest ranking uses real modification dates only when neither resource has a week', () => {
  const records = [note('old', 'Lecture notes', { modifiedAt: '2026-09-01T00:00:00Z' }),
    note('new', 'Annotated lecture notes', { modifiedAt: '2026-10-01T00:00:00Z' })];
  assert.equal(searchResources(records, { query: 'latest notes' })[0].id, 'new');
});

test('related concepts expand retrieval but exact evidence wins and course identifiers remain strict', () => {
  const records = [note('related', 'Combinatorics'), note('exact', 'Enumeration'), note('unrelated', 'Probability')];
  assert.deepEqual(searchResources(records, { query: 'enumeration' }).map((resource) => resource.id), ['exact', 'related']);
  assert.ok(rankResource(records[0], prepareQuery('enumeration')).reasons.includes('Related concept'));
  assert.equal(searchResources(records, { query: 'stat231 enumeration' }).length, 0);
  assert.equal(searchResources([note('a12', 'Assignment 12 combinatorics')], { query: 'stat230 a2 enumeration' }).length, 0);
});

test('contextual ranking preserves cross-course slots, filters, result caps, and original resource identities', () => {
  const records = [note('old', 'week_01_annotated.pdf'), note('other', 'Lecture notes', { course: 'CS 246', courseId: 'cs246' }),
    note('new', 'week_05_annotated.pdf')];
  const results = searchResources(records, { query: 'latest notes' });
  assert.equal(results.indexOf(records[2]) < results.indexOf(records[0]), true);
  assert.equal(searchResources(records, { query: 'latest notes', courseId: 'stat230-fall', limit: 1 })[0], records[2]);
  assert.equal(searchResources(records, { query: 'latest notes', recent: true, history: { old: 1 } })[0], records[0]);
});
