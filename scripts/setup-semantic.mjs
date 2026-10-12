import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { MODEL_ID, MODEL_REVISION, MODEL_FILES } from '../src/search/semantic/config.js';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'semantic-assets', MODEL_ID);
const manifestPath = resolve(root, 'semantic-assets', 'manifest.json');
let previous;
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
const files = {};

for (const name of MODEL_FILES) {
  const path = resolve(target, name);
  const recorded = previous?.revision === MODEL_REVISION ? previous.files?.[name] : null;
  if (recorded) {
    try {
      const bytes = await readFile(path);
      if (createHash('sha256').update(bytes).digest('hex') === recorded.sha256) {
        files[name] = recorded;
        console.log(`Cached ${name}`);
        continue;
      }
    } catch {}
  }
  console.log(`Downloading ${name}`);
  const url = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status} (${name})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`Empty model file: ${name}`);
  if (name.endsWith('.json')) JSON.parse(bytes.toString());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, bytes);
  await rename(`${path}.tmp`, path);
  files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

await writeFile(manifestPath, JSON.stringify({ model: MODEL_ID, revision: MODEL_REVISION, license: 'Apache-2.0', files }, null, 2));
console.log(`Local model ready (${(Object.values(files).reduce((total, file) => total + file.bytes, 0) / 1048576).toFixed(1)} MiB). Run npm run build.`);
