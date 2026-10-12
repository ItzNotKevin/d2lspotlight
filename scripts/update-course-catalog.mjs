import { readFile, writeFile } from 'node:fs/promises';
import { parseCourseOfferings } from '../src/search/catalog/parse.js';

const source = 'https://classes.uwaterloo.ca/uwpcshtm.html';
let html;
if (process.argv[2]) html = await readFile(process.argv[2], 'utf8');
else {
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Course catalog request failed: ${response.status}`);
  html = await response.text();
}
const parsed = parseCourseOfferings(html);
if (Object.keys(parsed.courses).length < 200) throw new Error('Course list is unexpectedly small; the existing snapshot was kept.');
const snapshot = { source, fetchedAt: new Date().toISOString(), ...parsed };
await writeFile(new URL('../src/search/catalog/waterloo.json', import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Saved ${Object.keys(parsed.courses).length} courses for ${parsed.term}.`);
