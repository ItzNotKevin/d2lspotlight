import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateSearch, validateSearchEvaluation } from '../benchmarks/search-evaluation.js';

test('evaluation seed contains 20–30 valid queries and rejects invalid private datasets', async () => {
  const data = JSON.parse(await readFile(new URL('../benchmarks/search-evaluation.example.json', import.meta.url), 'utf8'));
  validateSearchEvaluation(data);
  assert.ok(data.queries.length >= 20 && data.queries.length <= 30);
  assert.throws(() => validateSearchEvaluation({ ...data, queries: [{ text: 'test', relevant: ['missing'] }] }), /Queries/);
  assert.throws(() => validateSearchEvaluation({ ...data, documents: [{ resourceId: 'missing', pages: [] }] }), /Document/);
  assert.throws(() => validateSearchEvaluation({ ...data, resources: [...data.resources, data.resources[0]] }), /unique/);
});

test('evaluation distinguishes first-result success and no-answer failures', async () => {
  const resource = { id: 'outline', title: 'Course outline', course: 'CS246', courseId: 'cs246', source: 'LEARN', type: 'LINK', url: 'https://example.com/outline' };
  const report = await evaluateSearch({ resources: [resource], documents: [], queries: [
    { text: 'cs246 outline', relevant: ['outline'] },
    { text: 'cs246 outline', relevant: [] },
    { text: 'cs247 outline', relevant: [] },
  ] }, { embed: async () => [0, 0] });
  assert.equal(report.hitAt1, 1);
  assert.equal(report.meanReciprocalRankAt5, 1);
  assert.equal(report.noAnswerFalsePositiveRate, 0.5);
  assert.deepEqual(report.rows[0].top5, ['outline']);
  assert.deepEqual(report.rows[2].top5, []);
});
