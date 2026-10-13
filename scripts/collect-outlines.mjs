import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requestOutline, requestOutlineBatch } from './outline-browser.mjs';
import { normalizeSearchRows, captureOutlineHTML } from '../src/search/outlines/collect.js';

const CAPTURE_VERSION = 4;
let term = 'F26', out, selected, refresh = false, outlineIds;
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === '--help') {
    console.log('npm run collect:outlines -- [--term F26] [--subjects STAT,CS,MATH] [--outline ID[,ID]] [--out DIRECTORY] [--refresh]\nRequires a signed-in Chrome Outline tab and Allow JavaScript from Apple Events.');
    process.exit(0);
  }
  if (flag === '--term') term = process.argv[++i];
  else if (flag === '--out') out = process.argv[++i];
  else if (flag === '--subjects') selected = process.argv[++i].split(',');
  else if (flag === '--outline') {
    const value = process.argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Supply one or more discovered outline IDs after --outline.');
    outlineIds = value.split(',');
  }
  else if (flag === '--refresh') refresh = true;
  else throw new Error(`Unknown option ${flag}`);
}
if (!/^[FWS]\d{2}$/.test(term)) throw new Error('Use a term such as F26, W27, or S27.');
const numericTerm = `1${term.slice(1)}${{ F: 9, W: 1, S: 5 }[term[0]]}`;
const directory = resolve(out || `outline-data/collected/${term}`);
await mkdir(resolve(directory, 'outlines'), { recursive: true });
async function save(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2));
  await rename(`${path}.tmp`, path);
}
let state;
try { state = JSON.parse(await readFile(resolve(directory, 'collection.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
state ||= { version: 1, term, numericTerm, subjects: {}, records: {}, unavailable: [] };
if (state.term !== term) throw new Error('Output directory belongs to another term.');
if (outlineIds && (!outlineIds.length || outlineIds.some(id => !/^[a-z0-9_-]+$/i.test(id) || !state.records[id]))) throw new Error('Target outlines must already exist in the discovered collection.');
const catalog = JSON.parse(await readFile('outline-data/catalog-embeddings/manifest.json', 'utf8'));
const subjects = selected || [...new Set(catalog.courses.map(course => (course.course || course.code || '').match(/^[A-Z]+/)?.[0]).filter(Boolean))];
subjects.sort((a, b) => ['STAT', 'CS', 'MATH', 'AFM'].includes(a) ? -1 : ['STAT', 'CS', 'MATH', 'AFM'].includes(b) ? 1 : a.localeCompare(b));
if (!subjects.length || subjects.some(subject => !/^[A-Z]{2,8}$/.test(subject))) throw new Error('Invalid subject inventory.');
async function checkpoint() {
  state.updatedAt = new Date().toISOString();
  await save(resolve(directory, 'collection.json'), state);
  const outlines = [];
  for (const record of Object.values(state.records)) if (record.status === 'captured') {
    outlines.push(JSON.parse(await readFile(resolve(directory, 'outlines', `${record.id}.json`), 'utf8')));
  }
  await save(resolve(directory, 'outlines.json'), outlines);
}
const delay = () => new Promise(done => setTimeout(done, 250));
function fatal(error) { return /SESSION|session|access unavailable|429|NETWORK|Failed to fetch|timed out|NO_OUTLINE|Open the signed-in|Apple Events/i.test(error.message); }
for (const subject of outlineIds ? [] : subjects) {
  if (state.subjects[subject]?.status === 'discovered') continue;
  try {
    const response = await requestOutline(`/viewer/api/search/?q=${encodeURIComponent(`${subject} ${term}`)}`);
    const rows = normalizeSearchRows(JSON.parse(response.text), numericTerm);
    for (const row of rows) {
      if (row.unavailable) {
        if (!state.unavailable.some(item => item.course === row.course && item.sections === row.sections)) state.unavailable.push(row);
      } else if (!state.records[row.id]) state.records[row.id] = { ...row, status: 'pending' };
      else {
        state.records[row.id].courseCodes = [...new Set([...state.records[row.id].courseCodes, ...row.courseCodes])];
        state.records[row.id].sections = [...new Set([state.records[row.id].sections, row.sections].filter(Boolean))].join(', ');
      }
    }
    state.subjects[subject] = { status: 'discovered', rows: rows.length };
    console.log(`${subject}: ${rows.length} viewer records`);
  } catch (error) {
    state.subjects[subject] = { status: 'failed', error: error.message };
    await checkpoint();
    if (fatal(error)) throw error;
    console.log(`${subject}: discovery failed (${error.message})`);
  }
  await checkpoint(); await delay();
}
const pending = Object.values(state.records).filter(record => outlineIds ? outlineIds.includes(record.id)
  : record.status !== 'captured' || record.captureVersion !== CAPTURE_VERSION || refresh);
async function capture(record, response) {
  try {
    if (response.error) throw new Error(response.error);
    const { outline } = captureOutlineHTML(response.text, record);
    await save(resolve(directory, 'outlines', `${record.id}.json`), outline);
    record.status = 'captured'; record.captureVersion = CAPTURE_VERSION; delete record.error;
    console.log(`${record.course}: captured (${outline.weeks.length} parsed weeks)`);
  } catch (error) {
    record.status = 'failed'; record.error = error.message;
    if (fatal(error)) throw error;
    console.log(`${record.course}: capture failed (${error.message})`);
  }
}
// Browser performs at most three reads at a time, pausing between requests.
for (let offset = 0; offset < pending.length; offset += 12) {
  const batch = pending.slice(offset, offset + 12);
  const responses = await requestOutlineBatch(batch.map(record => new URL(record.sourceUrl).pathname));
  const results = await Promise.allSettled(batch.map((record, index) => capture(record, responses[index])));
  await checkpoint();
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  await delay();
}
await checkpoint();
console.log(JSON.stringify({ subjects: Object.keys(state.subjects).length, captured: Object.values(state.records).filter(row => row.status === 'captured').length,
  failed: Object.values(state.records).filter(row => row.status === 'failed').length, unavailable: state.unavailable.length, output: directory }));
