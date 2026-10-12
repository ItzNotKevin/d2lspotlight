import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSemanticSearch, clearSemanticCache } from '../src/search/semantic/background.js';
import { CACHE_KEY, emptyIndex } from '../src/learn/cache.js';
import { PIAZZA_CACHE_KEY } from '../src/piazza/cache.js';

let listener;
let saved;
let sent;
let respond;
globalThis.chrome = {
  runtime: {
    id: 'test-extension', getURL: (path) => `chrome-extension://test-extension/${path}`,
    getContexts: async () => [{}], onMessage: { addListener: (handler) => { listener = handler; } },
    sendMessage: async (message) => { sent.push(message); return respond(message); }
  },
  storage: { local: { get: async () => structuredClone(saved) } }
};
registerSemanticSearch();
const sender = { id: 'test-extension', tab: { id: 1 }, frameId: 0 };

function reset() {
  saved = { [CACHE_KEY]: { ...emptyIndex(), accountId: 'account-one', generation: 'refresh-one', resources: [
    { id: 'notes', title: 'Enumeration notes', course: 'MATH 239', courseId: '239', type: 'PDF', path: '' }
  ] }, [PIAZZA_CACHE_KEY]: emptyIndex() };
  sent = [];
  respond = () => ({ ok: true, matches: [{ id: 'notes', score: 0.8 }], indexed: 1, total: 1 });
}

function search(extra = {}) {
  return new Promise((resolveReply) => {
    const accepted = listener({ type: 'semantic-search', requestId: crypto.randomUUID(), query: 'combinatorics textbook', ...extra }, sender, resolveReply);
    assert.equal(accepted, true);
  });
}

test('semantic worker receives only saved resources with verified source account scope', async () => {
  reset();
  const result = await search({ resources: [{ id: 'injected', title: 'Untrusted' }] });
  assert.equal(result.ok, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].resources.map((resource) => [resource.id, resource.source, resource.accountId]), [['notes', 'LEARN', 'account-one']]);
  assert.deepEqual(sent[0].allowedIds, ['notes']);
});

test('unknown senders, extension pages, and subframes cannot request cached semantic data', () => {
  reset();
  for (const invalid of [{ ...sender, id: 'other' }, { ...sender, tab: undefined }, { ...sender, frameId: 2 }]) {
    assert.equal(listener({ type: 'semantic-search', query: 'textbook' }, invalid, () => assert.fail('Unexpected reply')), undefined);
  }
  assert.equal(sent.length, 0);
});

test('an account change during inference discards the old semantic response', async () => {
  reset();
  respond = () => {
    saved[CACHE_KEY] = { ...emptyIndex(), accountId: 'account-two' };
    return { ok: true, matches: [{ id: 'notes', score: 0.9 }] };
  };
  const result = await search();
  assert.equal(result.ok, false);
  assert.equal(result.matches, undefined);
});

test('course filters and strict identifiers prevent unrelated resources from reaching semantic ranking', async () => {
  reset();
  assert.deepEqual((await search({ filters: { source: 'Piazza' } })).matches, []);
  assert.deepEqual((await search({ query: 'cs246 a2 preparation' })).matches, []);
  assert.equal(sent.length, 0);
});

test('clearing semantic cache awaits the offscreen acknowledgement', async () => {
  reset();
  respond = () => ({ ok: true });
  await clearSemanticCache();
  assert.equal(sent[0].action, 'clear');
  respond = () => ({ ok: false, error: 'Could not clear meaning-search data.' });
  await assert.rejects(clearSemanticCache(), /Could not clear/);
});


test('semantic broker applies the same automatic and confirmed course associations as the overlay', async () => {
  reset();
  saved[CACHE_KEY].courses = [{ id: '239', code: 'MATH239', name: 'MATH 239' }];
  saved[PIAZZA_CACHE_KEY] = { ...emptyIndex(), accountId: 'piazza-one', courses: [{ id: 'piazza:math', name: 'MATH239' }],
    resources: [{ id: 'post', title: 'Enumeration notes', course: 'MATH239', courseId: 'piazza:math', type: 'POST', path: '' }] };
  await search({ filters: { courseId: '239', source: 'Piazza' } });
  assert.deepEqual(sent[0].allowedIds, ['post']);
  assert.equal(sent[0].resources.find(r => r.id === 'post').sourceCourseId, 'piazza:math');
  sent = [];
  saved[CACHE_KEY].courses.push({ id: 'other-section', code: 'MATH239', name: 'MATH239 other section' });
  saved['courseAssociations:["account-one","piazza-one"]'] = { 'piazza:math': 'other-section' };
  await search({ filters: { courseId: 'other-section', source: 'Piazza' } });
  assert.deepEqual(sent[0].allowedIds, ['post']);
});
