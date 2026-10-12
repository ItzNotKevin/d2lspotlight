import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readPageToken, readPiazzaSession } from '../src/piazza/session.js';

const sender = { id: 'extension', tab: { id: 42 }, frameId: 0, url: 'https://piazza.com/class/example' };

test('reads the page global in MAIN world in the sending tab', async () => {
  const result = await readPiazzaSession(sender, 'extension', async (options) => {
    assert.equal(options.world, 'MAIN');
    assert.deepEqual(options.target, { tabId: 42, frameIds: [0] });
    return [{ result: vm.runInNewContext(`(${options.func.toString()})()`, {
      location: { origin: 'https://piazza.com' }, window: { CSRF_TOKEN: 'fixture-token' }
    }) }];
  });
  assert.deepEqual(result, { ok: true, token: 'fixture-token' });
});

test('rejects other extensions, origins, and subframes before injection', async () => {
  for (const change of [{ id: 'other' }, { url: 'https://example.com/' }, { frameId: 1 }, { tab: undefined }]) {
    assert.deepEqual(await readPiazzaSession({ ...sender, ...change }, 'extension', async () => assert.fail('must not inject')), { ok: false });
  }
});

test('handles absent token, invalid value and navigation away without exposing values', () => {
  for (const [origin, token] of [['https://example.com', 'secret'], ['https://piazza.com', undefined], ['https://piazza.com', {}], ['https://piazza.com', 'bad\r\nvalue']]) {
    assert.equal(vm.runInNewContext(`(${readPageToken.toString()})()`, { location: { origin }, window: { CSRF_TOKEN: token } }), '');
  }
});

test('injection failures return no raw error details', async () => {
  assert.deepEqual(await readPiazzaSession(sender, 'extension', async () => { throw new Error('private detail'); }), { ok: false });
});
