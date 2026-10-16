import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ensureOcrAssets } from '../scripts/ocr-assets.mjs';
import { OCR_MODELS, OCR_VERSION } from '../src/search/ocr/config.js';

const name = `${OCR_MODELS[0].id}/config.json`;
const bytes = Buffer.from('{"fixture":true}');
const lock = { version: OCR_VERSION, models: OCR_MODELS, files: { [name]: {
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')
} } };
async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'spotlight-ocr-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('a fresh checkout downloads pinned assets and subsequent offline builds reuse verified files', async t => {
  const root = await sandbox(t), requests = [];
  const manifest = await ensureOcrAssets({ root, lock, log: () => {}, fetchImpl: async url => {
    requests.push(url); return new Response(bytes);
  } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0], `https://huggingface.co/${OCR_MODELS[0].id}/resolve/${OCR_MODELS[0].revision}/config.json`);
  assert.equal(await readFile(join(root, 'ocr-assets/models', name), 'utf8'), bytes.toString());
  assert.equal(manifest.files[name], lock.files[name].sha256);
  await ensureOcrAssets({ root, lock, log: () => {}, fetchImpl: () => { throw new Error('Network must not be used'); } });
});

test('missing or corrupt assets are repaired from a verified local model cache without network access', async t => {
  const root = await sandbox(t), model = OCR_MODELS[0];
  const cache = join(root, 'benchmark-assets/ocr', model.id, model.revision, 'config.json');
  const target = join(root, 'ocr-assets/models', name);
  await mkdir(dirname(cache), { recursive: true }); await writeFile(cache, bytes);
  await ensureOcrAssets({ root, lock, log: () => {}, fetchImpl: () => { throw new Error('No network'); } });
  await writeFile(target, 'damaged');
  await ensureOcrAssets({ root, lock, log: () => {}, fetchImpl: () => { throw new Error('No network'); } });
  assert.equal(await readFile(target, 'utf8'), bytes.toString());
});

test('failed or corrupt downloads do not publish partial assets or replace existing files', async t => {
  const root = await sandbox(t), target = join(root, 'ocr-assets/models', name);
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, 'old copy');
  for (const response of [new Response('denied', { status: 503 }), new Response('x'.repeat(bytes.length)), new Response('x'.repeat(bytes.length + 1))]) {
    await assert.rejects(ensureOcrAssets({ root, lock, log: () => {}, fetchImpl: async () => response }), /download failed|integrity check|locked size/i);
    assert.equal(await readFile(target, 'utf8'), 'old copy');
    assert.deepEqual(await readdir(dirname(target)), ['config.json']);
  }
  await assert.rejects(readFile(join(root, 'ocr-assets/manifest.json')), { code: 'ENOENT' });
});

test('stale model locks and unsafe paths are rejected before downloading', async t => {
  const root = await sandbox(t);
  await assert.rejects(ensureOcrAssets({ root, lock: { ...lock, version: 'outdated' } }), /does not match/);
  await assert.rejects(ensureOcrAssets({ root, lock: { ...lock, files: { [`${OCR_MODELS[0].id}/../outside`]: lock.files[name] } } }), /Invalid locked/);
});
