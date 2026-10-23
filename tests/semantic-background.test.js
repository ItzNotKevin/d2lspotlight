import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSemanticSearch, clearSemanticCache } from '../src/search/semantic/background.js';
import { CACHE_KEY, emptyIndex } from '../src/learn/cache.js';
import { MODEL_ID, MODEL_REVISION } from '../src/search/semantic/config.js';
import { PIAZZA_CACHE_KEY } from '../src/piazza/cache.js';

let listener;
let saved;
let sent;
let respond;
let readyRequests;
let readiness;
globalThis.chrome = {
  runtime: {
    id: 'test-extension', getURL: (path) => `chrome-extension://test-extension/${path}`,
    getContexts: async () => [{}], onMessage: { addListener: (handler) => { listener = handler; } },
    sendMessage: async (message) => {
      if (message.target === 'spotlight-offscreen') { readyRequests++; return readiness(); }
      sent.push(message); return respond(message);
    }
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
  readyRequests = 0;
  readiness = () => ({ ok: true });
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
  assert.equal(readyRequests, 1);
  assert.deepEqual(sent[0].resources.map((resource) => [resource.id, resource.source, resource.accountId]), [['notes', 'LEARN', 'account-one']]);
  assert.deepEqual(sent[0].allowedIds, ['notes']);
});

test('an existing offscreen document finishes loading its listeners before the first search is sent', async () => {
  reset();
  readiness = () => {
    if (readyRequests === 1) throw new Error('Receiving end does not exist');
    return { ok: true };
  };
  assert.equal((await search()).ok, true);
  assert.equal(readyRequests, 2);
  assert.equal(sent.length, 1);
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


test('model availability is read from bundled assets without starting inference', async () => {
  const original = globalThis.fetch;
  try {
    for (const [manifest, available] of [[{ model: MODEL_ID, revision: MODEL_REVISION }, true], [{ model: 'wrong-model' }, false], [null, false]]) {
      globalThis.fetch = async url => {
        assert.equal(url, 'chrome-extension://test-extension/dist/model-manifest.json');
        return { ok: Boolean(manifest), json: async () => manifest };
      };
      const result = await new Promise(resolve => {
        assert.equal(listener({ type: 'semantic-status' }, sender, resolve), true);
      });
      assert.deepEqual(result, { ok: true, available });
    }
    globalThis.fetch = async () => { throw new Error('Missing assets'); };
    assert.deepEqual(await new Promise(resolve => listener({ type: 'semantic-status' }, sender, resolve)), { ok: true, available: false });
    assert.equal(listener({ type: 'semantic-status' }, { id: 'untrusted' }, () => assert.fail('Unauthorized status reply')), undefined);
  } finally { globalThis.fetch = original; }
});


test('document scope sends only the chosen parent ID to meaning search', async () => {
  reset();
  saved[CACHE_KEY].resources.push({ ...saved[CACHE_KEY].resources[0], id: 'other-file' });
  await search({ filters: { documentId: 'notes' } });
  assert.deepEqual(sent[0].allowedIds, ['notes']);
});
