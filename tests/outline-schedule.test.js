import test from 'node:test';
import assert from 'node:assert/strict';
import { captureOutlineHTML } from '../src/search/outlines/collect.js';
import { parseScheduleSource, scheduleLabel } from '../src/search/outlines/schedule.js';
const record = { id: 'test', course: 'TEST 100', courseCodes: ['TEST 100'], title: 'Test course', term: '1269', sections: '001', sourceUrl: 'https://outline.uwaterloo.ca/viewer/view/test' };
const capture = body => captureOutlineHTML(`<html><body><h1>Test course</h1><h2>Course Description</h2><p>Course topics.</p><h2 id="tentative_class_plan">Tentative Class Plan</h2>${body}<h2>Technology</h2><p>Excluded policy.</p></body></html>`, record).outline;

test('paragraph week/date labels and multiple topic columns preserve their roles', () => {
  const outline = capture('<table><tr><td>Week</td><td>Material</td><td>Text</td><td>Topics</td><td>Due</td></tr><tr><td><p>Week 1</p><p>Sept 9-11</p></td><td>Descriptive statistics</td><td>Ch 1</td><td>Categorical and quantitative data</td><td>Assignment 1 due</td></tr></table>');
  assert.equal(outline.weeks[0].topics, 'Descriptive statistics Categorical and quantitative data');
  assert.deepEqual(outline.weeks[0].dateLabels, ['Sept 9-11']);
  assert.equal(outline.weeks[0].references[0].citation, 'Ch 1');
  assert.equal(outline.scheduleSource.blocks[0].rows[1].cells[0].text, 'Week 1\nSept 9-11');
});

test('blank topic headers and spanning chapter headings support explicit week rows', () => {
  const blank = capture('<table><tr><td>Week</td><td></td><td></td></tr><tr><td>1</td><td>Sufficiency</td><td>Tutorial</td></tr><tr><td>2</td><td>Completeness</td><td>Exam</td></tr></table>');
  assert.deepEqual(blank.weeks.map(week => week.topics), ['Sufficiency', 'Completeness']);
  const chapters = capture('<table><tr><td colspan="2">Chapter 1: Simple linear regression</td><td>Tutorial time</td></tr><tr><td>Week 1</td><td>Introduction</td><td></td></tr><tr><td>Week 2</td><td>Least squares</td><td>Tutorial 1</td></tr></table>');
  assert.deepEqual(chapters.weeks.map(week => week.week), [1, 2]);
  assert.ok(chapters.weeks[1].topics.includes('Least squares'));
});

test('Unicode bullets, explicit ranges and suffix weeks do not invent chapter topics', () => {
  const outline = capture('<p>• Week 1: Chapter 2.1 - 2.3 of Lecture Notes</p><p>Weeks 2–3: Counting and probability</p><p>Random variables (Week 4)</p>');
  assert.deepEqual(outline.weeks.map(week => week.week), [1, 2, 3, 4]);
  assert.equal(outline.weeks[0].topics, '');
  assert.ok(outline.weeks[0].references[0].citation.includes('Chapter 2.1'));
  assert.equal(outline.weeks[3].topics, 'Random variables');
  assert.equal(scheduleLabel('Week 5 Sept 28-Oct 2').date, 'Sept 28-Oct 2');
});

test('rowspans keep lecture dates aligned without creating teaching weeks', () => {
  const outline = capture('<table><tr><td>Lecture</td><td>Date</td><td>Topics</td><td>Tutorial</td><td>Due Dates</td></tr><tr><td>1</td><td>Sept 10</td><td>Input and output</td><td rowspan="2">Tutorial 1</td><td rowspan="2">Assignment due Sept 18</td></tr><tr><td>2</td><td>Sept 15</td><td>Strings and files</td></tr></table>');
  assert.equal(outline.weeks.length, 0);
  assert.equal(outline.scheduleEntries.length, 2);
  assert.equal(outline.scheduleEntries[1].kind, 'lecture');
  assert.deepEqual(outline.scheduleEntries[1].dateLabels, ['Sept 15']);
  assert.equal(outline.scheduleEntries[1].topics, 'Strings and files');
});

