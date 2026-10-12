import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearnClient, selectVersion } from '../src/learn/client.js';
import { normalizeToc } from '../src/learn/normalize.js';

const products = [
  { ProductCode: 'lp', SupportedVersions: ['1.50', '1.49'] },
  { ProductCode: 'le', SupportedVersions: ['1.90', '1.82'] }
];
const enrollment = (id) => ({ OrgUnit: { Id: id, Name: `Course ${id}`, Code: `C${id}` }, Access: { CanAccess: true } });
const page = (items, more = false, bookmark = '') => ({ Items: items, PagingInfo: { HasMoreItems: more, Bookmark: bookmark } });
function mockClient(values) {
  const calls = [];
  const diagnostics = [];
  return {
    calls, diagnostics,
    client: createLearnClient({
      onDiagnostic: (entry) => diagnostics.push(entry),
      fetchImpl: async (path, options) => {
        calls.push({ path, options });
        const value = values.shift();
        return value instanceof Response ? value : Response.json(value);
      }
    })
  };
}

test('selects numeric compatible versions, not decimal or lexical order', () => {
  assert.equal(selectVersion([{ ProductCode: 'lp', SupportedVersions: ['1.100', '1.9', '1.49'] }], 'lp', '1.49'), '1.49');
  assert.throws(() => selectVersion([], 'lp', '1.49'), /compatible/);
});

test('connect verifies identity and follows enrollment bookmarks without leaking identity in diagnostics', async () => {
  const { client, calls, diagnostics } = mockClient([products, { Identifier: 'private-user' }, page([enrollment(100)], true, '100'), page([enrollment(100), enrollment(101)])]);
  const result = await client.connect();
  assert.deepEqual(result.courses.map((course) => course.id), ['100', '101']);
  assert.match(calls[3].path, /bookmark=100/);
  assert.ok(calls.every(({ options }) => options.method === 'GET' && options.credentials === 'same-origin' && options.redirect === 'error'));
  assert.ok(!JSON.stringify(diagnostics).includes('private-user'));
  assert.ok(!JSON.stringify(diagnostics).includes('Course 100'));
});

test('rejects repeated pagination bookmarks', async () => {
  const { client } = mockClient([products, { Identifier: 'user' }, page([], true, 'a'), page([], true, 'a')]);
  await assert.rejects(client.connect(), { code: 'PAGING' });
});

test('rejects HTML login responses, denied access, and throttling distinctly', async () => {
  for (const [response, code] of [
    [new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }), 'NOT_JSON'],
    [new Response('', { status: 403 }), 'FORBIDDEN'],
    [new Response('', { status: 429, headers: { 'Retry-After': '60' } }), 'RATE_LIMIT']
  ]) {
    const { client } = mockClient([response]);
    await assert.rejects(client.connect(), { code });
  }
});

test('rejects malformed enrollment shapes rather than reporting zero courses', async () => {
  const { client } = mockClient([products, { Identifier: 'user' }, { Items: [] }]);
  await assert.rejects(client.connect(), { code: 'SCHEMA' });
});

test('flattens modules, skips restricted/broken items, and opens through trusted LEARN routes', () => {
  const course = { id: '100', code: 'MATH 239' };
  const toc = { Modules: [{ Title: 'Week 1', Topics: [
    { TopicId: 1, Title: 'Notes', Url: '/content/notes.pdf' },
    { TopicId: 2, Title: 'Hidden', IsHidden: true },
    { TopicId: 3, Title: 'Broken', IsBroken: true }
  ], Modules: [{ Title: 'Slides', Topics: [{ TopicId: 4, Title: 'Lecture', Url: '/content/slides.pptx' }] },
    { Title: 'Locked', IsLocked: true, Topics: [{ TopicId: 5 }] }] }] };
  const result = normalizeToc(toc, course, 'user');
  assert.equal(result.length, 2);
  assert.equal(result[0].type, 'PDF');
  assert.equal(result[1].type, 'SLIDES');
  assert.equal(result[1].path, 'Week 1 / Slides');
  assert.equal(result[0].url, 'https://learn.uwaterloo.ca/d2l/le/content/100/viewContent/1/View');
  assert.notEqual(result[0].id, normalizeToc(toc, course, 'another-user')[0].id);
  assert.throws(() => normalizeToc({}, course, 'user'), /Unexpected/);
});

test('course requests are GET only and reject invalid IDs', async () => {
  const { client, calls } = mockClient([{ Modules: [] }]);
  await client.loadCourse('1.82', { id: '100' });
  assert.equal(calls[0].path, '/d2l/api/le/1.82/100/content/toc');
  await assert.rejects(client.loadCourse('1.82', { id: '../other' }), { code: 'PATH' });
});
