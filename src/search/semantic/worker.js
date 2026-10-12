import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID, MAX_RESOURCES, MIN_SIMILARITY } from './config.js';
import { openEmbeddingCache } from './cache.js';
import { cacheKey, cosineSimilarity, embeddingFor } from './model.js';

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

async function search(message) {
  const current = () => latest.get(message.client) === message.id;
  if (!current()) throw new Error('Search superseded.');
  cache ||= await openEmbeddingCache();
  const corpus = message.resources.slice(0, MAX_RESOURCES);
  const allowed = new Set(message.allowedIds);
  if (indexedFingerprint !== message.fingerprint) {
    await cache.prune(new Set(corpus.flatMap((resource) => [cacheKey(resource), cacheKey(resource, 'title')])));
    const vectors = [];
    let completed = 0;
    for (const resource of corpus) {
      if (!current()) throw new Error('Search superseded.');
      const vector = await embeddingFor(resource, { cache, embed });
      const titleVector = await embeddingFor(resource, { cache, embed, view: 'title' });
      vectors.push({ id: resource.id, vector, titleVector });
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
  let queryVector = queryVectors.get(message.query);
  if (!queryVector) {
    queryVector = await embed(message.query);
    queryVectors.set(message.query, queryVector);
    if (queryVectors.size > 32) queryVectors.delete(queryVectors.keys().next().value);
  }
  if (!current()) throw new Error('Search superseded.');
  const matches = candidates.map(({ id, vector, titleVector }) => ({ id,
    score: Math.max(cosineSimilarity(queryVector, vector), cosineSimilarity(queryVector, titleVector)) }))
    .filter((match) => match.score >= MIN_SIMILARITY).sort((a, b) => b.score - a.score).slice(0, 100);
  return { matches, indexed: corpus.length, total: message.resources.length };
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
