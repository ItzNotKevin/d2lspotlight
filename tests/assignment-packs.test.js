import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePacks, resolvePackItem, matchingPacks, packStorageKey } from '../src/packs/core.js';

const resource = { id: 'notes', source: 'LEARN', courseId: 'cs246', title: 'Private notes', url: 'https://learn.uwaterloo.ca/' };
const create = () => updatePacks([], { type: 'create', id: 'a2', name: ' A2 ', courseId: 'cs246' });

test('packs require a name and course and separate account combinations', () => {
  assert.throws(() => updatePacks([], { type: 'create', id: 'a2', name: '  ', courseId: 'cs246' }));
  assert.notEqual(packStorageKey('one', 'piazza'), packStorageKey('two', 'piazza'));
  assert.notEqual(packStorageKey('one', 'piazza'), packStorageKey('one', 'other'));
  assert.equal(create()[0].name, 'A2');
});

test('saving passages deduplicates by source and document and moves sections', () => {
  const packs = updatePacks(create(), { type: 'save', packId: 'a2', section: 'Notes', resource });
  const moved = updatePacks(packs, { type: 'save', packId: 'a2', section: 'Instructions', resource: { ...resource, id: 'page-2', resourceId: 'notes' } });
  assert.deepEqual(moved[0].items, [{ source: 'LEARN', id: 'notes', section: 'Instructions' }]);
  assert.equal(JSON.stringify(moved).includes('Private notes'), false);
  assert.equal(JSON.stringify(moved).includes('https:'), false);
  assert.throws(() => updatePacks(packs, { type: 'save', packId: 'a2', section: 'Notes', resource: { ...resource, courseId: 'other' } }));
});

test('unavailable references do not reveal saved content or resolve across sources', () => {
  const item = { source: 'LEARN', id: 'notes' };
  assert.equal(resolvePackItem(item, []), undefined);
  assert.equal(resolvePackItem(item, [{ ...resource, source: 'Piazza' }]), undefined);
  assert.equal(resolvePackItem(item, [resource]), resource);
});

test('search respects available courses and removal preserves other entries', () => {
  const packs = updatePacks(create(), { type: 'save', packId: 'a2', section: 'Notes', resource });
  assert.equal(matchingPacks(packs, 'cs246 a2', [{ id: 'cs246', name: 'CS246' }]).length, 1);
  assert.equal(matchingPacks(packs, '', []).length, 0);
  assert.equal(matchingPacks(packs, '', [{ id: 'cs246', name: 'CS246' }], 'other').length, 0);
  assert.equal(updatePacks(packs, { type: 'remove', packId: 'a2', item: packs[0].items[0] })[0].items.length, 0);
  assert.deepEqual(updatePacks(packs, { type: 'delete', packId: 'a2' }), []);
});
