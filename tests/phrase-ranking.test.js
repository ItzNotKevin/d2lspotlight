import test from 'node:test';
import assert from 'node:assert/strict';
import { searchResources } from '../src/learn/search.js';
import { hybridSearch } from '../src/search/hybrid.js';
import { containsPhrase, topicPhrase } from '../src/search/rank.js';
import { mergePdfResults, searchPdfPages } from '../src/search/pdf/core.js';

const make = (id, title, extra = {}) => ({ id, title, source: 'LEARN', course: 'STAT230', courseId: '230', type: 'PDF', path: 'Lecture notes', ...extra });

test('ordered title phrases beat scattered terms in keyword and meaning search', () => {
  const resources = [make('scattered', 'Music and its origins in rock'), make('phrase', 'Introduction to rock music')];
  for (const query of ['rock music', 'find rock music', 'stat230 rock music notes']) {
    assert.equal(searchResources(resources, { query })[0].id, 'phrase', query);
    assert.equal(hybridSearch(resources, { query }, resources.map(({ id }) => ({ id, score: .8 })))[0].id, 'phrase', query);
  }
});

test('phrase boundaries, internal connecting words, and repeated words are preserved', () => {
  assert.equal(topicPhrase('please find law of total probability notes'), 'law of total probability');
  assert.equal(topicPhrase('stat230 very very unlikely notes'), 'very very unlikely');
  assert.equal(containsPhrase('Bedrock music', 'rock music'), false);
  assert.equal(containsPhrase('Rock, music and culture', 'rock music'), true);
});

test('PDF phrase evidence beats scattered or reversed words without rejecting those pages', () => {
  const resource = make('notes', 'Week 2');
  const pages = [
    { page: 1, text: 'Probability is total when the law applies.' },
    { page: 2, text: 'The law of total probability partitions the sample space.' },
    { page: 3, text: 'A probability law has several uses in total.' }
  ];
  const found = searchPdfPages(resource, pages, 'stat230 law of total probability notes');
  assert.equal(found.length, 3);
  assert.equal(found[0].page, 2);
  assert.equal(found[0].phraseMatch, true);
  assert.equal(found[1].phraseMatch, false);
});

test('website phrases receive a boost without overriding explicit date ordering', () => {
  const records = [
    make('scattered', 'Probability resources', { source: 'Website', contentText: 'Probability is total when the law applies.', modifiedAt: '2026-10-15' }),
    make('phrase', 'Probability resources', { source: 'Website', contentText: 'The law of total probability partitions the sample space.', modifiedAt: '2026-10-01' })
  ];
  assert.equal(searchResources(records, { query: 'law of total probability' })[0].id, 'phrase');
  assert.equal(searchResources(records, { query: 'latest law of total probability' })[0].id, 'scattered');
});

test('precise titles survive the merge with PDF passages and keep page links', () => {
  const exact = make('exact', 'Rock music');
  const broad = make('broad', 'Music and its origins in rock');
  const passage = { ...make('broad:page:2', broad.title), resourceId: 'broad', pdfMatch: true, pdfPage: 2, pdfPhraseMatch: true };
  assert.deepEqual(mergePdfResults([broad, exact], [passage], 100, 'rock music').map(item => item.id), ['exact', 'broad:page:2']);
  assert.equal(mergePdfResults([broad, exact], [passage], 1, 'rock music')[0].id, 'exact');
});

test('course search examples retain teaching, administrative, exact-title and identifier intent', () => {
  const records = [
    make('bio', 'Co-op Advisor Bios', { path: 'Advising / Rock music interests' }),
    make('rock', 'Rock music lecture slides', { type: 'SLIDES' }),
    make('permutation', 'Permutations lecture notes'),
    make('probability', 'Law of total probability'),
    make('office', 'Office hours', { path: 'Course administration' }),
    make('schedule', 'Course schedule', { path: 'Course administration' }),
    make('outline', 'Course outline', { path: 'Course administration' }),
    make('assignment', 'Assignment 2'), make('wrong-assignment', 'Assignment 12'),
    make('other-course', 'Permutations', { course: 'STAT231', courseId: '231' })
  ];
  for (const [query, expected] of [
    ['rock', 'rock'], ['rock music', 'rock'], ['rock music slides', 'rock'],
    ['advisor bios', 'bio'], ['office hours', 'office'], ['course schedule', 'schedule'],
    ['course outline', 'outline'], ['stat230 permutation', 'permutation'],
    ['law of total probability', 'probability'], ['please find probability notes', 'probability'],
    ['stat230 a2', 'assignment'], ['stat231 permutations', 'other-course']
  ]) assert.equal(searchResources(records, { query })[0]?.id, expected, query);
  assert.deepEqual(searchResources(records, { query: 'stat230 a3' }), []);
  assert.equal(searchResources(records, { query: 'permutations', courseId: '231' })[0].id, 'other-course');
});
