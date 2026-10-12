import { build } from 'vite';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { MODEL_ID, MODEL_REVISION, MODEL_FILES } from '../src/search/semantic/config.js';

const root = resolve(import.meta.dirname, '..');
await build({ root });
await build({ root, configFile: false,
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm', 'module', 'browser', 'production'] },
  build: {
  outDir: 'dist', emptyOutDir: false, target: 'es2022',
  rollupOptions: {
    input: {
      'semantic-worker': resolve(root, 'src/search/semantic/worker.js'),
      'semantic-offscreen': resolve(root, 'src/search/semantic/offscreen.js')
    },
    output: { entryFileNames: '[name].js', chunkFileNames: 'semantic-[name]-[hash].js' }
  }
} });

await mkdir(resolve(root, 'dist/wasm'), { recursive: true });
for (const name of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  await cp(resolve(root, 'node_modules/onnxruntime-web/dist', name), resolve(root, 'dist/wasm', name));
}
let manifest;
try { manifest = JSON.parse(await readFile(resolve(root, 'semantic-assets/manifest.json'), 'utf8')); } catch {}
if (!manifest) {
  console.log('Keyword search built. Run npm run setup:semantic and rebuild to enable meaning search.');
} else {
  if (manifest.model !== MODEL_ID || manifest.revision !== MODEL_REVISION) throw new Error('Model revision changed. Run npm run setup:semantic.');
  for (const name of MODEL_FILES) {
    const source = resolve(root, 'semantic-assets', MODEL_ID, name);
    const bytes = await readFile(source);
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.files?.[name]?.sha256) throw new Error(`Model file changed: ${name}. Run npm run setup:semantic.`);
  }
  await cp(resolve(root, 'semantic-assets', MODEL_ID), resolve(root, 'dist/models', MODEL_ID), { recursive: true });
  await cp(resolve(root, 'semantic-assets/manifest.json'), resolve(root, 'dist/model-manifest.json'));
}
