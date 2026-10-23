import assert from 'node:assert/strict';
import { pipeline, env } from '@huggingface/transformers';
import { resolve } from 'node:path';
import { MODEL_ID, EMBEDDING_DIMENSIONS, MIN_SIMILARITY } from '../src/search/semantic/config.js';
import { resourceText, cosineSimilarity } from '../src/search/semantic/model.js';
import { courseQueryText, semanticQueryText } from '../src/search/rank.js';
import { normalizedCourseScore } from '../src/search/intent.js';
import { hybridSearch, semanticConstraintsMatch } from '../src/search/hybrid.js';
import { semanticNaturalQuery } from '../src/search/rank.js';
import { benchmark } from '../benchmarks/academic.js';
import { rankedRows, summarize } from '../benchmarks/evaluate.js';

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

// Evaluate the shipped model and hybrid constraints together, using ordinary
// descriptions rather than course-specific synonyms or fabricated similarity scores.
const intentResources = [
  { id: 'cs-outline', title: 'Course outline', course: 'CS246' },
  { id: 'math-outline', title: 'Course outline', course: 'MATH246' },
  { id: 'other-outline', title: 'Course outline', course: 'CS245' },
  { id: 'notes', title: 'Course Notes', course: 'CS246', description: 'A comprehensive reference covering the entire course. Chapters, explanations, worked examples and exercises for independent study.' },
  { id: 'lecture', title: 'Week 3 lecture notes', course: 'CS246', description: 'Slides and annotations from Tuesday’s class.' },
  { id: 'exact', title: 'Textbook', course: 'MATH246' },
  { id: 'chemistry', title: 'Laboratory safety', course: 'CHEM120', description: 'Protective equipment and chemical disposal procedures.' }
].map(item => ({ ...item, type: 'PDF', source: 'LEARN', path: '', courseId: item.course }));
const intentVectors = [];
for (const resource of intentResources) {
  const views = [];
  for (const view of ['context', 'title']) views.push((await extractor(resourceText(resource, view), { pooling: 'mean', normalize: true })).tolist()[0]);
  intentVectors.push(views);
}
const intentChecks = [];
for (const [query, expected, excluded] of [
  ['246 outline', ['cs-outline', 'math-outline'], ['other-outline', 'chemistry']],
  ['cs246 outline', ['cs-outline'], ['math-outline', 'other-outline']],
  ['textbook', ['notes', 'exact'], ['chemistry']],
  ['cs246 textbook', ['notes'], ['exact', 'other-outline', 'chemistry']],
  ['246 textbook', ['notes', 'exact'], ['other-outline', 'chemistry']],
  ['submarine engine repair', [], intentResources.map(item => item.id)]
]) {
  const queryVector = (await extractor(semanticQueryText(query), { pooling: 'mean', normalize: true })).tolist()[0];
  const matches = intentResources.map((resource, index) => ({ id: resource.id,
    score: Math.max(...intentVectors[index].map(vector => cosineSimilarity(queryVector, vector))) }));
  const results = hybridSearch(intentResources, { query }, matches).map(item => item.id);
  for (const id of expected) assert.ok(results.includes(id), `${query}: missing ${id}`);
  for (const id of excluded) assert.ok(!results.includes(id), `${query}: unexpected ${id}`);
  if (query === 'textbook') assert.equal(results[0], 'exact', 'Literal textbook title must retain priority.');
  intentChecks.push({ query, results, scores: matches.filter(match => results.includes(match.id)) });
}
console.log(JSON.stringify({ intentChecks }, null, 2));
// Check a stricter cutoff against the existing 80-query benchmark instead of
// tuning production globally to one successful textbook example.
const encode = async text => (await extractor(text, { pooling: 'mean', normalize: true })).tolist()[0];
const benchmarkVectors = [];
for (const resource of benchmark.resources) benchmarkVectors.push({ resource,
  context: await encode(resourceText(resource)), title: await encode(resourceText(resource, 'title')) });
const benchmarkRows = [];
for (const query of benchmark.queries) {
  const vector = await encode(semanticQueryText(query.text));
  const natural = await encode(semanticNaturalQuery(query.text) || semanticQueryText(query.text));
  benchmarkRows.push({ ...query, scores: benchmarkVectors.filter(item => semanticConstraintsMatch(item.resource, query.text)).map(item => ({
    id: item.resource.id, score: Math.max(cosineSimilarity(vector, item.context), cosineSimilarity(vector, item.title),
      cosineSimilarity(natural, item.context), cosineSimilarity(natural, item.title))
  })) });
}
console.log(JSON.stringify({ benchmarkQueries: benchmarkRows.length,
  thresholdComparison: [...new Set([MIN_SIMILARITY, .45])].map(threshold => ({ threshold,
    calibration: summarize(rankedRows(benchmark.resources, benchmarkRows.filter(row => row.split === 'calibration'), threshold)),
    test: summarize(rankedRows(benchmark.resources, benchmarkRows.filter(row => row.split === 'test'), threshold))
  })) }, null, 2));
await extractor.dispose();
