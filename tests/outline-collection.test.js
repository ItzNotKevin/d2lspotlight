import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchRows, captureOutlineHTML, sectionsFromLabel } from '../src/search/outlines/collect.js';
import { matchingOutline, courseEvidenceScore, loadOutlineBundle, resourceWeekEvidence } from '../src/search/outlines/live.js';
import { hybridSearch } from '../src/search/hybrid.js';
import { MODEL_ID, MODEL_REVISION, EMBEDDING_DIMENSIONS } from '../src/search/semantic/config.js';
import { createHash } from 'node:crypto';
import { OUTLINE_ENCODING_VERSION } from '../src/search/outlines/chunks.js';

test('viewer collection preserves cross-listed identities and restricts destinations and terms', () => {
  const row = { term: '1269', courses: 'STAT 230, STAT 240', title: 'Probability', sections: '001-003', url: '/viewer/view/example' };
  assert.deepEqual(normalizeSearchRows([row], '1269')[0].courseCodes, ['STAT 230', 'STAT 240']);
  assert.deepEqual(sectionsFromLabel(row.sections), ['001', '002', '003']);
  assert.throws(() => normalizeSearchRows([{ ...row, url: 'https://other.example/viewer/view/example' }], '1269'), /destination/);
  assert.throws(() => normalizeSearchRows([row], '1271'), /another term/);
  assert.equal(normalizeSearchRows([{ ...row, url: null }], '1269')[0].unavailable, true);
});

test('combined week/date cells keep section references separate from topics and assessments', () => {
  const record = { id: 'example', course: 'STAT 230', courseCodes: ['STAT 230'], title: 'Probability', term: '1269', sections: '001', sourceUrl: 'https://outline.uwaterloo.ca/viewer/view/example' };
  const html = '<html><body><h1>Probability</h1><h2>Course Description</h2><p>Counting and probability.</p><h2>Tentative Class Plan</h2><table><tr><th>Week</th><th>Key Topics</th><th>Sections</th><th>Assessments</th></tr><tr><td>Week 1(Sept. 9 - 11)</td><td>Permutations and combinations</td><td>1.1, 1.2</td><td>Quiz 1</td></tr></table><h2>Technology</h2><p>Unrelated tools</p></body></html>';
  const { outline } = captureOutlineHTML(html, record);
  assert.equal(outline.weeks[0].topics, 'Permutations and combinations');
  assert.deepEqual(outline.weeks[0].dateLabels, ['Sept. 9 - 11']);
  assert.equal(outline.weeks[0].references[0].resolved, false);
  assert.equal(JSON.stringify(outline.weeks).includes('Quiz 1'), false);
  assert.ok(JSON.stringify(outline.scheduleSource).includes('Quiz 1'), 'Source columns remain available for later re-extraction');
  assert.throws(() => captureOutlineHTML('<html><head><title>Sign in</title></head><body><h1>Login</h1></body></html>', record), /session/);
  assert.equal(captureOutlineHTML(html.replace('<html>', '<html><head><title>Advanced Analog Integrated Circuits</title></head>'), record).outline.weeks.length, 1);
  const alternate = html.replace('<th>Week</th>', '<th>Week / Date</th>').replace('Week 1(Sept. 9 - 11)', 'Week 1: Sept. 9 - 11')
    .replace('</table>', '<tr><td>Week 0: Sept. 8</td><td>Orientation</td><td></td><td>No tutorial</td></tr></table>');
  const schedule = captureOutlineHTML(alternate, record).outline.weeks;
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0].topics, 'Permutations and combinations');
  assert.deepEqual(schedule[0].dateLabels, ['Sept. 9 - 11']);
  assert.equal(captureOutlineHTML(alternate.replace('Week / Date', 'Weeks'), record).outline.weeks[0].topics, 'Permutations and combinations');
});

