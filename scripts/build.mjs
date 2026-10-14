import { build } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { MODEL_ID, MODEL_REVISION, MODEL_FILES } from '../src/search/semantic/config.js';

import { readCatalogBundle } from './catalog-runtime.mjs';
import { readOutlineBundle } from './outline-runtime.mjs';

const root = resolve(import.meta.dirname, '..');
await build({ root });
await build({ root, configFile: false, build: { outDir: 'dist', emptyOutDir: false, target: 'es2022',
  lib: { entry: resolve(root, 'background.js'), formats: ['es'], fileName: () => 'background.js' } } });
const backgroundBundle = await readFile(resolve(root, 'dist/background.js'), 'utf8');
if (/\bfrom\s*['"][^'"]+\.json['"]/.test(backgroundBundle)) throw new Error('Background worker must bundle JSON dependencies for reliable Chrome startup.');
await build({ root, configFile: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { outDir: 'dist', emptyOutDir: false, target: 'es2022',
  lib: { entry: resolve(root, 'src/shortcut.jsx'), name: 'LearnSpotlightShortcut', formats: ['iife'], fileName: () => 'shortcut.js' },
  rollupOptions: { onwarn(warning, handler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') handler(warning); } } } });
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

await build({ root, configFile: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { outDir: 'dist', emptyOutDir: false, target: 'es2022', lib: { entry: resolve(root, 'src/standalone.jsx'), name: 'LearnSpotlightWindow', formats: ['iife'], fileName: () => 'standalone.js' }, rollupOptions: { onwarn(warning, handler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') handler(warning); } } } });

await mkdir(resolve(root, 'dist/wasm'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'), resolve(root, 'dist/pdf.worker.mjs'));
await cp(resolve(root, 'node_modules/pdfjs-dist/cmaps'), resolve(root, 'dist/pdf-cmaps'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/standard_fonts'), resolve(root, 'dist/pdf-fonts'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/wasm'), resolve(root, 'dist/pdf-wasm'), { recursive: true });
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

// Public catalog vectors are optional ignored artifacts; build a compact runtime manifest.
const catalogRoot = resolve(root, 'outline-data/catalog-embeddings');
let catalogPresent = false;
try { await readFile(resolve(catalogRoot, 'manifest.json')); catalogPresent = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (catalogPresent) {
  const { manifest: catalog, vectors } = await readCatalogBundle(catalogRoot);
  if (manifest) {
    const assetHash = createHash('sha256').update(JSON.stringify(MODEL_FILES.map(name => [name, manifest.files[name].sha256]))).digest('hex');
    if (catalog.encoder.assetHash !== assetHash) throw new Error('Catalog vectors use different model assets. Regenerate or import a compatible bundle.');
  }
  const courses = Object.fromEntries(catalog.courses.map(course => [course.code.replace(/ /g, ''), { title: course.title, description: course.description,
    sourceUrl: course.sourceUrl, vectorIndices: catalog.chunks.filter(chunk => chunk.courseKey === course.key).map(chunk => chunk.vectorIndex) }]));
  await mkdir(resolve(root, 'dist/catalog'), { recursive: true });
  await cp(resolve(catalogRoot, catalog.vectorFile), resolve(root, 'dist/catalog/vectors.f32'));
  await writeFile(resolve(root, 'dist/catalog/manifest.json'), JSON.stringify({ version: 1, encoder: catalog.encoder, vectorCount: vectors.length, vectorFileHash: catalog.vectorFileHash, courses }));
  console.log(`Bundled ${catalog.courses.length} public catalog courses for local course relevance.`);
}

const outlineRoot = resolve(root, 'outline-data/embeddings');
let outlinePresent = false;
try { await readFile(resolve(outlineRoot, 'manifest.json')); outlinePresent = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (outlinePresent) {
  const { manifest: outlines, vectors } = await readOutlineBundle(outlineRoot);
  if (manifest) {
    const assetHash = createHash('sha256').update(JSON.stringify(MODEL_FILES.map(name => [name, manifest.files[name].sha256]))).digest('hex');
    if (outlines.encoder.assetHash !== assetHash) throw new Error('Outline vectors use different model assets. Regenerate them.');
  }
  const courses = {};
  for (const outline of outlines.outlines) {
    const chunks = outlines.chunks.filter(chunk => chunk.outlineVersionKey === outline.versionKey);
    const indices = [...new Set(chunks.map(chunk => chunk.vectorIndex))];
    const weeks = {};
    for (const chunk of chunks) if (chunk.kind === 'week' && Number.isInteger(chunk.week)) {
      (weeks[chunk.week] ||= []).push(chunk.vectorIndex);
    }
    for (const week of Object.keys(weeks)) weeks[week] = [...new Set(weeks[week])];
    if (!indices.length) continue;
    for (const code of outline.courseCodes || [outline.course]) {
      const entry = courses[code.replace(/ /g, '')] ||= { vectorIndices: [], outlines: [] };
      entry.vectorIndices.push(...indices);
      entry.outlines.push({ id: outline.id, term: outline.term, sections: outline.sections, sourceUrl: outline.sourceUrl, vectorIndices: indices, weeks });
    }
  }
  for (const entry of Object.values(courses)) entry.vectorIndices = [...new Set(entry.vectorIndices)];
  await mkdir(resolve(root, 'dist/outlines'), { recursive: true });
  await cp(resolve(outlineRoot, outlines.vectorFile), resolve(root, 'dist/outlines/vectors.f32'));
  await writeFile(resolve(root, 'dist/outlines/manifest.json'), JSON.stringify({ version: 1, encoder: outlines.encoder, vectorCount: vectors.length, vectorFileHash: outlines.vectorFileHash, courses }));
  console.log(`Bundled ${outlines.outlines.length} real outlines; matching term/section outlines take precedence over calendar context.`);
}
