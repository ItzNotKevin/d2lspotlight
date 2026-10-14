import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleSpotlight } from '../src/toggle.js';
import { isSearchSender } from '../src/message-sender.js';

test('restricted pages open and reuse a standalone window instead of attempting injection', async () => {
  let windowId;
  const created = [];
  const focused = [];
  const api = { runtime: { getURL: path => `chrome-extension://test/${path}` },
    storage: { session: { get: async () => ({ spotlightWindowId: windowId }), set: async saved => { windowId = saved.spotlightWindowId; } } },
    windows: { create: async options => { created.push(options); return { id: 10 }; }, get: async id => ({ id, tabs: [{ url: 'chrome-extension://test/spotlight.html' }] }), update: async id => focused.push(id) },
    scripting: { executeScript: () => assert.fail('Restricted pages must not be injected') } };
  assert.equal(await toggleSpotlight({ id: 1, url: 'chrome://newtab/' }, api), true);
  assert.equal(await toggleSpotlight({ id: 1, url: 'chrome://newtab/' }, api), true);
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'popup');
  assert.deepEqual(focused, [10]);
});

test('only the designated extension search page is accepted without a content-script tab', () => {
  assert.equal(isSearchSender({ id: 'test', url: 'chrome-extension://test/spotlight.html' }, 'test'), true);
  for (const sender of [{ id: 'other', url: 'chrome-extension://test/spotlight.html' }, { id: 'test', url: 'chrome-extension://test/semantic.html' }, { id: 'test', url: 'https://example.com/spotlight.html' }, { id: 'test', url: 'chrome-extension://test/spotlight.html', frameId: 2 }]) assert.equal(isSearchSender(sender, 'test'), false);
});

test('an injection failure on a normal tab opens the search window as a fallback', async () => {
  let created = 0;
  const api = { runtime: { getURL: path => `chrome-extension://test/${path}` },
    storage: { session: { get: async () => ({}), set: async () => {} } },
    scripting: { executeScript: async () => { throw new Error('Injection denied'); } },
    windows: { create: async () => { created++; return { id: 20 }; } } };
  assert.equal(await toggleSpotlight({ id: 1, url: 'https://example.com/' }, api), true);
  assert.equal(created, 1);
});
