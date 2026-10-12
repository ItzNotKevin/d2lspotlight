import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractOutline, normalizeOutline } from '../src/search/outlines/extract.js';
import { createOutlineChunks, splitOutlineText } from '../src/search/outlines/chunks.js';
import { encodeOutlineVectors, decodeOutlineVectors } from '../src/search/outlines/vectors.js';
import { readOutlineBundle, hash } from '../scripts/outline-runtime.mjs';
import { MODEL_KEY, EMBEDDING_DIMENSIONS } from '../src/search/semantic/config.js';
import { OUTLINE_ENCODING_VERSION } from '../src/search/outlines/chunks.js';
import { parseOutlineQuery } from '../src/search/outlines/query.js';

const countTokens = async (text) => text.split(/\s+/).filter(Boolean).length + 2;

test('vertical schedules preserve topics and generic reading aliases despite table-of-contents headings', () => {
  const text = `MATH 239
Fall 2026
Introduction to Combinatorics
Section 001, 101-103
Published October 2, 2026 (latest)
Table of Contents
Course Description
Learning Outcomes
Tentative Class Plan
Readings
Technology
Course Description
Counting and graph theory.
Learning Outcomes
Write proofs about discrete objects.
Tentative Class Plan
COUNT=Counting notes, GRAPH=Graph notes.
Week
Lecture Dates
Topics
Readings
Assignments
1
Sep 9, 11
Counting and combinatorial proofs
COUNT: 1.1
Tutorial
2
Sep 14, 16, 18
Paths and cycles
GRAPH: 2.1
Supplemental notes on paths
Tutorial
Readings
(COUNT) Counting handbook\tCounting notes (available on LEARN)\tRequired
(GRAPH) Graph handbook\tGraph notes (available on LEARN)\tRequired
Technology
Unrelated platform details.
Generative AI
Artificial intelligence policy boilerplate.`;
  const outline = extractOutline(text);
  assert.equal(outline.course, 'MATH 239');
  assert.equal(outline.title, 'Introduction to Combinatorics');
  assert.equal(outline.term, 'Fall 2026');
  assert.equal(outline.publishedAt, '2026-10-02');
  assert.deepEqual(outline.sections, ['001', '101', '102', '103']);
  assert.deepEqual(outline.weeks.map((week) => week.topics), ['Counting and combinatorial proofs', 'Paths and cycles']);
  assert.equal(outline.weeks[0].references[0].name, 'Counting notes');
  assert.equal(outline.weeks[0].references[0].citation, '1.1');
  assert.equal(outline.weeks[1].references[1].citation, 'Supplemental notes on paths');
  assert.equal(outline.weeks[1].references[1].resolved, false);
  assert.equal(outline.warnings.length, 0);
  assert.equal(outline.description.some((paragraph) => paragraph.includes('policy')), false);
});

test('science outlines support alternate headings, numbered Markdown headings and tabular weeks', () => {
  const outline = extractOutline(`BIOL 130
Winter 2027
Cell Biology
## 1. Course Overview
Cells and their functions.
## Course Learning Objectives
Explain cellular reproduction.
## Weekly Schedule
Week\tTopics\tReadings\tDates
1\tOrganelles\tChapter 1\tJan 5
2\tMitosis and meiosis\tChapter 2\tJan 12
## Academic Integrity
Generic policy.`);
  assert.equal(outline.weeks.length, 2);
  assert.deepEqual(outline.description, ['Cells and their functions.']);
  assert.equal(outline.weeks[1].topics, 'Mitosis and meiosis');
  assert.deepEqual(outline.weeks[1].dateLabels, ['Jan 12']);
  assert.equal(outline.weeks[1].references[0].resolved, false);
  assert.deepEqual(outline.outcomes, ['Explain cellular reproduction.']);
});

test('arts outlines support combined identity lines and Markdown tables without inventing reading aliases', () => {
  const outline = extractOutline(`HIST 105: European History
Fall 2026
Course Summary
European cultural and political history.
Schedule of Topics
| Week | Topics | Readings |
| --- | --- | --- |
| 1 | Medieval Europe | History reader chapter 1 |
| 2 | Renaissance art and humanism | History reader chapter 2 |
University Policy
Administrative text.`);
  assert.equal(outline.title, 'European History');
  assert.equal(outline.weeks[1].topics, 'Renaissance art and humanism');
  assert.deepEqual(outline.weeks[1].references, [{ citation: 'History reader chapter 2', resolved: false }]);
});

