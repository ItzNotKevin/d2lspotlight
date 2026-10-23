import test from 'node:test';
import assert from 'node:assert/strict';
import { copyReport } from '../src/copy-report.js';

test('copy report writes the displayed text without changing its formatting', async () => {
  const text = '{\n  "events": []\n}';
  let copied;
  assert.equal(await copyReport(text, { clipboard: { writeText: async value => { copied = value; } }, select: () => assert.fail('Fallback must not run on success') }), 'copied');
  assert.equal(copied, text);
});

test('a blocked clipboard selects the report for manual copying', async () => {
  let selected = false;
  assert.equal(await copyReport('report', { clipboard: { writeText: async () => { throw new Error('Denied'); } }, select: () => { selected = true; } }), 'selected');
  assert.equal(selected, true);
});

test('browsers without a clipboard API keep the manual-copy fallback', async () => {
  let selected = false;
  assert.equal(await copyReport('report', { clipboard: null, select: () => { selected = true; } }), 'selected');
  assert.equal(selected, true);
});
