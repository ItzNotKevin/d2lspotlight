import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionContextAlive, subscribeStorageChanges } from '../src/extension-context.js';

test('invalidated context is detected and storage cleanup uses the captured event', () => {
  const previous = globalThis.chrome;
  let removed = false;
  try {
    globalThis.chrome = { runtime: { id: 'fixture', getManifest: () => ({ version: '1' }) },
      storage: { onChanged: { addListener() {}, removeListener() { removed = true; } } } };
    assert.equal(extensionContextAlive(), true);
    const unsubscribe = subscribeStorageChanges(() => {});
    globalThis.chrome = { runtime: undefined, storage: undefined };
    assert.equal(extensionContextAlive(), false);
    unsubscribe();
    assert.equal(removed, true);
    globalThis.chrome = { runtime: { id: 'fixture', getManifest() { throw new Error('Extension context invalidated'); } } };
    assert.equal(extensionContextAlive(), false);
  } finally { globalThis.chrome = previous; }
});
