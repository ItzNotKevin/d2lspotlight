import { resolve } from 'node:path';
import { createCatalogEncoder, readCatalogBundle } from './catalog-runtime.mjs';
import { catalogCourseCode } from '../src/search/catalog/academic.js';
import { cosineSimilarity } from '../src/search/semantic/model.js';

const [directory, ...words] = process.argv.slice(2);
if (!directory || !words.length) throw new Error('Usage: npm run search:catalog -- DIRECTORY "SEARCH QUERY"');
const query = words.join(' ');
const bundle = await readCatalogBundle(resolve(directory));
let code;
try { code = catalogCourseCode(query); } catch {}
let encoder;
try {
  const matches = new Map();
  if (code) {
    bundle.manifest.courses.filter((course) => course.code === code).forEach((course) => matches.set(course.key, { course: course.code, title: course.title,
      level: course.level, score: null, sourceUrl: course.sourceUrl, quality: course.quality }));
  } else {
    encoder = await createCatalogEncoder();
    if (JSON.stringify(encoder.signature) !== JSON.stringify(bundle.manifest.encoder)) throw new Error('The catalog vectors use a different encoder. Rebuild them first.');
    if (await encoder.countTokens(query) > 256) throw new Error('Shorten the query to at most 256 model tokens.');
    const vector = await encoder.embed(query);
    for (const chunk of bundle.manifest.chunks) {
      const score = cosineSimilarity(vector, bundle.vectors[chunk.vectorIndex]);
      if (!matches.has(chunk.courseKey) || score > matches.get(chunk.courseKey).score) matches.set(chunk.courseKey, {
        course: chunk.course, title: chunk.title, level: chunk.level, quality: chunk.quality,
        score, sourceUrl: chunk.sourceUrl, text: chunk.text });
    }
  }
  console.log(JSON.stringify({ query, results: [...matches.values()].sort((a, b) => b.score - a.score).slice(0, 10)
    .map((entry) => ({ ...entry, score: entry.score === null ? null : Number(entry.score.toFixed(4)) })) }, null, 2));
} finally { await encoder?.close(); }
