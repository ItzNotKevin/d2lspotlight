import test from 'node:test';
import assert from 'node:assert/strict';
import { searchResources } from '../src/learn/search.js';
import { hybridSearch, semanticConstraintsMatch } from '../src/search/hybrid.js';
import { semanticNaturalQuery } from '../src/search/rank.js';
import { resourceText } from '../src/search/semantic/model.js';
const resource = (id, course, title = 'Course outline') => ({ id, course, title, path: '', source: 'LEARN', type: 'PDF' });

test('bare course numbers retain all matching subjects without matching incidental document numbers', () => {
  const records = [resource('cs', 'CS_246_001_F26'), resource('math', 'MATH 246'), resource('other', 'CS245', 'Outline 246'), resource('longer', 'CS1246')];
  assert.deepEqual(new Set(searchResources(records, { query: '246 outline' }).map(item => item.id)), new Set(['cs', 'math']));
  assert.deepEqual(searchResources(records, { query: 'cs246 outline' }).map(item => item.id), ['cs']);
  assert.equal(semanticConstraintsMatch(records[0], '246 outline'), true);
  assert.equal(semanticConstraintsMatch(records[2], '246 outline'), false);
  assert.equal(semanticNaturalQuery('246 textbook'), 'textbook');
  assert.equal(semanticNaturalQuery('CS 246 textbook'), 'textbook');
});

test('numbered assignments retain assignment identity rather than becoming course constraints', () => {
  const records = [resource('a', 'CS245', 'Assignment 246'), resource('b', 'CS246', 'Assignment 245')];
  assert.deepEqual(searchResources(records, { query: 'assignment 246' }).map(item => item.id), ['a']);
});

test('meaning matches for course notes still obey bare and explicit course constraints', () => {
  const records = [resource('cs', 'CS246', 'Course notes'), resource('math', 'MATH246', 'Course notes'), resource('wrong', 'CS245', 'Course notes')];
  const matches = records.map(item => ({ id: item.id, score: .7 }));
  assert.deepEqual(new Set(hybridSearch(records, { query: '246 textbook' }, matches).map(item => item.id)), new Set(['cs', 'math']));
  assert.deepEqual(hybridSearch(records, { query: 'cs246 textbook' }, matches).map(item => item.id), ['cs']);
});

test('semantic context includes bounded saved evidence without inventing textbook aliases', () => {
  const text = resourceText({ ...resource('book', 'CS246', 'Course notes'), description: '<p>Complete reference for the course.</p><script>bad()</script>', snippet: 'Chapters and exercises.' });
  assert.ok(text.includes('Complete reference for the course.'));
  assert.ok(text.includes('Chapters and exercises.'));
  assert.ok(!text.includes('bad()') && !text.includes('<p>') && !text.includes('textbook'));
  assert.ok(resourceText({ title: 'Notes', description: 'x'.repeat(5000) }).length < 700);
});