test('outline precedence requires matching term and unambiguous section, never counts the calendar twice', () => {
  const entry = { term: 'Fall 2026', sections: ['001'], vectorIndices: [0] };
  const outlines = { courses: { STAT230: { outlines: [entry] } }, vectors: [[0, 1]] };
  const catalog = { courses: { STAT230: { vectorIndices: [0] } }, vectors: [[1, 0]] };
  const resource = { source: 'LEARN', course: 'STAT_230_001_F26' };
  assert.equal(matchingOutline(resource, outlines), entry);
  assert.equal(courseEvidenceScore(resource, [[1, 0]], outlines, catalog), 0);
  assert.equal(courseEvidenceScore({ ...resource, course: 'STAT_230_001_W27' }, [[1, 0]], outlines, catalog), 1);
  assert.equal(matchingOutline({ ...resource, course: 'STAT230' }, outlines), null);
  assert.equal(matchingOutline(resource, { ...outlines, courses: { STAT230: { outlines: [entry, { ...entry }] } } }), null);
  assert.equal(matchingOutline({ ...resource, course: 'STAT_230_002_F26' }, outlines), null);
});

test('outline loading verifies encoder, binary data and term/section references', async () => {
  const bytes = new Uint8Array(EMBEDDING_DIMENSIONS * 4);
  new DataView(bytes.buffer).setFloat32(0, 1, true);
  const metadata = { version: 1, encoder: { model: MODEL_ID, revision: MODEL_REVISION, dimensions: EMBEDDING_DIMENSIONS,
    dtype: 'q8', pooling: 'mean', normalize: true, encodingVersion: OUTLINE_ENCODING_VERSION }, vectorCount: 1,
    vectorFileHash: createHash('sha256').update(bytes).digest('hex'), courses: { STAT230: { vectorIndices: [0],
      outlines: [{ term: 'Fall 2026', sections: ['001'], vectorIndices: [0] }] } } };
  const fetcher = value => async path => path.endsWith('manifest.json') ? { ok: true, json: async () => value } : { ok: true, arrayBuffer: async () => bytes.buffer };
  assert.equal((await loadOutlineBundle(fetcher(metadata), path => path)).vectors.length, 1);
  const invalidWeek = structuredClone(metadata);
  invalidWeek.courses.STAT230.outlines[0].weeks = { 5: [2] };
  await assert.rejects(loadOutlineBundle(fetcher(invalidWeek), path => path), /reference/);
  await assert.rejects(loadOutlineBundle(fetcher({ ...metadata, courses: { STAT230: { vectorIndices: [0], outlines: [{ term: 'Fall 2026', sections: ['001'], vectorIndices: [2] }] } } }), path => path), /reference/);
});

test('weekly outline topics retrieve notes without broadening unrelated weeks or guessing course identity', () => {
  const outline = { term: 'Fall 2026', sections: ['001'], sourceUrl: 'https://outline.uwaterloo.ca/viewer/view/test',
    vectorIndices: [0, 1], weeks: { 5: [0], 6: [1] } };
  const bundle = { courses: { TEST100: { outlines: [outline] } }, vectors: [[1, 0], [0, 1]] };
  const resource = { id: 'notes', title: 'week_05_annotated', source: 'LEARN', course: 'TEST_100_001_F26', type: 'SLIDES' };
  const evidence = resourceWeekEvidence(resource, [[1, 0]], bundle);
  assert.equal(evidence.score, .9);
  assert.equal(resourceWeekEvidence({ ...resource, title: 'week_06_annotated' }, [[1, 0]], bundle).score, 0);
  for (const change of [{ title: 'Week 5 assignment', type: 'ASSIGNMENT' }, { course: 'TEST100' },
    { course: 'TEST_100_001_W27' }, { course: 'TEST_100_002_F26' }, { title: 'lecture_05_annotated' }]) {
    assert.equal(resourceWeekEvidence({ ...resource, ...change }, [[1, 0]], bundle), null);
  }
  const results = hybridSearch([resource], { query: 'probability mass functions notes' }, [
    { id: resource.id, score: evidence.score, outlineWeek: { week: evidence.week, sourceUrl: evidence.sourceUrl } }
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].outlineWeek.week, 5);
  assert.equal(results[0].semanticMatch, true);
  assert.equal(hybridSearch([resource], { query: 'test200 probability notes' }, [{ id: resource.id, score: .9 }]).length, 0);
});

