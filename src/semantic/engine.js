import { env, pipeline } from '@huggingface/transformers';
import { cosine } from './retrieval.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useWasmCache = false; // Load bundled factories directly; MV3 disallows blob scripts.
env.localModelPath = chrome.runtime.getURL('models/');
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL('dist/semantic/wasm/ort-wasm-simd-threaded.asyncify.mjs'),
  wasm: chrome.runtime.getURL('dist/semantic/wasm/ort-wasm-simd-threaded.asyncify.wasm'),
};
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let model;
let scope = '';
const vectors = new Map();
let queue = Promise.resolve();
let generation = 0;

async function embed(text) {
  model ||= pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', device: 'wasm', local_files_only: true });
  const extractor = await model;
  return Array.from((await extractor(text, { pooling: 'mean', normalize: true })).data);
}

async function search(message, ticket) {
  if (scope !== message.scope) { vectors.clear(); scope = message.scope; }
  // Filter changes should not discard embeddings of still-indexed documents.
  // Cap the account-scoped in-memory cache rather than persisting course text.
  while (vectors.size > 10000) vectors.delete(vectors.keys().next().value);
  const hits = [];
  for (const doc of message.documents) {
    if (ticket !== generation) return { ok: true, hits: [], cancelled: true };
    let entry = vectors.get(doc.id);
    if (!entry || entry.text !== doc.text) {
      entry = { text: doc.text, vector: await embed(doc.text) };
      if (ticket !== generation) return { ok: true, hits: [], cancelled: true };
      vectors.set(doc.id, entry);
    }
  }
  const query = await embed(message.query);
  if (ticket !== generation) return { ok: true, hits: [], cancelled: true };
  for (const doc of message.documents) hits.push({ id: doc.id, score: cosine(query, vectors.get(doc.id).vector) });
  return { ok: true, hits: hits.sort((a, b) => b.score - a.score).slice(0, 20) };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'semantic-engine' || sender.id !== chrome.runtime.id || sender.tab) return;
  const ticket = ++generation;
  const task = queue.then(() => search(message, ticket));
  queue = task.catch(() => { model = undefined; });
  task.then(reply, () => reply({ ok: false, error: 'Local model unavailable. Run npm run setup:semantic, reload the extension, and retry. Keyword search remains available.' }));
  return true;
});