test('inline weekly plans work without dates while missing schedules produce an explicit warning', () => {
  const outline = extractOutline(`AFM 101
Fall 2026
Financial Accounting
Course Description
Financial statements and accounting records.
Course Plan
- Week 1: Balance sheets
- Week 2: Income statements Reading: Accounting chapter 2
Course Policies
Other details.`);
  assert.equal(outline.weeks[0].week, 1);
  assert.equal(outline.weeks[1].references[0].citation, 'Accounting chapter 2');
  const partial = extractOutline(`MUSIC 100
Music Theory
Course Description
Harmony and melody.
Tentative Schedule
Specific topics will be confirmed in class.`);
  assert.equal(partial.term, null);
  assert.deepEqual(partial.weeks, []);
  assert.ok(partial.warnings.some((warning) => warning.includes('layout')));
  assert.ok(partial.warnings.some((warning) => warning.includes('term')));
});

test('reading week and assignment due dates are not classified as teaching topics', () => {
  const outline = extractOutline(`CS 246
Fall 2026
Object Oriented Programming
Course Description
Software design.
Weekly Topics
1
Sep 9
Inheritance and polymorphism
TEXT: 3.1
Quiz on A1
A1 due Sep 10
Reading Week
2
Sep 23
Resource ownership
TEXT: 4.1
Tutorial
Assessments
Assignment schedule.`);
  assert.equal(outline.weeks.length, 2);
  assert.equal(outline.weeks[0].topics, 'Inheritance and polymorphism');
  assert.equal(outline.weeks[0].references[0].resolved, false);
  assert.equal(outline.weeks.some((week) => /assignment|reading week|due/i.test(week.topics)), false);
});

test('structured imports accept diverse topics without requiring a standard webpage layout', () => {
  const outline = normalizeOutline({ course: 'PHIL110', title: 'Ethics', term: 'Winter 2027', topics: ['Moral responsibility',
    { heading: 'Unit 2', text: 'Consequentialism and duties', evidence: { heading: 'Unit 2' } }] });
  assert.equal(outline.course, 'PHIL 110');
  assert.equal(outline.topics.length, 2);
  assert.deepEqual(outline.weeks, []);
  assert.throws(() => normalizeOutline({ course: 'invalid', title: 'Test', topics: ['Topic'] }), /course code/);
  assert.throws(() => normalizeOutline({ course: 'CS 100', title: 'Test' }), /no usable/);
  assert.throws(() => normalizeOutline({ course: 'CS 100', title: 'Test', description: [{}] }), /strings/);
  assert.throws(() => normalizeOutline({ course: 'CS 100', title: 'Test', description: ['Topic'], weeks: [{ week: 0, topics: 'Topic' }] }), /week number/);
});

test('long passages keep all words without silently truncating the end', async () => {
  const text = Array.from({ length: 150 }, (_, index) => `topic${index}`).join(' ');
  const prefix = 'Course. Topics.';
  const pieces = await splitOutlineText(text, prefix, countTokens, 32);
  assert.ok(pieces.length > 1);
  assert.equal(pieces.join(' '), text);
  for (const piece of pieces) assert.ok(await countTokens(`${prefix} ${piece}`) <= 32);
  await assert.rejects(splitOutlineText('Topic', Array(35).fill('heading').join(' '), countTokens, 32), /too little room/);
});

test('topic chunks retain human course context while week identifiers and citations stay in metadata', async () => {
  const outline = normalizeOutline({ id: 'outline-one', course: 'BIOL 130', title: 'Cell Biology', term: 'Fall 2026',
    description: ['Cell structures and reproduction.'], outcomes: ['Explain mitosis.'],
    weeks: [{ week: 2, topics: 'Mitosis and meiosis', references: [{ alias: 'BIO', name: 'Biology notes', citation: '2.1', resolved: true }] }] });
  const chunks = await createOutlineChunks(outline, { countTokens, outlineKey: 'outline-one@version-one' });
  const week = chunks.find((chunk) => chunk.kind === 'week');
  assert.equal(week.week, 2);
  assert.equal(week.outlineVersionKey, 'outline-one@version-one');
  assert.equal(week.references[0].citation, '2.1');
  assert.ok(week.text.includes('Cell Biology'));
  assert.ok(week.text.includes('Mitosis and meiosis'));
  assert.ok(week.text.includes('Biology notes'));
  assert.equal(/BIOL 130|Fall 2026|Week 2|2\.1/.test(week.text), false);
});

