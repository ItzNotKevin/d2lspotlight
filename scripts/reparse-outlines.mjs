import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseScheduleSource } from '../src/search/outlines/schedule.js';
import { normalizeOutline } from '../src/search/outlines/extract.js';
const directory = resolve(process.argv[2] || 'outline-data/collected/F26');
const outlines = JSON.parse(await readFile(resolve(directory, 'outlines.json'), 'utf8'));
async function save(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2));
  await rename(`${path}.tmp`, path);
}
for (let index = 0; index < outlines.length; index++) {
  const outline = outlines[index];
  if (!outline.scheduleSource) continue;
  const parsed = parseScheduleSource(outline.scheduleSource, outline.readings);
  // Older vertical parsing is preserved until a structural adapter replaces it.
  const weeks = (parsed.weeks.length ? parsed.weeks : outline.weeks).filter(week => /[\p{L}\p{N}]/u.test(week.topics) || week.references?.length);
  outlines[index] = normalizeOutline({ ...outline, ...parsed, weeks, unparsedSchedule: parsed.unparsed,
    scheduleStatus: weeks.length ? 'explicit-weeks' : parsed.scheduleStatus,
    warnings: outline.warnings.filter(text => !/schedule section|schedule rows|structured weekly/.test(text)) });
  await save(resolve(directory, 'outlines', `${outline.id}.json`), outlines[index]);
}
await save(resolve(directory, 'outlines.json'), outlines);
console.log(JSON.stringify({ outlines: outlines.length, weeks: outlines.filter(outline => outline.weeks.length).length,
  structured: outlines.filter(outline => outline.scheduleEntries?.length || outline.weeks.length).length }));
