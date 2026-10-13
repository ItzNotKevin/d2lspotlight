import { MODEL_ID, MODEL_REVISION, EMBEDDING_DIMENSIONS } from '../semantic/config.js';
import { cosineSimilarity } from '../semantic/model.js';
import { extractCourseCode } from '../courseCode.js';

export function compatibleCatalogEncoder(encoder, encodingVersion = 'catalog-v1') {
  return encoder?.model === MODEL_ID && encoder.revision === MODEL_REVISION
    && encoder.dimensions === EMBEDDING_DIMENSIONS && encoder.dtype === 'q8'
    && encoder.pooling === 'mean' && encoder.normalize === true && encoder.encodingVersion === encodingVersion;
}

// Only attach Waterloo catalog evidence to LEARN or a Piazza class linked to LEARN.
export function catalogResourceCode(resource) {
  if (resource.source !== 'LEARN' && !resource.sourceCourseId) return '';
  return extractCourseCode(resource.outlineCourseCode || resource.course).replace(/ /g, '');
}

export function catalogCourseScore(resource, queryVectors, bundle) {
  const code = catalogResourceCode(resource);
  const entry = bundle?.courses[code];
  if (!entry) return 0;
  let score = 0;
  for (const index of entry.vectorIndices) for (const query of queryVectors) {
    score = Math.max(score, cosineSimilarity(query, bundle.vectors[index]));
  }
  return score;
}

export async function loadCatalogBundle(fetchAsset = fetch, url = path => chrome.runtime.getURL(path), encodingVersion = 'catalog-v1') {
  const response = await fetchAsset(url('dist/catalog/manifest.json'));
  if (response.status === 404) return null; // Optional artifact: metadata search remains usable.
  if (!response.ok) throw new Error('Catalog metadata unavailable.');
  const manifest = await response.json();
  if (manifest.version !== 1 || !compatibleCatalogEncoder(manifest.encoder, encodingVersion)
    || !Number.isInteger(manifest.vectorCount) || manifest.vectorCount < 1 || manifest.vectorCount > 50000
    || !manifest.courses || typeof manifest.courses !== 'object'
    || !/^[a-f0-9]{64}$/.test(manifest.vectorFileHash || '')) throw new Error('Invalid catalog metadata.');
  const binary = await fetchAsset(url('dist/catalog/vectors.f32'));
  if (!binary.ok) throw new Error('Catalog vectors unavailable.');
  const bytes = await binary.arrayBuffer();
  if (bytes.byteLength !== manifest.vectorCount * EMBEDDING_DIMENSIONS * 4) throw new Error('Catalog vector size mismatch.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.vectorFileHash) throw new Error('Catalog checksum mismatch.');
  const view = new DataView(bytes);
  const vectors = Array.from({ length: manifest.vectorCount }, (_, i) => {
    const vector = Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => view.getFloat32((i * EMBEDDING_DIMENSIONS + j) * 4, true));
    if (!vector.every(Number.isFinite) || !vector.some(value => value !== 0)) throw new Error('Invalid catalog vector.');
    return vector;
  });
  for (const [code, entry] of Object.entries(manifest.courses)) {
    if (!/^[A-Z]{2,8}\d{1,4}[A-Z]{0,3}$/.test(code) || !Array.isArray(entry.vectorIndices)
      || !entry.vectorIndices.length || entry.vectorIndices.some(index => !Number.isInteger(index) || index < 0 || index >= vectors.length)) throw new Error('Invalid catalog course reference.');
  }
  return { courses: manifest.courses, vectors };
}
