import { readFile } from 'node:fs/promises';
import { compareSearchReports } from '../benchmarks/compare-search.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: npm run compare:search -- before.json after.json');
  const [before, after] = await Promise.all(args.map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const comparison = compareSearchReports(before, after);
  console.log(JSON.stringify(comparison, null, 2));
  if (comparison.regressions.length) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
