import { hybridSearch } from '../src/search/hybrid.js';

export function summarize(rows) {
  const positives = rows.filter((row) => row.relevant.length);
  const negatives = rows.filter((row) => !row.relevant.length);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    positiveQueries: positives.length, negativeQueries: negatives.length,
    top1: mean(positives.map((row) => Number(row.relevant.includes(row.results[0]?.id)))),
    hitAt5: mean(positives.map((row) => Number(row.results.slice(0, 5).some((item) => row.relevant.includes(item.id))))),
    recallAt5: mean(positives.map((row) => row.results.slice(0, 5).filter((item) => row.relevant.includes(item.id)).length / row.relevant.length)),
    mrr: mean(positives.map((row) => {
      const index = row.results.findIndex((item) => row.relevant.includes(item.id));
      return index < 0 ? 0 : 1 / (index + 1);
    })),
    falsePositiveRate: mean(negatives.map((row) => Number(row.results.length > 0)))
  };
}

export function rankedRows(resources, rows, threshold) {
  return rows.map((row) => ({ ...row, results: hybridSearch(resources, { query: row.text, semanticThreshold: threshold }, row.scores) }));
}

export function calibrateThreshold(resources, rows) {
  if (rows.some((row) => row.split !== 'calibration')) throw new Error('Threshold selection accepts calibration queries only.');
  if (!rows.some((row) => row.relevant.length) || !rows.some((row) => !row.relevant.length)) throw new Error('Calibration needs positive and unanswerable queries.');
  const thresholds = new Set([0, 0.99]);
  for (const row of rows) for (const item of row.scores) {
    if (item.score >= 0 && item.score < 0.99) thresholds.add(Math.min(0.99, item.score + 0.000001));
  }
  const candidates = [...thresholds].map((threshold) => {
    const metrics = summarize(rankedRows(resources, rows, threshold));
    return { threshold, metrics, utility: .5 * metrics.hitAt5 + .5 * (1 - metrics.falsePositiveRate) };
  });
  return candidates.sort((a, b) => b.utility - a.utility || b.metrics.top1 - a.metrics.top1 || b.threshold - a.threshold)[0];
}

export function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : 0;
}

export function validateBenchmark(benchmark) {
  const ids = new Set(benchmark.resources.map((resource) => resource.id));
  if (ids.size !== benchmark.resources.length) throw new Error('Resource IDs must be unique.');
  const queries = new Set();
  for (const query of benchmark.queries) {
    if (queries.has(query.id) || !query.text.trim() || !['calibration', 'test'].includes(query.split)) throw new Error('Invalid query identity or split.');
    queries.add(query.id);
    if (query.relevant.some((id) => !ids.has(id))) throw new Error(`Unknown relevance label: ${query.id}`);
  }
  const fields = [...new Set(benchmark.queries.map((query) => query.field))];
  for (const field of fields) for (const split of ['calibration', 'test']) {
    const rows = benchmark.queries.filter((query) => query.field === field && query.split === split);
    if (!rows.some((query) => query.relevant.length) || !rows.some((query) => !query.relevant.length)) throw new Error(`Missing positive/negative coverage: ${field}/${split}`);
  }
}
