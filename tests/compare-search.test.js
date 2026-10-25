import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSearchReports } from '../benchmarks/compare-search.js';

const row = (query, expected, top5, filters = {}) => ({ query, expected, top5, filters });
const report = rows => ({ datasetHash: 'same-dataset', rows });

test('comparison catches rank, recall, and no-answer regressions independently', () => {
  const before = report([row('outline', ['a'], ['a']), row('notes', ['a', 'b'], ['a', 'b']), row('absent', [], [])]);
  const after = report([row('outline', ['a'], ['x', 'a']), row('notes', ['a', 'b'], ['a']), row('absent', [], ['x'])]);
  const result = compareSearchReports(before, after);
  assert.deepEqual(result.regressions.map(item => item.query), ['outline', 'notes', 'absent']);
  assert.equal(result.improvements.length, 0);
  assert.equal(compareSearchReports(after, before).improvements.length, 3);
});

test('comparison preserves filters and reports mixed rank/recall changes both ways', () => {
  const before = report([row('notes', ['a', 'b'], ['x', 'a', 'b'], { source: 'LEARN' })]);
  const after = report([row('notes', ['a', 'b'], ['a'], { source: 'LEARN' })]);
  const result = compareSearchReports(before, after);
  assert.equal(result.improvements.length, 1);
  assert.equal(result.regressions.length, 1);
  assert.deepEqual(result.regressions[0].filters, { source: 'LEARN' });
  assert.deepEqual(compareSearchReports(before, before).regressions, []);
});

test('comparison rejects different datasets and changed query labels', () => {
  const before = report([row('outline', ['a'], ['a'])]);
  assert.throws(() => compareSearchReports(before, { ...before, datasetHash: 'other' }), /dataset hash/);
  assert.throws(() => compareSearchReports(before, report([])), /same query rows/);
  assert.throws(() => compareSearchReports(before, report([row('outline', ['b'], ['a'])])), /labels changed/);
});
