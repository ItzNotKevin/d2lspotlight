import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('ocr-manifest.json', dist), 'utf8'));
assert.equal(manifest.available, false, 'Lite builds must report OCR unavailable');
assert.ok(!(await readdir(dist)).includes('ocr-models'), 'Lite builds must not retain models from an earlier full build');
for (const name of ['background.js', 'spotlight.js', 'shortcut.js', 'standalone.js', 'pdf.worker.mjs', 'semantic-worker.js']) {
  await access(new URL(name, dist));
}
console.log('Lite build verified: core extension assets present, handwriting models excluded.');
