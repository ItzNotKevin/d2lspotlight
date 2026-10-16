import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, copyFile, rename, rm, writeFile, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { OCR_MODELS, OCR_VERSION } from '../src/search/ocr/config.js';

async function matches(path, expected) {
  try {
    if ((await stat(path)).size !== expected.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === expected.sha256;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function ensureOcrAssets({ root = resolve(import.meta.dirname, '..'), lock, fetchImpl = fetch, log = console.log } = {}) {
  lock ||= JSON.parse(await readFile(new URL('./ocr-assets.lock.json', import.meta.url), 'utf8'));
  if (lock.version !== OCR_VERSION || JSON.stringify(lock.models) !== JSON.stringify(OCR_MODELS) || !Object.keys(lock.files || {}).length) throw new Error('OCR asset lock does not match the configured models.');
  const manifest = { version: lock.version, models: lock.models, files: {} };
  let reused = 0, restored = 0, downloaded = 0;
  for (const [name, expected] of Object.entries(lock.files)) {
    const model = lock.models.find(model => name.startsWith(`${model.id}/`));
    if (!model || name.includes('..') || name.includes('\\') || !/^[\w./-]+$/.test(name)
      || !/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.bytes) || expected.bytes < 1) throw new Error('Invalid locked OCR asset.');
    manifest.files[name] = expected.sha256;
    const target = join(root, 'ocr-assets/models', name);
    if (await matches(target, expected)) { reused++; continue; }
    const relative = name.slice(model.id.length + 1);
    const cache = join(root, 'benchmark-assets/ocr', model.id, model.revision, relative);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      if (await matches(cache, expected)) {
        await copyFile(cache, temporary); restored++;
      } else {
        log(`Downloading OCR asset: ${name} (${(expected.bytes / 1048576).toFixed(1)} MiB)`);
        const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/${relative}`;
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(300000) });
        if (!response.ok || !response.body) throw new Error(`OCR download failed (HTTP ${response.status}) for ${name}.`);
        let bytes = 0;
        const hash = createHash('sha256');
        await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > expected.bytes) { callback(new Error(`OCR asset exceeds locked size: ${name}`)); return; }
          hash.update(chunk); callback(null, chunk);
        } }), createWriteStream(temporary, { flags: 'wx' }));
        if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new Error(`OCR asset integrity check failed: ${name}`);
        downloaded++;
      }
      // Publish a complete verified file atomically; interrupted downloads never
      // replace working files, and subsequent builds resume at the missing file.
      if (!await matches(temporary, expected)) throw new Error(`OCR asset integrity check failed: ${name}`);
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
  }
  await mkdir(join(root, 'ocr-assets'), { recursive: true });
  const manifestPath = join(root, 'ocr-assets/manifest.json');
  const temporaryManifest = `${manifestPath}.${randomUUID()}.tmp`;
  try { await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n'); await rename(temporaryManifest, manifestPath); }
  finally { await rm(temporaryManifest, { force: true }); }
  log(`OCR assets verified: ${reused} reused, ${restored} restored from cache, ${downloaded} downloaded.`);
  return manifest;
}
