import assert from 'node:assert/strict';
import { createOutlineEncoder } from './outline-runtime.mjs';
import { createOutlineChunks } from '../src/search/outlines/chunks.js';
import { normalizeOutline } from '../src/search/outlines/extract.js';
import { cosineSimilarity } from '../src/search/semantic/model.js';
import { semanticQueryText } from '../src/search/rank.js';

const cases = [
  ['BIO 100', 'Cell Biology', 'Mitosis, meiosis and cellular reproduction', 'cell division notes'],
  ['HIST 100', 'European History', 'Renaissance art and humanism', 'renaissance art notes'],
  ['ACCT 100', 'Financial Accounting', 'Balance sheets, assets and liabilities', 'balance sheet notes'],
  ['MUS 100', 'Music Theory', 'Melody, harmony and musical composition', 'melody notes'],
  ['CS 100', 'Algorithms', 'Time complexity, asymptotic analysis and sorting algorithms', 'algorithm complexity notes'],
  ['PHYS 100', 'Physics', 'Newtonian mechanics, force and motion', 'newton laws notes']
];
const encoder = await createOutlineEncoder();
try {
  const indexed = [];
  for (const [course, title, topics] of cases) {
    const outline = normalizeOutline({ course, title, term: 'Fall 2026', topics: [topics] });
    for (const chunk of await createOutlineChunks(outline, { countTokens: encoder.countTokens })) {
      assert.ok(chunk.tokens <= 256);
      indexed.push({ chunk, vector: await encoder.embed(chunk.text) });
    }
  }
  const checks = [];
  for (const [course, title, topics, query] of cases) {
    const vector = await encoder.embed(semanticQueryText(query));
    const ranked = indexed.map((entry) => ({ course: entry.chunk.course, score: cosineSimilarity(vector, entry.vector) }))
      .sort((a, b) => b.score - a.score);
    assert.equal(ranked[0].course, course, `${query} must favor ${course}.`);
    assert.ok(ranked[0].score >= .4, `${query} must pass the prototype retrieval cutoff.`);
    checks.push({ query, course, score: Number(ranked[0].score.toFixed(4)) });
  }
  const outline = normalizeOutline({ course: 'TEST 100', title: 'Long passage', topics: [`${Array(700).fill('finite sequences').join(' ')} Final distinctive topic.`] });
  const chunks = await createOutlineChunks(outline, { countTokens: encoder.countTokens });
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.tokens <= 256));
  assert.ok(chunks.at(-1).text.includes('Final distinctive topic.'));
  console.log(JSON.stringify({ provenance: 'Synthetic cross-field outline examples', dimensions: encoder.signature.dimensions,
    cases: checks, longPassageChunks: chunks.length, tokenLimit: 'passed' }, null, 2));
} finally { await encoder.close(); }
