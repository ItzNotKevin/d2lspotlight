function queryIdentity(row) {
  const filters = Object.entries(row.filters || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([row.query, filters, row.expected]);
}

function quality(row) {
  const ids = [...new Set(row.top5)].slice(0, 5);
  const rank = ids.findIndex(id => row.expected.includes(id)) + 1;
  return { rank: rank || null, hits: ids.filter(id => row.expected.includes(id)).length,
    falsePositive: row.expected.length === 0 && ids.length > 0 };
}

export function compareSearchReports(before, after) {
  if (!before.datasetHash || before.datasetHash !== after.datasetHash) throw new Error('Reports must use the same dataset hash. Rerun both evaluations on the same dataset.');
  if (!Array.isArray(before.rows) || !Array.isArray(after.rows) || before.rows.length !== after.rows.length) throw new Error('Reports must contain the same query rows.');
  const improvements = [], regressions = [];
  before.rows.forEach((row, index) => {
    const next = after.rows[index];
    if (queryIdentity(row) !== queryIdentity(next)) throw new Error(`Query or labels changed at row ${index + 1}. Rerun both evaluations on the same dataset.`);
    const previous = quality(row), current = quality(next);
    const change = { query: row.query, filters: row.filters || {}, before: previous, after: current,
      beforeTop5: row.top5, afterTop5: next.top5 };
    const previousRank = previous.rank || Infinity, currentRank = current.rank || Infinity;
    if (currentRank < previousRank || current.hits > previous.hits || (previous.falsePositive && !current.falsePositive)) improvements.push(change);
    if (currentRank > previousRank || current.hits < previous.hits || (!previous.falsePositive && current.falsePositive)) regressions.push(change);
  });
  return { queries: before.rows.length, improvements, regressions };
}
