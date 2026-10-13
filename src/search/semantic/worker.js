import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID, MAX_RESOURCES, MIN_SIMILARITY } from './config.js';
import { openEmbeddingCache } from './cache.js';
import { cacheKey, cosineSimilarity, embeddingFor } from './model.js';
import { courseEmbeddingResource, courseText } from '../course.js';
import { courseQueryText, semanticQueryText, semanticNaturalQuery } from '../rank.js';
import { normalizedCourseScore } from '../intent.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useWasmCache = false;
env.localModelPath = new URL('./models/', self.location.href).href;
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('./wasm/ort-wasm-simd-threaded.asyncify.mjs', self.location.href).href,
  wasm: new URL('./wasm/ort-wasm-simd-threaded.asyncify.wasm', self.location.href).href
};
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

import { loadCatalogBundle } from '../catalog/live.js';
import { loadOutlineBundle, courseEvidenceScore, resourceWeekEvidence } from '../outlines/live.js';
let catalog;
let outlines;
let extractor;
let cache;
let queue = Promise.resolve();
const latest = new Map();
const queryVectors = new Map();
let indexedFingerprint;
let indexedVectors = [];

async function embed(text) {
  if (!extractor) {
    extractor = pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', device: 'wasm', local_files_only: true });
    extractor.catch(() => { extractor = null; });
  }
  const output = await (await extractor)(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

async function queryEmbedding(text) {
  let vector = queryVectors.get(text);
  if (!vector) {
    vector = await embed(text);
    queryVectors.set(text, vector);
    if (queryVectors.size > 32) queryVectors.delete(queryVectors.keys().next().value);
  }
  return vector;
}

async function search(message) {
  const current = () => latest.get(message.client) === message.id;
  if (!current()) throw new Error('Search superseded.');
  cache ||= await openEmbeddingCache();
  const corpus = message.resources.slice(0, MAX_RESOURCES);
  const allowed = new Set(message.allowedIds);
  if (indexedFingerprint !== message.fingerprint) {
    await cache.prune(new Set(corpus.flatMap((resource) => [cacheKey(resource), cacheKey(resource, 'title'),
      ...(courseText(resource) ? [cacheKey(courseEmbeddingResource(resource), 'course')] : [])])));
    const vectors = [];
    const courses = new Map();
    let completed = 0;
    for (const resource of corpus) {
      if (!current()) throw new Error('Search superseded.');
      const vector = await embeddingFor(resource, { cache, embed });
      const titleVector = await embeddingFor(resource, { cache, embed, view: 'title' });
      let courseVector = null;
      if (courseText(resource)) {
        const course = courseEmbeddingResource(resource);
        const key = cacheKey(course, 'course');
        courseVector = courses.get(key);
        if (!courseVector) {
          courseVector = await embeddingFor(course, { cache, embed, view: 'course' });
          courses.set(key, courseVector);
        }
      }
      vectors.push({ id: resource.id, vector, titleVector, courseVector });
      completed++;
      if (completed % 8 === 0) {
        self.postMessage({ id: message.id, progress: `${completed} of ${corpus.length} resources ready` });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (!current()) throw new Error('Search superseded.');
    indexedVectors = vectors;
    indexedFingerprint = message.fingerprint;
  }
  const candidates = indexedVectors.filter((resource) => allowed.has(resource.id));
  if (!current()) throw new Error('Search superseded.');
  const queryText = semanticQueryText(message.query);
  const queryVector = await queryEmbedding(queryText);
  const naturalText = semanticNaturalQuery(message.query);
  const naturalVector = naturalText && naturalText !== queryText ? await queryEmbedding(naturalText) : queryVector;
  catalog ||= loadCatalogBundle(fetch, path => new URL('/' + path, self.location.href).href).catch(() => null);
  outlines ||= loadOutlineBundle(fetch, path => new URL('/' + path, self.location.href).href).catch(() => null);
  const courseCatalog = await catalog;
  const courseOutlines = await outlines;
  const resourceById = new Map(corpus.map(resource => [resource.id, resource]));
  const courseQuery = courseQueryText(message.query);
  const courseQueryVector = courseQuery ? await queryEmbedding(courseQuery) : null;
  if (!current()) throw new Error('Search superseded.');
  const courseBoost = (match) => .18 * normalizedCourseScore(match.courseScore);
  const evidenceScores = new Map();
  const evidenceScore = resource => {
    const key = JSON.stringify([resource.source, Boolean(resource.sourceCourseId), resource.outlineCourseCode,
      resource.outlineCourseName, resource.course, resource.courseName]);
    if (!evidenceScores.has(key)) evidenceScores.set(key, courseEvidenceScore(resource, [queryVector, naturalVector], courseOutlines, courseCatalog));
    return evidenceScores.get(key);
  };
  const matches = candidates.map(({ id, vector, titleVector, courseVector }) => {
    const resource = resourceById.get(id);
    const titleScore = Math.max(cosineSimilarity(queryVector, vector), cosineSimilarity(queryVector, titleVector), cosineSimilarity(naturalVector, vector), cosineSimilarity(naturalVector, titleVector));
    const week = resourceWeekEvidence(resource, [queryVector, naturalVector], courseOutlines);
    return { id, score: Math.max(titleScore, week?.score || 0),
      outlineWeek: week && week.score > titleScore ? { week: week.week, sourceUrl: week.sourceUrl } : undefined,
      courseScore: Math.max(courseQueryVector && courseVector ? cosineSimilarity(courseQueryVector, courseVector) : 0, evidenceScore(resource)) };
  })
    .filter((match) => match.score >= MIN_SIMILARITY).sort((a, b) => b.score + courseBoost(b) - a.score - courseBoost(a)).slice(0, 100);
  return { matches, indexed: corpus.length, total: message.resources.length, catalogCourses: Object.keys(courseCatalog?.courses || {}).length,
    outlineCourses: Object.keys(courseOutlines?.courses || {}).length };
}

self.onmessage = ({ data }) => {
  if (data.action === 'cancel') {
    if (latest.get(data.client) === data.id) latest.delete(data.client);
    return;
  }
  latest.set(data.client, data.id);
  const task = queue.then(() => search(data));
  queue = task.catch(() => {});
  task.then(
    (result) => self.postMessage({ id: data.id, ok: true, ...result }),
    (error) => self.postMessage({ id: data.id, ok: false, error: error.message === 'Search superseded.'
      ? error.message : 'Meaning search unavailable. Check the local model setup; keyword search still works.' })
  );
};
