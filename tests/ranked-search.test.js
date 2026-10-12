import test from 'node:test';
import assert from 'node:assert/strict';
import { searchResources } from '../src/learn/search.js';
import { editDistance } from '../src/search/rank.js';

const resource = (id, title, extra = {}) => ({ id, title, path: '', course: 'CS 246', courseId: '246', type: 'PDF', source: 'LEARN', ...extra });

test('annotated weekly filenames match lecture notes without classifying assignments as notes', () => {
  const records = [resource('notes', 'week_05 annotated.pdf'), resource('assignment', 'Assignment 5')];
  for (const query of ['lecture notes', 'cs246 lecture notes', 'week 5 annotated', 'week_05']) {
    assert.deepEqual(searchResources(records, { query }).map((item) => item.id), ['notes']);
  }
});

test('course formats and assignment aliases match while assignment numbers remain strict', () => {
  const resources = [resource('wrong', 'Assignment 12', { path: 'Assignment 2 mentioned here' }), resource('right', 'Assignment 02'), resource('other-course', 'Assignment 2', { course: 'CS 245' })];
  // A misleading mention must not let the title's Assignment 12 match A2.
  for (const query of ['cs246 a2', 'CS 246 assignment 2', 'cs246 assn 02', 'cs246 hw2']) {
    assert.deepEqual(searchResources(resources, { query }).map((r) => r.id), ['right']);
  }
  assert.equal(searchResources(resources, { query: 'cs246 a3' }).length, 0);
});

test('title matches beat path matches and exact titles beat misspellings across sources', () => {
  const resources = [resource('path', 'Notes', { path: 'inheritance' }), resource('typo', 'Inheritnace', { source: 'Piazza' }), resource('exact', 'Inheritance')];
  assert.equal(searchResources(resources, { query: 'inheritance' })[0].id, 'exact');
  assert.ok(searchResources(resources, { query: 'inheritnace' }).some((r) => r.id === 'exact'));
  assert.equal(editDistance('inheritance', 'inheritnace'), 1);
});

test('fuzzy search is conservative for short terms and numeric identifiers', () => {
  const resources = [resource('mobius', 'Möbius'), resource('c', 'C++ notes'), resource('other', 'CS 2460', { course: 'CS 245' })];
  assert.equal(searchResources(resources, { query: 'mobiuss' })[0].id, 'mobius');
  assert.equal(searchResources(resources, { query: 'xyz' }).length, 0);
  assert.equal(searchResources(resources, { query: 'cs247' }).length, 0);
  assert.deepEqual(searchResources(resources, { query: 'c++' }).map((r) => r.id), ['c']);
});

test('natural filler words do not block matches and filtering happens before the result cap', () => {
  const resources = [...Array.from({ length: 120 }, (_, i) => resource(`l${i}`, 'Lecture notes')), resource('p', 'Lecture notes', { source: 'Piazza' })];
  assert.equal(searchResources(resources, { query: 'please find me lecture notes', source: 'Piazza', limit: 1 })[0].id, 'p');
  assert.equal(searchResources(resources, { query: 'please' }).length, 0);
});
