import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridSearch } from '../src/search/hybrid.js';
import { associateCourses } from '../src/search/associations.js';
import { searchResources } from '../src/learn/search.js';

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

test('explicitly conflicting course terms require confirmation despite a unique course code', () => {
  const combined = associateCourses([{ id: '100', code: 'CS_246_F26', name: 'CS 246' }],
    [{ id: 'piazza:abc', name: 'CS 246 Winter 2026' }], []);
  assert.equal(combined.courses.length, 2);
  assert.equal(combined.choices[0].conflictingTerm, true);
});

test('associated course filter retains semantic hits from both sources with strict assignment IDs', () => {
  const learn = [{ id: '100', code: 'CS246', name: 'CS 246' }];
  const piazza = [{ id: 'piazza:abc', name: 'CS246' }];
  const records = [
    { id: 'learn', title: 'A2 guide', courseId: '100', course: 'CS246', source: 'LEARN' },
    { id: 'post', title: 'A2 clarification', courseId: 'piazza:abc', course: 'CS246', source: 'Piazza' },
    { id: 'wrong', title: 'A12 guide', courseId: 'piazza:abc', course: 'CS246', source: 'Piazza' },
  ];
  const combined = associateCourses(learn, piazza, records);
  const results = hybridSearch(combined.resources, { query: 'cs246 a2 preparation', courseId: '100' }, records.map(r => ({ id: r.id, score: .8 })));
  assert.deepEqual(new Set(results.map(r => r.id)), new Set(['learn', 'post']));
});
