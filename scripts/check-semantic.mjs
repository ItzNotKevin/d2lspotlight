import assert from 'node:assert/strict';
import { pipeline, env } from '@huggingface/transformers';
import { resolve } from 'node:path';
import { MODEL_ID, EMBEDDING_DIMENSIONS, MIN_SIMILARITY } from '../src/search/semantic/config.js';
import { resourceText, cosineSimilarity } from '../src/search/semantic/model.js';

env.allowRemoteModels = false;
env.localModelPath = `${resolve(import.meta.dirname, '../semantic-assets')}/`;
const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', device: 'cpu', local_files_only: true });
const resources = [
  { title: 'Enumeration', course: 'MATH239_instructor_term_section_1269', path: 'Course Notes', type: 'PDF' },
  { title: 'Organic chemistry lab manual', course: 'Chemistry', path: 'Laboratory safety', type: 'PDF' }
];
const inputs = ['combinatorics textbook', ...resources.map((resource) => resourceText(resource))];
const vectors = [];
for (const text of inputs) vectors.push((await extractor(text, { pooling: 'mean', normalize: true })).tolist()[0]);
assert.equal(vectors[0].length, EMBEDDING_DIMENSIONS);
const scores = vectors.slice(1).map((vector) => cosineSimilarity(vectors[0], vector));
assert.ok(scores[0] > scores[1], 'Enumeration notes should rank above chemistry for this query.');
assert.ok(scores[0] >= MIN_SIMILARITY, 'The sparse Enumeration resource must pass the actual retrieval threshold.');
console.log(JSON.stringify({ query: 'combinatorics textbook', results: resources.map((resource, i) => ({ title: resource.title, score: scores[i] })) }, null, 2));
await extractor.dispose();
