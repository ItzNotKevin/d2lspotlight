import test from 'node:test';
import assert from 'node:assert/strict';
import { courseCatalogTitle, courseEmbeddingResource, courseText } from '../src/search/course.js';
import { parseCourseOfferings } from '../src/search/catalog/parse.js';
import { prepareQuery, semanticQueryText, courseQueryText } from '../src/search/rank.js';
import { parseResourceDate } from '../src/search/intent.js';
import { searchResources } from '../src/learn/search.js';
import { hybridSearch } from '../src/search/hybrid.js';
import { cacheKey, embeddingFor } from '../src/search/semantic/model.js';
import { normalizeToc } from '../src/learn/normalize.js';
import { normalizePosts } from '../src/piazza/client.js';

const resource = (id, title, extra = {}) => ({ id, title, course: 'ZTEST 100', courseId: 'test', path: 'Course Notes', type: 'PDF', source: 'LEARN', ...extra });
const ids = (resources) => resources.map((item) => item.id);

test('course intent prefers matching subjects across sciences, arts, business and computing', () => {
  for (const [query, name] of [
    ['stats', 'Statistics'], ['bio', 'Biology'], ['chem', 'Chemistry'], ['psych', 'Psychology'],
    ['econ', 'Economics'], ['history', 'History'], ['philosophy', 'Philosophy'],
    ['accounting', 'Accounting'], ['literature', 'Literature'], ['algorithms', 'Algorithms and Data Structures']
  ]) {
    const records = [resource('incidental', `${query} overview`, { courseName: 'General Studies' }),
      resource('course', 'Week 1', { courseName: name })];
    assert.equal(searchResources(records, { query: `${query} notes` })[0].id, 'course', query);
    assert.equal(hybridSearch(records, { query: `${query} notes` }, records.map((item) => ({ id: item.id, score: .8 })))[0].id, 'course', query);
  }
});

test('catalog resolves encoded course labels across departments without creating resources', () => {
  for (const [code, word] of [['MATH239', 'combinatorics'], ['CLAS104', 'mythology'], ['BIOL442', 'virology'], ['FINE130', 'imaging']]) {
    const notes = resource(code, 'Week 1', { course: `${code}_instructor_term_section`, courseId: code });
    assert.ok(courseCatalogTitle(notes).toLowerCase().includes(word));
    assert.deepEqual(searchResources([notes], { query: `${word} notes` }), [notes]);
  }
  assert.equal(courseCatalogTitle(resource('unknown', 'Week 1', { course: 'ZTEST999' })), '');
  assert.equal(courseCatalogTitle(resource('foreign', 'Week 1', { course: 'MATH239', source: 'Piazza' })), '');
  assert.deepEqual(searchResources([], { query: 'combinatorics notes' }), []);
});

test('semantic course relevance boosts related keywords while resource relevance and filters remain decisive', () => {
  const records = [resource('chemistry', 'Chapter 2', { courseName: 'Organic Chemistry', courseId: 'chemistry' }),
    resource('biology', 'Chapter 3', { courseName: 'Cell Biology', courseId: 'biology' })];
  const matches = [{ id: 'chemistry', score: .75, courseScore: .2 }, { id: 'biology', score: .75, courseScore: .9 }];
  assert.equal(hybridSearch(records, { query: 'mitosis notes' }, matches)[0].id, 'biology');
  assert.deepEqual(ids(hybridSearch(records, { query: 'mitosis notes', courseId: 'chemistry' }, matches)), ['chemistry']);
  assert.equal(hybridSearch(records, { query: 'mitosis notes' }, [{ id: 'biology', score: .2, courseScore: .99 }]).length, 0);
  assert.equal(hybridSearch(records, { query: 'mitosis notes' }, [{ id: 'chemistry', score: .99, courseScore: .2 }, { id: 'biology', score: .5, courseScore: .9 }])[0].id, 'chemistry');
  assert.equal(records[1].courseId, 'biology');
});

test('ambiguous subject searches keep multiple matching courses and explicit identifiers stay strict', () => {
  const records = [resource('one', 'Lecture notes', { course: 'STAT230_section', courseId: '230' }),
    resource('two', 'Lecture notes', { course: 'STAT231_section', courseId: '231' }),
    resource('other', 'Statistics overview', { course: 'CHEM120', courseId: '120' })];
  assert.deepEqual(ids(searchResources(records, { query: 'stats notes' })), ['one', 'two', 'other']);
  assert.deepEqual(ids(searchResources(records, { query: 'stat230 notes' })), ['one']);
});

