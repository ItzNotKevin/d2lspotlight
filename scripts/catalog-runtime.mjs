import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createOutlineEncoder, hash } from './outline-runtime.mjs';
import { decodeOutlineVectors } from '../src/search/outlines/vectors.js';
import { CATALOG_ENCODING_VERSION } from '../src/search/catalog/academic.js';
import { compatibleCatalogEncoder } from '../src/search/catalog/live.js';
import { MODEL_KEY, EMBEDDING_DIMENSIONS } from '../src/search/semantic/config.js';

export async function createCatalogEncoder() {
  const encoder = await createOutlineEncoder();
  encoder.signature = { ...encoder.signature, encodingVersion: CATALOG_ENCODING_VERSION };
  return encoder;
}

export async function readCatalogBundle(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.kind !== 'course-catalog' || (manifest.encoder?.modelKey !== MODEL_KEY && !compatibleCatalogEncoder(manifest.encoder))
    || manifest.encoder?.encodingVersion !== CATALOG_ENCODING_VERSION || manifest.encoder?.dimensions !== EMBEDDING_DIMENSIONS
    || !Array.isArray(manifest.chunks) || !Array.isArray(manifest.vectorHashes) || !Array.isArray(manifest.courses)
    || typeof manifest.vectorFile !== 'string' || basename(manifest.vectorFile) !== manifest.vectorFile) throw new Error('Unsupported catalog bundle manifest.');
  const bytes = await readFile(resolve(directory, manifest.vectorFile));
  if (hash(bytes) !== manifest.vectorFileHash) throw new Error('Catalog vectors failed their checksum.');
  const vectors = decodeOutlineVectors(bytes, manifest.encoder.dimensions, manifest.vectorHashes.length);
  const keys = new Set(manifest.courses.map((course) => course.key));
  const covered = new Set(manifest.chunks.map((chunk) => chunk.courseKey));
  if (keys.size !== manifest.courses.length || keys.size !== covered.size || [...covered].some((key) => !keys.has(key))
    || manifest.chunks.some((chunk) => !Number.isInteger(chunk.vectorIndex) || chunk.vectorIndex < 0 || chunk.vectorIndex >= vectors.length)) {
    throw new Error('Catalog chunks do not cover the saved course inventory or reference missing vectors.');
  }
  return { manifest, vectors };
}