test('topic-only imports still produce a factual course profile without generic labels in embedding text', async () => {
  const chunks = await createOutlineChunks({ course: 'MUS 100', title: 'Music Theory', topics: ['Harmony and melody.'] }, { countTokens });
  assert.ok(chunks.some((chunk) => chunk.kind === 'course'));
  assert.ok(chunks.every((chunk) => chunk.text === 'Music Theory. Harmony and melody.'));
});

test('separate genuine description headings are retained rather than overwritten', () => {
  const outline = extractOutline(`ECON 101
Fall 2026
Economics
Course Overview
Economic decision making.
Course Description
Supply, demand and markets.
Learning Outcomes
Analyze market behavior.`);
  assert.deepEqual(outline.description, ['Economic decision making.', 'Supply, demand and markets.']);
});

test('named books in reading tables resolve weekly citations without requiring abbreviations', () => {
  const outline = extractOutline(`BIOL 130
Fall 2026
Cell Biology
Course Description
Cells and reproduction.
Weekly Schedule
Week\tTopics\tReadings
1\tCell structures\tOpen Biology chapter 1
2\tMitosis\tChapter 2
Required Readings
Title / Name\tNotes / Comments\tRequired
Open Biology\tMain course text\tYes
University Policy
Other content.`);
  assert.equal(outline.readings.length, 1);
  assert.equal(outline.weeks[0].references[0].name, 'Open Biology');
  assert.equal(outline.weeks[0].references[0].resolved, true);
  assert.equal(outline.weeks[1].references[0].resolved, false);
});

test('binary vectors round-trip and reject truncated or invalid data', () => {
  const encoded = encodeOutlineVectors([[1, 0], [0, 1]], 2);
  assert.equal(encoded.byteLength, 16);
  assert.deepEqual(decodeOutlineVectors(encoded, 2, 2).map((vector) => Array.from(vector)), [[1, 0], [0, 1]]);
  assert.throws(() => decodeOutlineVectors(encoded.slice(0, -1), 2, 2), /file size/);
  assert.throws(() => encodeOutlineVectors([[0, 0]], 2), /invalid/);
  assert.throws(() => encodeOutlineVectors([[NaN, 1]], 2), /invalid/);
});

test('saved bundles verify checksums and vector references before reuse', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'spotlight-outline-test-'));
  try {
    const vector = Array(EMBEDDING_DIMENSIONS).fill(0);
    vector[0] = 1;
    const bytes = encodeOutlineVectors([vector], EMBEDDING_DIMENSIONS);
    const manifest = { version: 1, encoder: { modelKey: MODEL_KEY, encodingVersion: OUTLINE_ENCODING_VERSION, dimensions: EMBEDDING_DIMENSIONS },
      chunks: [{ vectorIndex: 0 }], vectorHashes: ['test'], vectorFile: 'vectors.f32', vectorFileHash: hash(bytes) };
    await writeFile(join(directory, 'vectors.f32'), bytes);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    assert.equal((await readOutlineBundle(directory)).vectors.length, 1);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, chunks: [{ vectorIndex: 1 }] }));
    await assert.rejects(readOutlineBundle(directory), /missing vectors/);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, vectorFileHash: 'wrong' }));
    await assert.rejects(readOutlineBundle(directory), /checksum/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('course and week constraints stay out of semantic topic text in outline previews', () => {
  assert.deepEqual(parseOutlineQuery('MATH239 week 5 recurrence relations notes'), {
    courses: ['math239'], week: 5, assignments: [], text: 'recurrence relations', metadataOnly: false
  });
  assert.equal(parseOutlineQuery('week_05 recurrence relations').text, 'recurrence relations');
  assert.equal(parseOutlineQuery('MATH 239 week 5').metadataOnly, true);
  assert.equal(parseOutlineQuery('MATH 239 week 5').text, '');
  assert.deepEqual(parseOutlineQuery('CS246 a2 notes').assignments, ['2']);
});
