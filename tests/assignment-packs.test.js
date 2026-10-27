import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePacks, resolvePackItem, matchingPacks, packStorageKey } from '../src/packs/core.js';

const resource = { id: 'notes', source: 'LEARN', courseId: 'cs246', title: 'Private notes', url: 'https://learn.uwaterloo.ca/' };
const create = () => updatePacks([], { type: 'create', id: 'a2', name: ' A2 ', courseId: 'cs246' });

test('renaming preserves saved references and rejects blank names', () => {
  const packs = updatePacks(create(), { type: 'save', packId: 'a2', section: 'Notes', resource });
  const renamed = updatePacks(packs, { type: 'rename', packId: 'a2', name: ' Assignment 2 ' });
  assert.deepEqual(renamed[0], { ...packs[0], name: 'Assignment 2' });
  assert.equal(packs[0].name, 'A2');
  assert.throws(() => updatePacks(packs, { type: 'rename', packId: 'a2', name: '  ' }));
  assert.equal(updatePacks(packs, { type: 'rename', packId: 'a2', name: 'x'.repeat(110) })[0].name.length, 100);
});

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

test('moving saved references works without an available resource and preserves other entries', () => {
  const packs = updatePacks(create(), { type: 'save', packId: 'a2', section: 'Notes', resource });
  const both = updatePacks(packs, { type: 'save', packId: 'a2', section: 'Notes', resource: { ...resource, source: 'Piazza' } });
  const item = both[0].items[0];
  const moved = updatePacks(both, { type: 'move', packId: 'a2', item, section: 'Submit' });
  assert.deepEqual(moved[0].items, [{ ...item, section: 'Submit' }, both[0].items[1]]);
  assert.equal(both[0].items[0].section, 'Notes');
  assert.throws(() => updatePacks(both, { type: 'move', packId: 'a2', item, section: 'Other' }));
  assert.deepEqual(updatePacks(both, { type: 'move', packId: 'a2', item: { ...item, id: 'missing' }, section: 'Submit' }), both);
});

test('search respects available courses and removal preserves other entries', () => {
  const packs = updatePacks(create(), { type: 'save', packId: 'a2', section: 'Notes', resource });
  assert.equal(matchingPacks(packs, 'cs246 a2', [{ id: 'cs246', name: 'CS246' }]).length, 1);
  assert.equal(matchingPacks(packs, '', []).length, 0);
  assert.equal(matchingPacks(packs, '', [{ id: 'cs246', name: 'CS246' }], 'other').length, 0);
  assert.equal(updatePacks(packs, { type: 'remove', packId: 'a2', item: packs[0].items[0] })[0].items.length, 0);
  assert.deepEqual(updatePacks(packs, { type: 'delete', packId: 'a2' }), []);
});

test('pack search understands course spacing and assignment aliases with strict numbers', () => {
  const courses = [{ id: 'cs246', name: 'CS 246' }, { id: 'cs245', name: 'CS245' }];
  const packs = [...create(), { id: 'a12', name: 'Assignment 12', courseId: 'cs246', items: [] },
    { id: 'other', name: 'Homework 2', courseId: 'cs245', items: [] }];
  for (const query of ['CS246 A2', 'cs 246 assignment 2', 'cs-246 hw2', 'CS_246 assn 2']) {
    assert.deepEqual(matchingPacks(packs, query, courses).map(pack => pack.id), ['a2']);
  }
  assert.deepEqual(matchingPacks(packs, 'a12', courses).map(pack => pack.id), ['a12']);
  assert.deepEqual(matchingPacks(packs, 'cs245 assignment2', courses).map(pack => pack.id), ['other']);
  assert.deepEqual(matchingPacks(packs, 'cs24 a2', courses), []);
  assert.deepEqual(matchingPacks(packs, 'cs246 a2', courses, 'cs245'), []);
  assert.deepEqual(matchingPacks(packs, 'cs246 a2', []), []);
});
