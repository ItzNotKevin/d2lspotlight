import test from 'node:test';
import assert from 'node:assert/strict';
import { courseCodeFromTitle, piazzaCourseName, detectPiazzaCourse } from '../src/piazza/course.js';
import { searchResources } from '../src/learn/search.js';

test('course detection falls back to the Piazza header when the tab title is generic', () => {
  const doc = { title: 'Piazza', querySelector: () => ({ textContent: 'CS 246 115 unread' }) };
  assert.equal(detectPiazzaCourse(doc, 'abc', 'abc'), 'CS 246');
  assert.equal(detectPiazzaCourse(doc, 'other', 'abc'), '');
});

test('Piazza course labels use the current class title and remain searchable', () => {
  const course = piazzaCourseName('abc', { title: 'CS 246 (65 unread) | Piazza', pageClassId: 'abc' });
  assert.equal(course, 'CS 246');
  assert.equal(courseCodeFromTitle('CS246 | Piazza'), 'CS 246');
  assert.equal(searchResources([{ id: 'post', title: 'A2 Available', course, path: '', source: 'Piazza' }], { query: 'cs246 a2' }).length, 1);
  assert.equal(piazzaCourseName('other', { title: 'CS 246 | Piazza', pageClassId: 'abc', savedName: 'STAT 230' }), 'STAT 230');
  assert.equal(piazzaCourseName('abc', { enteredName: 'MATH 135' }), 'MATH 135');
  assert.equal(piazzaCourseName('abc'), 'Piazza · abc');
});
