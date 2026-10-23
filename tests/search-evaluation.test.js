import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSearchEvaluation } from '../benchmarks/search-evaluation.js';

test('evaluation seed contains 20–30 valid queries and rejects invalid private datasets', async () => {
  const data = JSON.parse(await readFile(new URL('../benchmarks/search-evaluation.example.json', import.meta.url), 'utf8'));
  validateSearchEvaluation(data);
  assert.ok(data.queries.length >= 20 && data.queries.length <= 30);
  assert.throws(() => validateSearchEvaluation({ ...data, queries: [{ text: 'test', relevant: ['missing'] }] }), /Queries/);
  assert.throws(() => validateSearchEvaluation({ ...data, documents: [{ resourceId: 'missing', pages: [] }] }), /Document/);
  assert.throws(() => validateSearchEvaluation({ ...data, resources: [...data.resources, data.resources[0]] }), /unique/);
});
