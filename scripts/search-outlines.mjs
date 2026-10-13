import { resolve } from 'node:path';
import { createOutlineEncoder, readOutlineBundle } from './outline-runtime.mjs';
import { cosineSimilarity } from '../src/search/semantic/model.js';
import { normalizeQuery } from '../src/search/rank.js';
import { parseOutlineQuery } from '../src/search/outlines/query.js';

const [directory, ...words] = process.argv.slice(2);
if (!directory || !words.length) throw new Error('Usage: npm run search:outlines -- DIRECTORY "SEARCH QUERY"');
const query = words.join(' ');
const parsed = parseOutlineQuery(query);
const bundle = await readOutlineBundle(resolve(directory));
const entries = parsed.assignments.length ? [] : bundle.manifest.chunks.filter((chunk) => parsed.courses.every((code) => normalizeQuery(chunk.course) === code)
  && (parsed.week === null || chunk.week === parsed.week));
let encoder;
try {
  const matches = [];
  if (entries.length && parsed.text) {
    encoder = await createOutlineEncoder();
    if (JSON.stringify(encoder.signature) !== JSON.stringify(bundle.manifest.encoder)) throw new Error('The saved vectors use a different model signature. Rebuild them first.');
    const vector = await encoder.embed(parsed.text);
    for (const entry of entries) {
      const score = cosineSimilarity(vector, bundle.vectors[entry.vectorIndex]);
      if (score >= .4) matches.push({ ...entry, score });
    }
  } else if (parsed.metadataOnly) matches.push(...entries.map((entry) => ({ ...entry, score: null })));
  console.log(JSON.stringify({ query, results: matches.sort((a, b) => b.score - a.score).slice(0, 5).map((entry) => ({
    course: entry.course, term: entry.term, sections: entry.sections, kind: entry.kind, week: entry.week, dateLabels: entry.dateLabels, text: entry.text, references: entry.references,
    score: Number.isFinite(entry.score) ? Number(entry.score.toFixed(4)) : null, sourceUrl: entry.sourceUrl, evidence: entry.evidence
  })) }, null, 2));
} finally { await encoder?.close(); }
