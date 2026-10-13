import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLearnSession, registerLearnSession } from '../src/learn/session.js';

test('cross-tab session verification uses only LEARN with cookies and checks identity plus accessible enrollments', async () => {
  const requested = [];
  const result = await verifyLearnSession({ fetchImpl: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://learn.uwaterloo.ca');
    assert.equal(options.credentials, 'include');
    assert.equal(options.redirect, 'error');
    requested.push(url);
    if (url.endsWith('/versions/')) return Response.json([{ ProductCode: 'lp', SupportedVersions: ['1.49'] }, { ProductCode: 'le', SupportedVersions: ['1.82'] }]);
    if (url.endsWith('/whoami')) return Response.json({ Identifier: 'user-a' });
    return Response.json({ Items: [{ OrgUnit: { Id: 246, Code: 'CS246' }, Access: { CanAccess: true } }, { OrgUnit: { Id: 999 }, Access: { CanAccess: false } }], PagingInfo: { HasMoreItems: false } });
  } });
  assert.deepEqual(result, { accountId: 'user-a', courseIds: ['246'] });
  assert.equal(requested.length, 3);
});

test('logged-out, redirected and unavailable sessions cannot verify cached search', async () => {
  for (const fetchImpl of [async () => new Response('', { status: 401 }), async () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }), async () => { throw new TypeError('redirect'); }]) {
    await assert.rejects(verifyLearnSession({ fetchImpl }));
  }
});

test('session broker waits for verification before reading account data, rejects foreign senders and returns no index on failure', async () => {
  let listener;
  const api = { runtime: { id: 'extension', onMessage: { addListener: fn => { listener = fn; } } } };
  const actions = [];
  let accept;
  registerLearnSession(async (action, payload) => { actions.push([action, payload]); return action === 'read' ? { accountId: 'user-a' } : { accountId: payload.accountId, generation: 'g' }; }, api,
    () => new Promise(resolve => { accept = resolve; }));
  assert.equal(listener({ type: 'learn-session' }, { id: 'other', tab: { id: 1 }, frameId: 0 }, () => assert.fail()), undefined);
  const response = new Promise(resolve => listener({ type: 'learn-session' }, { id: 'extension', tab: { id: 1 }, frameId: 0 }, resolve));
  assert.deepEqual(actions, []);
  accept({ accountId: 'user-b', courseIds: ['246'] });
  assert.deepEqual(await response, { ok: true, index: { accountId: 'user-b', generation: 'g' }, courseIds: ['246'] });
  assert.deepEqual(actions, [['read', undefined], ['begin', { accountId: 'user-b' }]]);
  registerLearnSession(() => assert.fail('Must not access cache when login fails'), api, async () => { throw new Error('Sign in'); });
  const failed = await new Promise(resolve => listener({ type: 'learn-session' }, { id: 'extension', tab: { id: 1 }, frameId: 0 }, resolve));
  assert.deepEqual(failed, { ok: false, error: 'Sign in' });
});

test('a same-account session check preserves the generation of an existing refresh', async () => {
  let listener;
  const api = { runtime: { id: 'extension', onMessage: { addListener: fn => { listener = fn; } } } };
  const saved = { accountId: 'user-a', generation: 'refresh-in-progress' };
  registerLearnSession(async action => { assert.equal(action, 'read'); return saved; }, api,
    async () => ({ accountId: 'user-a', courseIds: ['246'] }));
  const result = await new Promise(resolve => listener({ type: 'learn-session' }, { id: 'extension', tab: { id: 2 }, frameId: 0 }, resolve));
  assert.equal(result.index, saved);
});
