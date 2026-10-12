import { pipeline, env } from '@huggingface/transformers';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { models } from '../benchmarks/models.js';
import { benchmark } from '../benchmarks/academic.js';
import { calibrateThreshold, rankedRows, summarize, percentile, validateBenchmark } from '../benchmarks/evaluate.js';
import { resourceText, cosineSimilarity, validVector } from '../src/search/semantic/model.js';
import { semanticQueryText } from '../src/search/rank.js';
import { semanticConstraintsMatch } from '../src/search/hybrid.js';
import { searchResources } from '../src/learn/search.js';

const root = resolve(import.meta.dirname, '..');
const model = models.find((item) => item.key === process.argv[2]);
if (!model) throw new Error('Choose a registered model key.');
validateBenchmark(benchmark);
const manifest = JSON.parse(await readFile(resolve(root, model.assetRoot, `${model.key}-manifest.json`), 'utf8'));
if (manifest.model !== model.id || manifest.revision !== model.revision) throw new Error('Model files are not pinned to the expected revision. Run npm run setup:search-models.');
env.allowRemoteModels = false;
env.localModelPath = `${resolve(root, model.assetRoot)}/`;
let sampledRss = process.memoryUsage().rss;
const sampleMemory = () => { sampledRss = Math.max(sampledRss, process.memoryUsage().rss); };
const loadStart = performance.now();
const extractor = await pipeline('feature-extraction', model.id, { dtype: 'q8', device: 'cpu', local_files_only: true,
  session_options: { intra_op_num_threads: 1, inter_op_num_threads: 1 } });
const loadMs = performance.now() - loadStart;
sampleMemory();
const encode = async (text, prefix) => {
  const output = await extractor(prefix + text, { pooling: model.pooling, normalize: true });
  if (!validVector(output.data)) throw new Error('Model returned an invalid embedding.');
  sampleMemory();
  return new Float32Array(output.data);
};
try {
  const indexingStart = performance.now();
  const vectors = [];
  for (const resource of benchmark.resources) vectors.push({ resource,
    context: await encode(resourceText(resource), model.documentPrefix),
    title: await encode(resourceText(resource, 'title'), model.documentPrefix) });
  const indexingMs = performance.now() - indexingStart;
  const rows = [];
  searchResources(benchmark.resources, { query: 'course notes' });
  for (const query of benchmark.queries) {
    const started = performance.now();
    const vector = await encode(semanticQueryText(query.text), model.queryPrefix);
    const scores = vectors.filter((item) => semanticConstraintsMatch(item.resource, query.text)).map((item) => ({
      id: item.resource.id, score: Math.max(cosineSimilarity(vector, item.context), cosineSimilarity(vector, item.title))
    })).sort((a, b) => b.score - a.score);
    rows.push({ ...query, scores, embeddingSearchMs: performance.now() - started });
  }
  const calibration = calibrateThreshold(benchmark.resources, rows.filter((row) => row.split === 'calibration'));
  const testing = rows.filter((row) => row.split === 'test');
  const hybrid = rankedRows(benchmark.resources, testing, calibration.threshold);
  const lexical = testing.map((row) => ({ ...row, results: searchResources(benchmark.resources, { query: row.text }) }));
  const raw = testing.map((row) => ({ ...row, results: row.scores }));
  const byField = Object.fromEntries([...new Set(testing.map((row) => row.field))].map((field) => [field, {
    raw: summarize(raw.filter((row) => row.field === field)), hybrid: summarize(hybrid.filter((row) => row.field === field))
  }]));
  const byKind = Object.fromEntries([...new Set(testing.map((row) => row.kind))].map((kind) => [kind, {
    raw: summarize(raw.filter((row) => row.kind === kind)), hybrid: summarize(hybrid.filter((row) => row.kind === kind))
  }]));
  sampleMemory();
  const report = {
    model, benchmarkVersion: benchmark.version, provenance: benchmark.provenance,
    runtime: { backend: 'Native ONNX CPU, one intra/inter-op thread', node: process.version, platform: process.platform, arch: process.arch },
    threshold: calibration.threshold, calibration: calibration.metrics,
    metrics: { lexical: summarize(lexical), raw: summarize(raw), hybrid: summarize(hybrid) }, byField, byKind,
    performance: { modelBytes: Object.values(manifest.files).reduce((total, file) => total + file.bytes, 0), loadMs, indexingMs,
      resources: benchmark.resources.length, warmEmbeddingSearchP50Ms: percentile(testing.map((row) => row.embeddingSearchMs), .5),
      warmEmbeddingSearchP95Ms: percentile(testing.map((row) => row.embeddingSearchMs), .95), sampledProcessRssMiB: sampledRss / 1048576 },
    cases: hybrid.map((row) => ({ id: row.id, field: row.field, kind: row.kind, query: row.text, expected: row.relevant,
      returned: row.results.slice(0, 5).map((item) => ({ id: item.id, title: item.title })),
      rawTop5: row.scores.slice(0, 5), correctTop1: row.relevant.length ? row.relevant.includes(row.results[0]?.id) : row.results.length === 0 }))
  };
  await mkdir(resolve(root, 'benchmark-results'), { recursive: true });
  await writeFile(resolve(root, 'benchmark-results', `${model.key}.json`), JSON.stringify(report, null, 2));
  console.log(`${model.name}: top-1 ${(report.metrics.hybrid.top1 * 100).toFixed(1)}%, top-5 ${(report.metrics.hybrid.hitAt5 * 100).toFixed(1)}%, no-answer false positives ${(report.metrics.hybrid.falsePositiveRate * 100).toFixed(1)}%`);
} finally { await extractor.dispose(); }
