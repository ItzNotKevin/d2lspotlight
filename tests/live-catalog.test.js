import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadCatalogBundle, compatibleCatalogEncoder, catalogCourseScore } from '../src/search/catalog/live.js';
import { MODEL_ID, MODEL_REVISION, EMBEDDING_DIMENSIONS } from '../src/search/semantic/config.js';

const encoder = { model: MODEL_ID, revision: MODEL_REVISION, dimensions: EMBEDDING_DIMENSIONS, dtype: 'q8', pooling: 'mean', normalize: true, encodingVersion: 'catalog-v1', modelKey: 'old metadata policy' };
const bytes = new Uint8Array(EMBEDDING_DIMENSIONS * 4);
new DataView(bytes.buffer).setFloat32(0, 1, true);
const manifest = { version: 1, encoder, vectorCount: 1, vectorFileHash: createHash('sha256').update(bytes).digest('hex'),
  courses: { ZTEST100: { title: 'Synthetic course', vectorIndices: [0] } } };
const fetchFor = (metadata, data = bytes) => async path => path.endsWith('manifest.json')
  ? { ok: true, json: async () => metadata } : { ok: true, arrayBuffer: async () => data.buffer };

test('catalog loader verifies binary checksum and vector references without depending on metadata cache version', async () => {
  assert.equal(compatibleCatalogEncoder(encoder), true);
  assert.equal(compatibleCatalogEncoder({ ...encoder, revision: 'different' }), false);
  const bundle = await loadCatalogBundle(fetchFor(manifest), path => path);
  assert.equal(bundle.vectors.length, 1);
  await assert.rejects(loadCatalogBundle(fetchFor({ ...manifest, vectorFileHash: '0'.repeat(64) }), path => path), /checksum/);
  await assert.rejects(loadCatalogBundle(fetchFor({ ...manifest, courses: { ZTEST100: { vectorIndices: [2] } } }), path => path), /reference/);
  await assert.rejects(loadCatalogBundle(fetchFor({ ...manifest, encoder: { ...encoder, dimensions: 2 } }), path => path), /metadata/);
  assert.equal(await loadCatalogBundle(async () => ({ status: 404 }), path => path), null);
});

test('catalog relevance only attaches to known indexed Waterloo course identities', () => {
  const bundle = { courses: manifest.courses, vectors: [[1, 0]] };
  const resource = { course: 'ZTEST_100_F26', source: 'LEARN' };
  assert.equal(catalogCourseScore(resource, [[1, 0]], bundle), 1);
  assert.equal(catalogCourseScore({ ...resource, course: 'ZTEST200' }, [[1, 0]], bundle), 0);
  assert.equal(catalogCourseScore({ ...resource, source: 'Piazza' }, [[1, 0]], bundle), 0);
  assert.equal(catalogCourseScore({ ...resource, source: 'Piazza', sourceCourseId: 'piazza:linked' }, [[1, 0]], bundle), 1);
});
