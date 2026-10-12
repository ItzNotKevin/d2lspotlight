import assert from 'node:assert/strict';
import { pipeline, env } from '@huggingface/transformers';
import { resolve } from 'node:path';
import { MODEL_ID, EMBEDDING_DIMENSIONS, MIN_SIMILARITY } from '../src/search/semantic/config.js';
import { resourceText, cosineSimilarity } from '../src/search/semantic/model.js';
import { courseQueryText, semanticQueryText } from '../src/search/rank.js';
import { normalizedCourseScore } from '../src/search/intent.js';
import { hybridSearch } from '../src/search/hybrid.js';

env.allowRemoteModels = false;
env.localModelPath = `${resolve(import.meta.dirname, '../semantic-assets')}/`;
const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', device: 'cpu', local_files_only: true });
const resources = [
  { title: 'Enumeration', course: 'MATH239_instructor_term_section_1269', path: 'Course Notes', type: 'PDF' },
  { title: 'Organic chemistry lab manual', course: 'Chemistry', path: 'Laboratory safety', type: 'PDF' }
];
const inputs = [semanticQueryText('combinatorics textbook'), ...resources.flatMap((resource) => [resourceText(resource), resourceText(resource, 'title')])];
const vectors = [];
for (const text of inputs) vectors.push((await extractor(text, { pooling: 'mean', normalize: true })).tolist()[0]);
assert.equal(vectors[0].length, EMBEDDING_DIMENSIONS);
const scores = resources.map((resource, i) => Math.max(cosineSimilarity(vectors[0], vectors[1 + i * 2]), cosineSimilarity(vectors[0], vectors[2 + i * 2])));
assert.ok(scores[0] > scores[1], 'Enumeration notes should rank above chemistry for this query.');
assert.ok(scores[0] >= MIN_SIMILARITY, 'The sparse Enumeration resource must pass the actual retrieval threshold.');
console.log(JSON.stringify({ query: 'combinatorics textbook', results: resources.map((resource, i) => ({ title: resource.title, score: scores[i] })) }, null, 2));
const courseCases = [
  ['stats notes', ['Statistics and Probability', 'Organic Chemistry', 'History of Europe']],
  ['mitosis notes', ['Cell Biology', 'History of Europe', 'Financial Accounting']],
  ['renaissance notes', ['History of Europe', 'Cell Biology', 'Algorithms and Data Structures']],
  ['balance sheet notes', ['Financial Accounting', 'Music Theory', 'Cell Biology']],
  ['melody notes', ['Music Theory', 'Algorithms and Data Structures', 'Financial Accounting']],
  ['algorithm complexity notes', ['Algorithms and Data Structures', 'Cell Biology', 'History of Europe']]
];
const courseChecks = [];
for (const [query, courses] of courseCases) {
  const texts = [courseQueryText(query), ...courses];
  const embedded = [];
  for (const text of texts) embedded.push((await extractor(text, { pooling: 'mean', normalize: true })).tolist()[0]);
  const similarities = courses.map((course, index) => cosineSimilarity(embedded[0], embedded[index + 1]));
  assert.equal(similarities.indexOf(Math.max(...similarities)), 0, `${query} should favor ${courses[0]}.`);
  assert.ok(normalizedCourseScore(similarities[0]) > 0, `${query} must receive a course boost.`);
  const courseResources = courses.map((course, index) => ({ id: String(index), title: 'Chapter notes', course, courseId: String(index), path: '', type: 'PDF', source: 'Piazza' }));
  const ranked = hybridSearch(courseResources, { query }, courses.map((course, index) => ({ id: String(index), score: .7, courseScore: similarities[index] })));
  assert.equal(ranked[0]?.id, '0', `${query} must favor the relevant course when resource relevance is equal.`);
  courseChecks.push({ query, course: courses[0], score: similarities[0] });
}
console.log(JSON.stringify({ courseChecks }, null, 2));
await extractor.dispose();
