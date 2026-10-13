import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleSpotlight } from '../src/toggle.js';

test('shortcut resolves the currently focused tab when Chrome omits its optional tab argument', async () => {
  let activeTab = 12;
  const injected = [];
  const api = { tabs: { query: async filters => {
    assert.deepEqual(filters, { active: true, lastFocusedWindow: true });
    return [{ id: activeTab }];
  } }, scripting: { executeScript: async options => injected.push(options) } };
  assert.equal(await toggleSpotlight(undefined, api), true);
  activeTab = 25;
  assert.equal(await toggleSpotlight(undefined, api), true);
  assert.deepEqual(injected.map(options => options.target.tabId), [12, 25]);
  assert.ok(injected.every(options => options.world === 'ISOLATED' && options.files[0] === 'dist/spotlight.js'));
});

test('explicit command and toolbar tabs do not require querying permissions or retain another tab', async () => {
  const injected = [];
  const api = { tabs: { query() { throw new Error('Should use supplied tab'); } }, scripting: { executeScript: async options => injected.push(options.target.tabId) } };
  assert.equal(await toggleSpotlight({ id: 0 }, api), true);
  assert.equal(await toggleSpotlight({ id: 10 }, api), true);
  assert.deepEqual(injected, [0, 10]);
});

test('no active window and blocked pages do not create an unhandled shortcut rejection', async () => {
  assert.equal(await toggleSpotlight(undefined, { tabs: { query: async () => [] } }), false);
  const previous = console.warn;
  let reported = false;
  console.warn = () => { reported = true; };
  try {
    assert.equal(await toggleSpotlight({ id: 2 }, { scripting: { executeScript: async () => { throw new Error('Protected page'); } } }), false);
    assert.equal(reported, true);
  } finally { console.warn = previous; }
});
