import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, hash, atomicJson } from './outline-runtime.mjs';
import { createCatalogEncoder, readCatalogBundle } from './catalog-runtime.mjs';
import { createCatalogChunks, catalogCoverage } from '../src/search/catalog/academic.js';
import { encodeOutlineVectors } from '../src/search/outlines/vectors.js';
import { OUTLINE_MAX_TOKENS } from '../src/search/outlines/chunks.js';

let input = resolve(root, 'outline-data', 'catalog', 'inventory.json');
let output = resolve(root, 'outline-data', 'catalog-embeddings');
for (let index = 2; index < process.argv.length; index++) {
  const option = process.argv[index];
  if (option === '--help') {
    console.log('npm run embed:catalog -- [--input INVENTORY.json] [--out DIRECTORY]');
    process.exit(0);
  }
  if (!['--input', '--out'].includes(option)) throw new Error(`Unknown option ${option}.`);
  const value = process.argv[++index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}.`);
  if (option === '--input') input = resolve(value);
  else output = resolve(value);
}
const inventory = JSON.parse(await readFile(input, 'utf8'));
if (inventory.version !== 1 || inventory.kind !== 'course-catalog' || !Array.isArray(inventory.courses) || !inventory.courses.length
  || !Array.isArray(inventory.sources) || !inventory.sources.length) throw new Error('Unsupported course inventory.');
const coverage = catalogCoverage(inventory.sources, inventory.courses);
if (coverage.collected !== coverage.listed || new Set(inventory.courses.map((course) => course.key)).size !== coverage.collected
  || Object.values(coverage.levels).some((level) => level.listed !== level.collected)) throw new Error('The catalog inventory is incomplete or contains duplicate identities.');
await mkdir(output, { recursive: true });
const lockPath = resolve(output, 'build.lock');
const lock = await open(lockPath, 'wx').catch((error) => {
  if (error.code === 'EEXIST') throw new Error('Another catalog embedding build is using this output directory.');
  throw error;
});
let encoder;
try {
  encoder = await createCatalogEncoder();
  let previous;
  try { previous = await readCatalogBundle(output); }
  catch (error) { if (error.code !== 'ENOENT') console.log(`Previous vectors were not reused: ${error.message}`); }
  const reusable = previous && JSON.stringify(previous.manifest.encoder) === JSON.stringify(encoder.signature)
    ? new Map(previous.manifest.vectorHashes.map((key, index) => [key, previous.vectors[index]])) : new Map();
  const vectors = [];
  const vectorHashes = [];
  const indices = new Map();
  const chunks = [];
  let generated = 0;
  let reused = 0;
  const began = performance.now();
  for (const [position, course] of inventory.courses.entries()) {
    for (const chunk of await createCatalogChunks(course, encoder.countTokens)) {
      const inputHash = hash(chunk.text);
      let vectorIndex = indices.get(inputHash);
      if (vectorIndex === undefined) {
        const saved = reusable.get(inputHash);
        const vector = saved || await encoder.embed(chunk.text);
        if (saved) reused++;
        else generated++;
        vectorIndex = vectors.length;
        indices.set(inputHash, vectorIndex);
        vectorHashes.push(inputHash);
        vectors.push(vector);
      }
      chunks.push({ ...chunk, inputHash, vectorIndex });
    }
    if ((position + 1) % 250 === 0 || position + 1 === inventory.courses.length) console.log(`Embedded ${position + 1}/${inventory.courses.length} courses.`);
  }
  const vectorBytes = encodeOutlineVectors(vectors, encoder.signature.dimensions);
  const vectorFileHash = hash(vectorBytes);
  const vectorFile = `vectors-${vectorFileHash.slice(0, 20)}.f32`;
  await writeFile(resolve(output, vectorFile), vectorBytes);
  let previousOutlineCoverage = {};
  try {
    const saved = JSON.parse(await readFile(resolve(output, 'outline-coverage.json'), 'utf8'));
    if (saved.version !== 1 || !saved.courses || typeof saved.courses !== 'object' || Array.isArray(saved.courses)) throw new Error('Unsupported outline coverage report.');
    previousOutlineCoverage = saved.courses;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const outlineCoverage = Object.fromEntries(inventory.courses.map((course) => [course.key,
    previousOutlineCoverage[course.key] || { course: course.code, status: 'not-linked' }]));
  await atomicJson(resolve(output, 'manifest.json'), { version: 1, kind: 'course-catalog', createdAt: new Date().toISOString(),
    inventoryHash: hash(JSON.stringify(inventory.courses)), encoder: encoder.signature, maximumTokens: OUTLINE_MAX_TOKENS,
    sources: inventory.sources, courses: inventory.courses, coverage: { ...coverage, embedded: new Set(chunks.map((chunk) => chunk.courseKey)).size },
    chunks, vectorHashes, vectorFile, vectorFileHash,
    statistics: { chunks: chunks.length, vectors: vectors.length, generated, reused, vectorBytes: vectorBytes.byteLength, processingMs: Math.round(performance.now() - began) } });
  await atomicJson(resolve(output, 'outline-coverage.json'), { version: 1, inventoryHash: hash(JSON.stringify(inventory.courses)),
    description: 'Outline collection is tracked separately from catalog baseline coverage.', courses: outlineCoverage });
  console.log(`Saved ${vectors.length} vectors for ${coverage.collected} courses (${vectorBytes.byteLength} bytes): ${generated} generated, ${reused} reused.`);
} finally {
  try { await encoder?.close(); }
  finally { await lock.close(); await unlink(lockPath); }
}
