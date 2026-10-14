import test from 'node:test';
import assert from 'node:assert/strict';
import { studyWeight, matchExplanation } from '../src/search/relevance.js';
import { searchResources } from '../src/learn/search.js';
import { searchPdfCache } from '../src/search/pdf/background.js';
import { pdfRevision, mergePdfResults } from '../src/search/pdf/core.js';
import { deduplicateSiteCandidates, detectCourseSites } from '../src/sites/core.js';

test('comparable topic matches favor teaching material but preserve administrative intent and exact titles', () => {
  const bio = { id: 'bio', title: 'Rock interests', path: 'Advisor bios', course: 'TEST100', type: 'PDF' };
  const notes = { ...bio, id: 'notes', path: 'Lecture notes' };
  assert.deepEqual(searchResources([bio, notes], { query: 'rock' }).map(item => item.id), ['notes', 'bio']);
  assert.equal(studyWeight(bio, 'advisor bios'), 1);
  assert.equal(searchResources([notes, { ...bio, title: 'Rock' }], { query: 'rock' })[0].id, 'bio');
  assert.equal(matchExplanation({ pdfMatch: true, pdfPage: 2 }, 'rock'), 'PDF text · page 2');
  assert.match(matchExplanation({ websiteReference: true }, 'advising'), /destination contents not searched/);
  assert.equal(matchExplanation(notes, 'rock'), 'Title match');
});

test('PDF passage relevance keeps biographies searchable while breaking comparable matches toward lecture notes', async () => {
  const make = (id, path) => ({ id, title: 'Resources', path, courseId: '100', course: 'TEST100', type: 'PDF', pdfUrl: `https://learn.uwaterloo.ca/content/${id}.pdf` });
  const resources = [make('bio', 'Advisor bios'), make('notes', 'Lecture notes')];
  const documents = resources.map(resource => ({ id: resource.id, accountId: 'A', revision: pdfRevision(resource), pages: [{ page: 1, text: 'Rock formations are interesting.' }] }));
  const matches = await searchPdfCache({ all: async () => documents }, { accountId: 'A', resources, history: {}, pdfLabels: {} }, 'rock');
  assert.deepEqual(matches.map(item => item.resourceId), ['notes', 'bio']);
});

test('host aliases deduplicate candidates while retaining indexed data and separate terms/courses', () => {
  const root = 'https://student.cs.uwaterloo.ca/~cs246/F26/';
  const first = { courseId: '246', root, url: `${root}index.shtml` };
  const alias = { ...first, root: root.replace('https://', 'https://www.'), enabled: false };
  assert.deepEqual(deduplicateSiteCandidates([first, alias]), [first]);
  assert.deepEqual(deduplicateSiteCandidates([first, { ...alias, enabled: true }]), [{ ...alias, enabled: true }]);
  assert.equal(deduplicateSiteCandidates([first, { ...alias, courseId: '999' }]).length, 2);
  assert.equal(detectCourseSites([{ url: first.url }, { url: first.url.replace('https://', 'https://www.') }], { id: '246', code: 'CS246 F26' }).length, 1);
});

test('final result merging does not elevate an incidental biography passage above teaching matches', () => {
  const bio = { id: 'bio:page:2', resourceId: 'bio', title: 'Co-op Advisor Bios', path: 'Your Co-op Advisor', pdfMatch: true, pdfPage: 2 };
  const slides = { id: 'slides', title: 'Lecture 1 PowerPoint', path: 'Lecture introduction', type: 'SLIDES' };
  assert.deepEqual(mergePdfResults([slides], [bio], 100, 'rock').map(item => item.id), ['slides', 'bio:page:2']);
  assert.deepEqual(mergePdfResults([slides], [bio], 100, 'advisor bios').map(item => item.id), ['bio:page:2', 'slides']);
  assert.equal(mergePdfResults([], [bio], 100, 'rock')[0], bio);
  assert.equal(mergePdfResults([slides], [{ ...bio, title: 'Rock' }], 100, 'rock')[0].title, 'Rock');
});
