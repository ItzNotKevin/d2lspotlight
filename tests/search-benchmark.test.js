import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmark } from '../benchmarks/academic.js';
import { summarize, calibrateThreshold, validateBenchmark } from '../benchmarks/evaluate.js';
import { hybridSearch } from '../src/search/hybrid.js';

test('academic benchmark covers eight fields with separate positive and unanswerable calibration/test cases', () => {
  validateBenchmark(benchmark);
  assert.equal(new Set(benchmark.queries.map((query) => query.field)).size, 8);
  assert.equal(benchmark.resources.length, 48);
  assert.equal(benchmark.queries.filter((query) => query.split === 'calibration').length, 24);
  assert.equal(benchmark.queries.filter((query) => query.split === 'test').length, 56);
});

test('retrieval metrics distinguish top-one accuracy, multiple relevant resources, and false positive queries', () => {
  const metrics = summarize([
    { relevant: ['a', 'b'], results: [{ id: 'a' }, { id: 'c' }] },
    { relevant: ['d'], results: [{ id: 'c' }, { id: 'd' }] },
    { relevant: [], results: [{ id: 'e' }] }, { relevant: [], results: [] }
  ]);
  assert.equal(metrics.top1, .5);
  assert.equal(metrics.hitAt5, 1);
  assert.equal(metrics.recallAt5, .75);
  assert.equal(metrics.mrr, .75);
  assert.equal(metrics.falsePositiveRate, .5);
});

test('threshold calibration balances supported and unsupported queries without reading test labels', () => {
  const resources = [{ id: 'a', title: 'Enumeration', course: 'MATH 239', path: 'Course Notes', type: 'PDF' }];
  const rows = [
    { split: 'calibration', text: 'counting techniques', relevant: ['a'], scores: [{ id: 'a', score: .8 }] },
    { split: 'calibration', text: 'brain surgery', relevant: [], scores: [{ id: 'a', score: .55 }] }
  ];
  const selected = calibrateThreshold(resources, rows);
  assert.ok(selected.threshold > .55 && selected.threshold <= .8);
  assert.equal(selected.metrics.hitAt5, 1);
  assert.equal(selected.metrics.falsePositiveRate, 0);
  assert.throws(() => calibrateThreshold(resources, [{ ...rows[0], split: 'test' }, rows[1]]), /calibration queries only/);
});

test('benchmark-specific cutoffs do not change the default production cutoff', () => {
  const resources = [{ id: 'a', title: 'Enumeration', course: 'MATH 239', path: 'Course Notes', type: 'PDF' }];
  const matches = [{ id: 'a', score: .7 }];
  assert.equal(hybridSearch(resources, { query: 'combinatorics textbook' }, matches).length, 1);
  assert.equal(hybridSearch(resources, { query: 'combinatorics textbook', semanticThreshold: .8 }, matches).length, 0);
  assert.equal(hybridSearch(resources, { query: 'combinatorics textbook', semanticThreshold: 1 }, matches).length, 1);
});
