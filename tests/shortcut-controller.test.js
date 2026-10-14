import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('a delayed native command acknowledges the local key gesture once; toolbar clicks remain independent', async () => {
  const source = await readFile(new URL('../src/shortcut-controller.jsx', import.meta.url), 'utf8');
  const install = source.slice(source.indexOf('export function installShortcut')).replace('export ', '');
  let now = 100;
  let toggles = 0;
  const listeners = new Map();
  const context = vm.createContext({ SHORTCUT_STATE: '__learnSpotlightShortcut',
    document: { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) },
    performance: { now: () => now }, extensionContextAlive: () => true, toggleOverlay: () => toggles++ });
  const controller = vm.runInContext(`${install}; installShortcut()`, context);
  const key = () => listeners.get('keydown')({ code: 'KeyK', shiftKey: true, metaKey: true, preventDefault() {}, stopImmediatePropagation() {} });
  key();
  now = 850;
  assert.equal(controller.invoke('command'), true);
  assert.equal(toggles, 1, 'Worker response after the old 200ms limit must not toggle a second time');
  now = 900;
  controller.invoke('command');
  assert.equal(toggles, 2, 'The acknowledgement must not suppress subsequent commands');
  key();
  controller.invoke('toolbar');
  assert.equal(toggles, 4, 'Toolbar must not be mistaken for the key event');
  assert.equal(vm.runInContext('installShortcut()', context), controller, 'Repeated installation must retain one controller');
});