test('course embeddings are shared within a course, scoped by account, and invalidated by names', async () => {
  const entries = new Map();
  const cache = { get: async (key) => entries.get(key), put: async (entry) => entries.set(entry.key, entry) };
  const calls = [];
  const options = { cache, view: 'course', dimensions: 2, embed: async (text) => { calls.push(text); return [1, 0]; } };
  const first = resource('one', 'First notes', { courseName: 'Cell Biology', accountId: 'one' });
  const second = { ...first, id: 'two', title: 'Other notes' };
  await embeddingFor(courseEmbeddingResource(first), options);
  await embeddingFor(courseEmbeddingResource(second), options);
  assert.deepEqual(calls, [courseText(first)]);
  await embeddingFor(courseEmbeddingResource({ ...first, courseName: 'Microbiology' }), options);
  assert.equal(calls.length, 2);
  assert.notEqual(cacheKey(courseEmbeddingResource(first), 'course'), cacheKey(courseEmbeddingResource({ ...first, accountId: 'two' }), 'course'));
});

test('offerings parser deduplicates campuses and excludes term-specific topic and scheduling claims', () => {
  const result = parseCourseOfferings('<h1>Course Selection Offerings List for Undergraduate Students</h1><h2>Winter 2027 (1271)</h2><table><tr><td>MATH</td><td>239</td><td>Intro Combinatorics</td><td>Special Topic</td></tr><tr><td>MATH</td><td>239</td><td>Intro Combinatorics</td><td>Online</td></tr></table>');
  assert.deepEqual(result.courses, { MATH239: 'Intro Combinatorics' });
  assert.throws(() => parseCourseOfferings('<h1>Login</h1>'), /Unexpected/);
});

test('latest and oldest use source update dates and rank unknown dates last in both directions', () => {
  const records = [resource('unknown', 'Lecture notes', { updatedAt: Date.now() }),
    resource('old', 'Lecture notes', { modifiedAt: '2026-09-01T12:00:00Z' }),
    resource('invalid', 'Lecture notes', { modifiedAt: 'not a date' }),
    resource('new', 'Lecture notes', { modifiedAt: '2026-10-01T12:00:00Z' })];
  const matches = records.map((item) => ({ id: item.id, score: .8 }));
  for (const [query, expected] of [['latest notes', ['new', 'old', 'unknown', 'invalid']], ['oldest notes', ['old', 'new', 'unknown', 'invalid']]]) {
    assert.deepEqual(ids(searchResources(records, { query, history: { old: Date.now() } })), expected);
    assert.deepEqual(ids(hybridSearch(records, { query }, matches)), expected);
  }
  assert.equal(searchResources(records, { query: 'latest', limit: 1 })[0].id, 'new');
  assert.deepEqual(ids(searchResources(records, { query: 'latest notes', recent: true, history: { old: 1 } })), ['old']);
});

test('course and date intent combine without making date words literal topics', () => {
  const records = [resource('other', 'Statistics overview', { courseName: 'General Studies', modifiedAt: '2026-10-10' }),
    resource('old', 'Week 1', { courseName: 'Statistics', modifiedAt: '2026-09-01' }),
    resource('new', 'Week 2', { courseName: 'Statistics', modifiedAt: '2026-10-01' })];
  assert.deepEqual(ids(searchResources(records, { query: 'latest stats notes' })), ['new', 'old', 'other']);
  assert.equal(semanticQueryText('latest stats notes'), 'statistics');
  assert.equal(courseQueryText('recently updated stats notes'), 'statistics');
  assert.equal(courseQueryText('lecture notes'), '');
  assert.equal(prepareQuery('oldest notes').dateOrder, 'asc');
  assert.equal(prepareQuery('latest oldest notes').dateOrder, null);
});

test('adapters preserve descriptive names and source dates without refresh timestamps', () => {
  const [notes] = normalizeToc({ Modules: [{ Topics: [{ TopicId: 1, Title: 'Lecture notes', LastModifiedDate: '2026-09-01T12:00:00Z' }] }] }, { id: '100', code: 'STAT230', name: 'Probability' }, 'user');
  assert.equal(notes.courseName, 'Probability');
  assert.equal(notes.modifiedAt, '2026-09-01T12:00:00Z');
  const [post] = normalizePosts([{ nr: 1, modified: true, updated: '2026-10-01T12:00:00Z' }], 'class', (value) => String(value || ''));
  assert.equal(post.modifiedAt, Date.parse('2026-10-01T12:00:00Z'));
  for (const value of [null, false, {}, 'yesterday', '2', '2026-02-30']) assert.equal(parseResourceDate(value), null);
  assert.equal(parseResourceDate(1790856000), parseResourceDate(1790856000000));
});
