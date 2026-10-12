import { pipeline, env } from '@huggingface/transformers';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { MODEL_ID, MODEL_KEY, MODEL_REVISION, MODEL_FILES, EMBEDDING_DIMENSIONS } from '../src/search/semantic/config.js';
import { validVector } from '../src/search/semantic/model.js';
import { OUTLINE_ENCODING_VERSION } from '../src/search/outlines/chunks.js';
import { decodeOutlineVectors } from '../src/search/outlines/vectors.js';

export const root = resolve(import.meta.dirname, '..');
export const hash = (value) => createHash('sha256').update(value).digest('hex');

export async function createOutlineEncoder() {
  const assetRoot = resolve(root, 'semantic-assets');
  let saved;
  try { saved = JSON.parse(await readFile(resolve(assetRoot, 'manifest.json'), 'utf8')); }
  catch { throw new Error('Local model files are missing. Run npm run setup:semantic first.'); }
  if (saved.model !== MODEL_ID || saved.revision !== MODEL_REVISION) throw new Error('Local model revision does not match the extension. Run npm run setup:semantic.');
  for (const name of MODEL_FILES) {
    const bytes = await readFile(resolve(assetRoot, MODEL_ID, name));
    if (!saved.files[name] || hash(bytes) !== saved.files[name].sha256) throw new Error(`Local model file failed verification: ${name}. Run npm run setup:semantic.`);
  }
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = `${assetRoot}/`;
  const model = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', device: 'cpu', local_files_only: true,
    session_options: { intra_op_num_threads: 1, inter_op_num_threads: 1 } });
  return {
    signature: { model: MODEL_ID, modelKey: MODEL_KEY, revision: MODEL_REVISION, dimensions: EMBEDDING_DIMENSIONS,
      dtype: 'q8', pooling: 'mean', normalize: true, encodingVersion: OUTLINE_ENCODING_VERSION,
      assetHash: hash(JSON.stringify(MODEL_FILES.map((name) => [name, saved.files[name].sha256]))) },
    countTokens: async (text) => (await model.tokenizer(text, { truncation: false })).input_ids.dims[1],
    embed: async (text) => {
      const result = await model(text, { pooling: 'mean', normalize: true });
      if (!validVector(result.data, EMBEDDING_DIMENSIONS)) throw new Error('The outline model returned an invalid vector.');
      return new Float32Array(result.data);
    },
    close: () => model.dispose()
  };
}

export async function readOutlineBundle(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.encoder?.modelKey !== MODEL_KEY || manifest.encoder?.encodingVersion !== OUTLINE_ENCODING_VERSION
    || manifest.encoder?.dimensions !== EMBEDDING_DIMENSIONS || !Array.isArray(manifest.chunks) || !Array.isArray(manifest.vectorHashes)
    || typeof manifest.vectorFile !== 'string' || basename(manifest.vectorFile) !== manifest.vectorFile) throw new Error('Unsupported outline bundle manifest.');
  const bytes = await readFile(resolve(directory, manifest.vectorFile));
  if (hash(bytes) !== manifest.vectorFileHash) throw new Error('Outline vectors failed their checksum.');
  const vectors = decodeOutlineVectors(bytes, manifest.encoder.dimensions, manifest.vectorHashes.length);
  if (manifest.chunks.some((chunk) => !Number.isInteger(chunk.vectorIndex) || chunk.vectorIndex < 0 || chunk.vectorIndex >= vectors.length)) {
    throw new Error('Outline chunks reference missing vectors.');
  }
  return { manifest, vectors };
}

export async function atomicJson(path, value) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}
