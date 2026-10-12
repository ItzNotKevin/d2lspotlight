import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { models } from '../benchmarks/models.js';
import { MODEL_FILES } from '../src/search/semantic/config.js';

const root = resolve(import.meta.dirname, '..');
for (const model of models) {
  const target = resolve(root, model.assetRoot, model.id);
  const manifestPath = resolve(root, model.assetRoot, `${model.key}-manifest.json`);
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
  if (model.key === 'minilm') {
    try { manifest = JSON.parse(await readFile(resolve(root, 'semantic-assets/manifest.json'), 'utf8')); } catch {}
  }
  const files = {};
  await Promise.all(MODEL_FILES.map(async (name) => {
    const path = resolve(target, name);
    const recorded = manifest?.revision === model.revision ? manifest.files?.[name] : null;
    if (recorded) {
      try {
        const bytes = await readFile(path);
        if (createHash('sha256').update(bytes).digest('hex') === recorded.sha256) { files[name] = recorded; return; }
      } catch {}
    }
    console.log(`${model.name}: downloading ${name}`);
    const response = await fetch(`https://huggingface.co/${model.id}/resolve/${model.revision}/${name}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${model.id}/${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`Empty model file: ${name}`);
    if (name.endsWith('.json')) JSON.parse(bytes.toString());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, bytes);
    await rename(`${path}.tmp`, path);
    files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  await writeFile(manifestPath, JSON.stringify({ model: model.id, revision: model.revision, files }, null, 2));
  const bytes = Object.values(files).reduce((total, file) => total + file.bytes, 0);
  console.log(`${model.name}: ready (${(bytes / 1048576).toFixed(1)} MiB)`);
}
