import test from 'node:test';
import assert from 'node:assert/strict';
import { courseCodeFromTitle, piazzaCourseName, detectPiazzaCourse, courseNameFromProfile } from '../src/piazza/course.js';
import { searchResources } from '../src/learn/search.js';

test('course detection falls back to the Piazza header when the tab title is generic', () => {
  const doc = { title: 'Piazza', querySelectorAll: () => [{ textContent: 'CS 246 115 unread' }] };
  assert.equal(detectPiazzaCourse(doc, 'abc', 'abc'), 'CS 246');
  assert.equal(detectPiazzaCourse(doc, 'other', 'abc'), '');
});

test('all header candidates are checked instead of stopping at an unrelated nav', () => {
  const doc = { title: 'Piazza', querySelectorAll: () => [{ textContent: 'Q & A Resources' }, { textContent: 'CS 246' }] };
  assert.equal(detectPiazzaCourse(doc, 'abc', 'abc'), 'CS 246');
});

test('an opaque fallback in the name field cannot pin an old class ID over detection', () => {
  for (const enteredName of ['abc', 'Piazza · abc']) {
    assert.equal(piazzaCourseName('abc', { enteredName, title: 'CS 246 | Piazza', pageClassId: 'abc', savedName: 'Piazza · abc' }), 'CS 246');
  }
});

test('profile names must belong to the matching class and contain a course code', () => {
  assert.equal(courseNameFromProfile({ networks: [{ id: 'other', name: 'CS 245' }, { id: 'abc', course_number: 'CS246' }] }, 'abc'), 'CS 246');
  assert.equal(courseNameFromProfile({ networks: { abc: { name: 'CS 246' } } }, 'abc'), 'CS 246');
  assert.equal(courseNameFromProfile({ networks: [{ id: 'other', name: 'CS 246' }] }, 'abc'), '');
  assert.equal(courseNameFromProfile({}, 'abc'), '');
});

test('React header fallback accepts a visible top label and excludes post-body course mentions', () => {
  const label = (text, top) => ({ textContent: text, getBoundingClientRect: () => ({ top, width: 80, height: 20 }), closest: () => null });
  const doc = { title: 'Piazza', querySelectorAll: (selector) => selector.startsWith('#') ? [] : [label('CS 246', 50), label('STAT 230', 500)] };
  assert.equal(detectPiazzaCourse(doc, 'abc', 'abc'), 'CS 246');
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
