import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { models } from '../benchmarks/models.js';
import { benchmark } from '../benchmarks/academic.js';

const root = resolve(import.meta.dirname, '..');
const reports = [];
for (const model of models) {
  console.log(`Testing ${model.name} on ${benchmark.resources.length} resources and ${benchmark.queries.length} queries…`);
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts/benchmark-search-model.mjs'), model.key], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`${model.name} failed (${code}).`)));
  });
  reports.push(JSON.parse(await readFile(resolve(root, 'benchmark-results', `${model.key}.json`), 'utf8')));
}
const percent = (value) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const table = [
  '| Model | Raw top-1 | Hybrid top-1 | Hybrid top-5 | No-answer false positives | Warm p95, CPU | Model files |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...reports.map((report) => `| ${report.model.name} | ${percent(report.metrics.raw.top1)} | ${percent(report.metrics.hybrid.top1)} | ${percent(report.metrics.hybrid.hitAt5)} | ${percent(report.metrics.hybrid.falsePositiveRate)} | ${report.performance.warmEmbeddingSearchP95Ms.toFixed(1)} ms | ${(report.performance.modelBytes / 1048576).toFixed(1)} MiB |`)
];
const fields = [...new Set(benchmark.queries.map((query) => query.field))];
const fieldTable = ['| Field | MiniLM top-1 | BGE top-1 | E5 top-1 |', '| --- | ---: | ---: | ---: |',
  ...fields.map((field) => `| ${field} | ${reports.map((report) => percent(report.byField[field].hybrid.top1)).join(' | ')} |`)];
const lexical = reports[0].metrics.lexical;
const text = [
  '# Initial academic model comparison', '',
  'Synthetic screening benchmark: 48 metadata resources across eight equally represented fields. Thresholds are selected on 24 calibration queries, then evaluated on 56 separate test queries (48 supported and 8 unanswerable). No model is trained or fine-tuned.', '',
  'These are authored scenarios and relevance labels, not observed student searches or expert-reviewed course data. Small per-field samples make the percentages coarse. They are a starting point for investigation, not evidence of reliability across programs.', '',
  ...table, '',
  `Keyword-only baseline: top-1 ${percent(lexical.top1)}, top-5 ${percent(lexical.hitAt5)}, no-answer false positives ${percent(lexical.falsePositiveRate)}.`, '',
  ...fieldTable, '',
  'Raw retrieval uses model embeddings plus existing identifier constraints. Hybrid retrieval uses the same keyword/semantic blend and text preparation as Spotlight, with each model’s separately calibrated threshold. Raw retrieval always returns nearest neighbours; its no-answer false positives are not a useful comparison.', '',
  'Native ONNX CPU timings include a warm query embedding and scoring 48 resources; they exclude model loading, document indexing, hybrid sorting, and Chrome messaging. Each model runs in a fresh Node process. Model load/indexing timings and sampled process RSS are recorded in JSON; process RSS includes Node and native runtime overhead. These measurements do not establish WebAssembly or WebGPU browser performance.', '',
  'See minilm.json, bge.json, and e5.json for thresholds, per-kind results, incorrect cases, revisions, and environment details. The installed extension still uses MiniLM; this benchmark does not switch production models.', ''
].join('\n');
await writeFile(resolve(root, 'benchmark-results/summary.md'), text);
await writeFile(resolve(root, 'benchmark-results/comparison.json'), JSON.stringify({ benchmarkVersion: benchmark.version, reports }, null, 2));
console.log(table.join('\n'));
console.log('Full report: benchmark-results/summary.md');