test('module intervals, calendar cells and external references remain distinct', () => {
  const modules = capture('<table><tr><td>Module #</td><td>Topics</td><td>Module Start and End Date</td></tr><tr><td>3</td><td>Energy</td><td>Oct 8–28</td></tr></table>');
  assert.equal(modules.scheduleEntries[0].kind, 'module');
  assert.equal(modules.weeks.length, 0);
  const calendar = capture('<table><tr><td colspan="5">September 2026</td></tr><tr><td>Mon</td><td>Tue</td><td>Wed</td><td>Thu</td><td>Fri</td></tr><tr><td><p>14</p><p>Atomic structure</p></td><td><p>15</p><p>Assignment 1 Due 9pm</p></td></tr></table>');
  assert.equal(calendar.scheduleEntries[0].kind, 'dated');
  assert.deepEqual(calendar.scheduleEntries[0].dateLabels, ['September 14, 2026']);
  assert.equal(calendar.scheduleEntries.length, 1);
  assert.equal(calendar.scheduleEvents.length, 1);
  const external = capture('<p>The weekly Course Schedule is available on LEARN in Content: Course Information.</p>');
  assert.equal(external.scheduleStatus, 'external-schedule');
  assert.equal(external.weeks.length, 0);
  assert.equal(parseScheduleSource(external.scheduleSource).scheduleReferences.length, 1);
});

test('week headings constrain Roman numerals, spelled numbers and numeric date labels', () => {
  const outline = capture('<table><tr><td>Week (2026)</td><td>Lecture Topic</td></tr><tr><td>I</td><td>Sets</td></tr><tr><td>Two</td><td>Functions</td></tr><tr><td>#3: 09/21–09/27</td><td>Relations</td></tr></table>');
  assert.deepEqual(outline.weeks.map(week => week.week), [1, 2, 3]);
  assert.deepEqual(outline.weeks[2].dateLabels, ['09/21–09/27']);
  const dates = capture('<table><tr><td>Week</td><td>Topic</td></tr><tr><td>Sep 9-11</td><td>Sets</td></tr><tr><td>Sep 14-18</td><td>Functions</td></tr></table>');
  assert.equal(dates.weeks.length, 0);
  assert.equal(dates.scheduleEntries[0].kind, 'dated');
  const french = capture('<table><tr><td>Semaine</td><td>Leçon</td></tr><tr><td>Semaines 1 - 3</td><td>Leçon 6</td></tr><tr><td>Semaines 4 et 5</td><td>Leçon 7</td></tr></table>');
  assert.deepEqual(french.weeks.map(week => week.week), [1, 2, 3, 4, 5]);
});

test('a date column containing explicit weeks retains those weeks; thematic tables stay unnumbered', () => {
  const outline = capture('<table><tr><td>Date</td><td>Topic</td><td>Readings</td></tr><tr><td>Week 1 (Sept 10)</td><td>Ecology</td><td>Chapter 1</td></tr><tr><td>Week 2 (Sept 15)</td><td>Climate</td><td>Chapter 2</td></tr></table>');
  assert.deepEqual(outline.weeks.map(week => week.week), [1, 2]);
  const topics = capture('<table><tr><td>Subject</td><td>Textbook</td></tr><tr><td>Processes and system calls</td><td>Chapter 2</td></tr><tr><td>Virtual memory</td><td>Chapter 3</td></tr></table>');
  assert.equal(topics.weeks.length, 0);
  assert.equal(topics.scheduleEntries[0].kind, 'topic');
  assert.equal(topics.scheduleEntries[1].topics, 'Virtual memory');
});

test('dated teaching topics produce searchable chunks without weekly associations', async () => {
  const { createOutlineChunks } = await import('../src/search/outlines/chunks.js');
  const outline = capture('<table><tr><td>Date</td><td>Topic</td></tr><tr><td>Sep 10</td><td>Memory management</td></tr></table>');
  const chunks = await createOutlineChunks(outline, { countTokens: async text => text.split(/\s+/).length + 2 });
  assert.ok(chunks.some(chunk => chunk.kind === 'schedule' && chunk.scheduleKind === 'dated' && chunk.text.includes('Memory management')));
  assert.ok(!chunks.some(chunk => chunk.kind === 'week'));
});