test('French structural headings work without course-specific aliases and unknown sections stop content capture', () => {
  const record = { id: 'french', course: 'FR 255', courseCodes: ['FR 255'], title: 'French literature', term: '1269', sections: '001', sourceUrl: 'https://outline.uwaterloo.ca/viewer/view/french' };
  const html = '<html><body><h1>FR 255</h1><h2>Aperçu du cours</h2><p>Analyse de textes littéraires.</p><h2>Objectifs d’apprentissage</h2><p>Interpréter les textes.</p><h2>Évaluations &amp; Activités</h2><p>Policy text that must be excluded.</p></body></html>';
  const { outline } = captureOutlineHTML(html, record);
  assert.deepEqual(outline.description, ['Analyse de textes littéraires.']);
  assert.deepEqual(outline.outcomes, ['Interpréter les textes.']);
  assert.equal(JSON.stringify(outline).includes('Policy text'), false);
});

test('headerless abbreviated weekly tables merge continuation rows and preserve unnumbered events', () => {
  const record = { id: 'schedule', course: 'TEST 200', courseCodes: ['TEST 200'], title: 'Insurance', term: '1269', sections: '001', sourceUrl: 'https://outline.uwaterloo.ca/viewer/view/schedule' };
  const html = `<html><body><h1>Insurance</h1><h2>Course Description</h2><p>Risk models.</p><h2>Tentative Class Plan</h2><table>
    <tr><th>W1 - Sep 9 (Lecture canceled)</th><th></th></tr>
    <tr><td>W2 - Sep 14 &amp; 16</td><td>Review of probabilities</td></tr>
    <tr><td></td><td>Distributional quantities</td></tr>
    <tr><td>W3 – Sep 21 &amp; 23</td><td>Risk measures</td></tr>
    <tr><td>Reading week</td><td></td></tr>
    <tr><td></td><td>Unnumbered special session</td></tr>
    <tr><td>W4 - Oct 5 &amp; 7</td><td>Tails of distributions</td></tr>
    <tr><td>Makeup days - Dec 7</td><td>Reserving method</td></tr>
    </table><h3>Readings</h3><p>- Insurance textbook</p></body></html>`;
  const { outline } = captureOutlineHTML(html, record);
  assert.deepEqual(outline.weeks.map(week => week.week), [2, 3, 4]);
  assert.equal(outline.weeks[0].topics, 'Review of probabilities Distributional quantities');
  assert.deepEqual(outline.weeks[0].dateLabels, ['Sep 14 & 16']);
  assert.equal(outline.weeks[1].topics, 'Risk measures');
  assert.ok(outline.unparsedSchedule.some(text => text.includes('Lecture canceled')));
  assert.ok(outline.unparsedSchedule.some(text => text.includes('Reserving method')));
  assert.ok(outline.unparsedSchedule.some(text => text.includes('Unnumbered special session')));
  assert.equal(outline.readings[0].name, 'Insurance textbook');
  assert.ok(!outline.weeks.some(week => week.topics.includes('Insurance textbook')));
});

test('ambiguous headerless tables keep their schedule text instead of guessing columns', () => {
  const outline = captureOutlineHTML('<html><body><h1>Test</h1><h2>Course Description</h2><p>Topics.</p><h2>Tentative Class Plan</h2><table><tr><td>W1 - Sep 9</td><td>Topic one</td><td>Assignment</td></tr><tr><td>W2 - Sep 14</td><td>Topic two</td><td>Assessment</td></tr></table></body></html>',
    { id: 'ambiguous', course: 'TEST 100', courseCodes: ['TEST 100'], title: 'Test', term: '1269', sections: '001', sourceUrl: 'https://outline.uwaterloo.ca/viewer/view/ambiguous' }).outline;
  assert.equal(outline.weeks.length, 0);
  assert.ok(outline.unparsedSchedule[0].includes('Topic one'));
});
