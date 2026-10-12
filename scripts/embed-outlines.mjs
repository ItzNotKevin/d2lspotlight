import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { extractOutline, normalizeOutline } from '../src/search/outlines/extract.js';
import { createOutlineChunks, OUTLINE_MAX_TOKENS } from '../src/search/outlines/chunks.js';
import { encodeOutlineVectors } from '../src/search/outlines/vectors.js';
import { root, hash, createOutlineEncoder, readOutlineBundle, atomicJson } from './outline-runtime.mjs';

const inputs = [];
const overrides = {};
let output = resolve(root, 'outline-data', 'embeddings');
for (let position = 2; position < process.argv.length; position++) {
  const argument = process.argv[position];
  if (argument === '--help') {
    console.log('npm run embed:outlines -- [--out DIRECTORY] [--source-url HTTPS_URL] [--course CODE] [--title TITLE] [--term TERM] INPUT.txt|INPUT.json ...');
    process.exit(0);
  }
  if (['--out', '--source-url', '--course', '--title', '--term'].includes(argument)) {
    const value = process.argv[++position];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
    if (argument === '--out') output = resolve(value);
    else overrides[{ '--source-url': 'sourceUrl', '--course': 'course', '--title': 'title', '--term': 'term' }[argument]] = value;
  } else if (argument.startsWith('--')) throw new Error(`Unknown option ${argument}.`);
  else inputs.push(resolve(argument));
}
if (!inputs.length) throw new Error('Supply outline text files or structured JSON. Run npm run embed:outlines -- --help for usage.');
if (inputs.length > 1 && Object.keys(overrides).length) throw new Error('Metadata overrides apply to a single outline only. For bulk imports include metadata in each JSON outline.');

const outlines = [];
const identities = new Set();
for (const path of inputs) {
  const text = await readFile(path, 'utf8');
  const data = extname(path).toLowerCase() === '.json' ? JSON.parse(text) : null;
  const values = data ? Array.isArray(data) ? data : Array.isArray(data.outlines) ? data.outlines : [data] : [extractOutline(text, overrides)];
  if (values.length > 1 && Object.keys(overrides).length) throw new Error('Metadata overrides cannot be applied to multiple outlines in a JSON file.');
  for (const value of values) {
    const normalized = normalizeOutline({ ...value, ...overrides });
    const versionHash = hash(JSON.stringify(normalized));
    const versionKey = `${normalized.id}@${versionHash}`;
    if (identities.has(versionKey)) continue;
    identities.add(versionKey);
    outlines.push({ ...normalized, versionHash, versionKey, inputName: basename(path), inputHash: hash(text) });
  }
}
if (!outlines.length) throw new Error('The import contains no outlines.');
await mkdir(output, { recursive: true });
const lockPath = resolve(output, 'build.lock');
let lock;
try { lock = await open(lockPath, 'wx'); }
catch (error) { if (error.code === 'EEXIST') throw new Error('Another outline build is using this output directory.'); throw error; }
let encoder;
try {
  encoder = await createOutlineEncoder();
  let previous;
  try { previous = await readOutlineBundle(output); }
  catch (error) {
    if (error.code !== 'ENOENT') console.log(`Previous vectors were not reused: ${error.message}`);
  }
  const reusable = previous && JSON.stringify(previous.manifest.encoder) === JSON.stringify(encoder.signature)
    ? new Map(previous.manifest.vectorHashes.map((key, index) => [key, previous.vectors[index]])) : new Map();
  const vectors = [];
  const vectorHashes = [];
  const vectorIndices = new Map();
  const chunks = [];
  let generated = 0;
  let reused = 0;
  const began = performance.now();
  for (const outline of outlines) {
    const entries = await createOutlineChunks(outline, { countTokens: encoder.countTokens, maximum: OUTLINE_MAX_TOKENS, outlineKey: outline.versionKey });
    for (const entry of entries) {
      const inputHash = hash(entry.text);
      let vectorIndex = vectorIndices.get(inputHash);
      if (vectorIndex === undefined) {
        const saved = reusable.get(inputHash);
        const vector = saved || await encoder.embed(entry.text);
        if (saved) reused++;
        else generated++;
        vectorIndex = vectors.length;
        vectorIndices.set(inputHash, vectorIndex);
        vectors.push(vector);
        vectorHashes.push(inputHash);
      }
      chunks.push({ ...entry, inputHash, vectorIndex });
    }
    console.log(`${outline.course} (${outline.term || 'unknown term'}): ${entries.length} chunks, ${outline.weeks.length} weeks.`);
    outline.warnings.forEach((warning) => console.log(`  ${warning}`));
  }
  const bytes = encodeOutlineVectors(vectors, encoder.signature.dimensions);
  const vectorFileHash = hash(bytes);
  const vectorFile = `vectors-${vectorFileHash.slice(0, 20)}.f32`;
  await writeFile(resolve(output, vectorFile), bytes);
  await atomicJson(resolve(output, 'manifest.json'), { version: 1, createdAt: new Date().toISOString(), encoder: encoder.signature,
    maximumTokens: OUTLINE_MAX_TOKENS, outlines, chunks, vectorHashes, vectorFile, vectorFileHash,
    statistics: { outlines: outlines.length, chunks: chunks.length, generated, reused, vectorBytes: bytes.byteLength, processingMs: Math.round(performance.now() - began) } });
  console.log(`Saved ${vectors.length} vectors (${bytes.byteLength} bytes): ${generated} generated, ${reused} reused. ${resolve(output, 'manifest.json')}`);
} finally {
  try { await encoder?.close(); }
  finally {
    await lock.close();
    await unlink(lockPath);
  }
}
