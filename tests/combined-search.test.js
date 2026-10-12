import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPiazzaFeed } from '../src/piazza/client.js';
import { searchResources } from '../src/learn/search.js';
import { createIndexStore } from '../src/learn/cache.js';
import { PIAZZA_CACHE_KEY } from '../src/piazza/cache.js';

test('feed pagination advances offsets and deduplicates overlapping posts', async () => {
  const offsets = [];
  const result = await loadPiazzaFeed({ classId: 'class1', request: async ({ method, params }) => {
    assert.equal(method, 'network.get_my_feed');
    offsets.push(params.offset);
    return { feed: params.offset === 0 ? Array.from({ length: 100 }, (_, nr) => ({ nr })) : [{ nr: 99 }, { nr: 100 }] };
  } });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(result.posts.length, 101);
  assert.equal(result.partial, false);
});

test('repeated and capped feeds are partial instead of looping forever', async () => {
  let calls = 0;
  const repeated = await loadPiazzaFeed({ classId: 'class1', request: async () => {
    calls++;
    return { feed: Array.from({ length: 100 }, (_, nr) => ({ nr })) };
  } });
  assert.equal(calls, 2);
  assert.equal(repeated.partial, true);
  const capped = await loadPiazzaFeed({ classId: 'class1', request: async ({ params }) => ({ feed: Array.from({ length: 100 }, (_, i) => ({ nr: params.offset + i })) }) });
  assert.equal(capped.posts.length, 2000);
  assert.equal(capped.partial, true);
});

test('invalid feed and cancelled refresh cannot be treated as a completed index', async () => {
  await assert.rejects(loadPiazzaFeed({ classId: 'class1', request: async () => ({}) }), /Unexpected/);
  const controller = new AbortController();
  await assert.rejects(loadPiazzaFeed({ classId: 'class1', signal: controller.signal, request: async () => {
    controller.abort(); return { feed: [] };
  } }), { name: 'AbortError' });
});

const resources = [
  { id: 'learn:1', source: 'LEARN', title: 'Assignment notes', course: 'CS 246', courseId: '1', type: 'PDF', path: 'Week 1' },
  { id: 'piazza:1:2', source: 'Piazza', title: 'Assignment clarification', course: 'Piazza', courseId: 'piazza:1', type: 'POST', path: 'Week 1' }
];
test('one synchronous search matches both sources and respects source/course/recent filters', () => {
  assert.equal(searchResources(resources, { query: 'assignment' }).length, 2);
  assert.deepEqual(searchResources(resources, { query: 'assignment', source: 'Piazza' }), [resources[1]]);
  assert.deepEqual(searchResources(resources, { query: 'assignment', documents: true }), [resources[0]]);
  assert.deepEqual(searchResources(resources, { query: 'assignment', courseId: 'piazza:1' }), [resources[1]]);
  assert.deepEqual(searchResources(resources, { recent: true, history: { 'piazza:1:2': 1 } }), [resources[1]]);
});

test('clearing or switching Piazza accounts preserves the LEARN index', async () => {
  let data = {};
  const storage = { get: async () => structuredClone(data), set: async (value) => { Object.assign(data, structuredClone(value)); } };
  const learn = createIndexStore(storage);
  const piazza = createIndexStore(storage, PIAZZA_CACHE_KEY);
  const l = await learn('begin', { accountId: 'learn-account' });
  await learn('commit', { ...l, resources: [resources[0]] });
  const p = await piazza('begin', { accountId: 'piazza-account' });
  await piazza('commit', { ...p, resources: [resources[1]] });
  assert.equal((await piazza('read')).resources.length, 1);
  await piazza('begin', { accountId: 'other-piazza-account' });
  assert.equal((await piazza('read')).resources.length, 0);
  await assert.rejects(piazza('commit', p), /newer refresh/);
  await piazza('clear');
  assert.deepEqual((await learn('read')).resources, [resources[0]]);
});
