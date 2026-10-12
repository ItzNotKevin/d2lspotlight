import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexStore, emptyIndex } from '../src/learn/cache.js';
import { refreshCourses } from '../src/learn/sync.js';
import { searchResources } from '../src/learn/search.js';

const resource = (id, courseId = '1') => ({ id, courseId, title: `Notes ${id}`, course: `Course ${courseId}`, path: 'Week 1', type: 'PDF' });
function memoryStorage() {
  let data = {};
  return { get: async () => structuredClone(data), set: async (value) => { data = structuredClone(value); } };
}
async function seed(store, accountId = 'A') {
  const index = await store('begin', { accountId });
  return store('commit', { ...index, resources: [resource('a'), resource('b', '2')], updatedAt: 10 });
}

test('renaming an indexed Piazza course updates existing posts and survives reload', async () => {
  const storage = memoryStorage();
  const store = createIndexStore(storage, 'piazzaSpotlightIndexV1');
  const previous = await store('begin', { accountId: 'A' });
  const saved = await store('commit', { ...previous, courses: [{ id: 'piazza:abc', name: 'Piazza · abc' }],
    resources: [{ ...resource('post', 'piazza:abc'), title: 'A2 Available', course: 'Piazza · abc', source: 'Piazza' }], updatedAt: 10 });
  await store('opened', { id: 'post' });
  await store('rename-course', { courseId: 'piazza:abc', name: 'CS 246' });
  const reloaded = await createIndexStore(storage, 'piazzaSpotlightIndexV1')('read');
  assert.equal(reloaded.courses[0].name, 'CS 246');
  assert.equal(searchResources(reloaded.resources, { query: 'cs246 a2' })[0].id, 'post');
  assert.ok(reloaded.history.post);
  await assert.rejects(store('commit', saved), /newer refresh/);
});

test('cache survives a new worker/store instance and retains recents during refresh', async () => {
  const storage = memoryStorage();
  const store = createIndexStore(storage);
  const old = await seed(store);
  await Promise.all([store('opened', { id: 'a' }), store('commit', old)]);
  const reloaded = await createIndexStore(storage)('read');
  assert.equal(reloaded.resources.length, 2);
  assert.ok(reloaded.history.a);
});

test('account switches clear both resources and history; old refresh cannot restore them', async () => {
  const store = createIndexStore(memoryStorage());
  const old = await seed(store);
  await store('opened', { id: 'a' });
  const current = await store('begin', { accountId: 'B' });
  assert.deepEqual(current.resources, []);
  assert.deepEqual(current.history, {});
  await assert.rejects(store('commit', old), /newer refresh/);
});

test('clear invalidates an in-flight refresh and latest refresh wins across tabs', async () => {
  const store = createIndexStore(memoryStorage());
  const old = await seed(store);
  await store('begin', { accountId: 'A' });
  await assert.rejects(store('commit', old), /newer refresh/);
  const newer = await store('read');
  await store('clear');
  await assert.rejects(store('commit', newer), /newer refresh/);
  assert.deepEqual(await store('read'), emptyIndex());
});

test('removed resources lose recent entries; unknown recent IDs are ignored', async () => {
  const store = createIndexStore(memoryStorage());
  const index = await seed(store);
  await store('opened', { id: 'a' });
  await store('opened', { id: 'unknown' });
  const next = await store('commit', { ...index, resources: [resource('b')] });
  assert.deepEqual(next.history, {});
});

test('refresh indexes all courses sequentially and replaces removed resources', async () => {
  const calls = [];
  const snapshots = [];
  const session = { accountId: 'A', le: '1.82', courses: [{ id: '1', code: 'C1' }, { id: '2', code: 'C2' }] };
  const result = await refreshCourses({ session, previous: { ...emptyIndex(), accountId: 'A', resources: [resource('deleted', '3')] }, signal: new AbortController().signal,
    client: { loadCourse: async (_, course) => { calls.push(course.id); return { Modules: [{ Title: 'Week', Topics: [{ TopicId: 10, Title: 'Notes', Url: '/notes.pdf' }] }] }; } },
    onSnapshot: async (snapshot) => snapshots.push(snapshot)
  });
  assert.deepEqual(calls, ['1', '2']);
  assert.equal(result.resources.length, 2);
  assert.ok(result.resources.every((item) => item.id !== 'deleted'));
  assert.equal(snapshots[0].resources.length, 1);
  assert.equal(snapshots[0].updatedAt, null);
  assert.ok(result.updatedAt);
});

test('partial errors retain older course results but forbidden courses are removed', async () => {
  const session = { accountId: 'A', courses: [{ id: '1' }, { id: '2' }] };
  const result = await refreshCourses({ session, previous: { ...emptyIndex(), accountId: 'A', resources: [resource('a'), resource('b', '2')] }, signal: new AbortController().signal,
    client: { loadCourse: async (_, course) => { throw Object.assign(new Error('failed'), { code: course.id === '1' ? 'NETWORK' : 'FORBIDDEN' }); } }
  });
  assert.deepEqual(result.resources.map((item) => item.id), ['a']);
  assert.deepEqual(result.failedCourses, ['1', '2']);
});

test('throttling stops remaining courses and abort prevents new requests', async () => {
  let calls = 0;
  const controller = new AbortController();
  const args = { session: { courses: [{ id: '1' }, { id: '2' }] }, previous: emptyIndex(), signal: controller.signal,
    client: { loadCourse: async () => { calls++; throw Object.assign(new Error('wait'), { code: 'RATE_LIMIT' }); } }
  };
  await assert.rejects(refreshCourses(args), { code: 'RATE_LIMIT' });
  assert.equal(calls, 1);
  controller.abort();
  await assert.rejects(refreshCourses(args), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('empty search shows recents newest first, falling back to suggestions for a new user', () => {
  const resources = [resource('a'), resource('b', '2'), resource('c')];
  assert.deepEqual(searchResources(resources, { history: { a: 10, c: 20 } }).map((item) => item.id), ['c', 'a']);
  assert.equal(searchResources(resources).length, 3);
  assert.deepEqual(searchResources(resources, { recent: true }), []);
});

test('queries search every course and course/document/recent filters compose', () => {
  const resources = [resource('a'), resource('b', '2'), { ...resource('c'), type: 'LINK' }];
  assert.equal(searchResources(resources, { query: 'notes' }).length, 3);
  assert.deepEqual(searchResources(resources, { query: 'notes', courseId: '1', documents: true, recent: true, history: { a: 1, b: 2, c: 3 } }).map((item) => item.id), ['a']);
  assert.equal(searchResources(Array.from({ length: 200 }, (_, i) => resource(String(i))), { query: 'notes' }).length, 100);
});
