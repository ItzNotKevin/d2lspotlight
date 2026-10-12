import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { catalogText, catalogCourseCode, calendarConfiguration, validateCatalogList, normalizeCatalogCourse, catalogCoverage, createCatalogChunks } from '../src/search/catalog/academic.js';
import { readCatalogBundle } from '../scripts/catalog-runtime.mjs';
import { hash } from '../scripts/outline-runtime.mjs';
import { encodeOutlineVectors } from '../src/search/outlines/vectors.js';
import { MODEL_KEY, EMBEDDING_DIMENSIONS } from '../src/search/semantic/config.js';
import { courseDescription, courseCatalogTitle } from '../src/search/course.js';

const source = { id: '67e557ed6ed2fe2bd3a38956', level: 'undergraduate', title: '2026-2027 Calendar',
  pageUrl: 'https://uwaterloo.ca/academic-calendar/undergraduate-studies/catalog', apiBase: 'https://uwaterloocm.kuali.co/api/v1/catalog', listed: 1 };
const listing = { __catalogCourseId: 'BIOL130', pid: 'course-pid', id: '682ca86bb1ad924812b14ffe', title: 'Cell Biology', subjectCode: { description: 'Biology (BIOL)' } };
const detail = { ...listing, description: '<p>Cell structure &amp; function.</p><p>Mitosis and meiosis.</p>', crossListedCourses: [{ __catalogCourseId: 'BIOL239' }] };

test('catalog includes professional development, work terms and graduate suffixes', () => {
  for (const [input, expected] of [['PD1', 'PD 1'], ['COOP1G', 'COOP 1G'], ['ECE6601PD', 'ECE 6601PD'], ['math239', 'MATH 239']]) {
    assert.equal(catalogCourseCode(input), expected);
  }
  assert.throws(() => catalogCourseCode('Fall 2026 metadata'), /Invalid/);
  assert.equal(courseDescription('PD1_instructor_1269'), '');
  assert.equal(courseDescription('ECE6601PD - Professional Development'), 'Professional Development');
  assert.equal(courseCatalogTitle({ source: 'LEARN', course: 'PD1_instructor_1269' }), 'Career Fundamentals');
  assert.equal(courseCatalogTitle({ source: 'LEARN', course: 'ECE6601PD_instructor_1269' }), 'Power System Components and Modeling');
});

test('public calendar configuration rejects unrelated feeds and missing catalog IDs', () => {
  const html = `window.subdomain = 'https://uwaterloocm.kuali.co'; window.catalogId = '${source.id}'`;
  assert.equal(calendarConfiguration(html, source.pageUrl, 'undergraduate').id, source.id);
  assert.throws(() => calendarConfiguration(html.replace('uwaterloocm.kuali.co', 'example.org'), source.pageUrl, 'undergraduate'), /Unsupported/);
  assert.throws(() => calendarConfiguration('', source.pageUrl, 'graduate'), /Unsupported/);
});

test('catalog normalization preserves content and aliases without using prerequisite text as course topics', () => {
  assert.equal(catalogText('<p>First &amp; second</p><ul><li>Third</li><li>Fourth</li></ul><script>hidden()</script>'), 'First & second Third Fourth');
  const result = normalizeCatalogCourse(listing, { ...detail, prerequisites: 'Quantum chemistry' }, source);
  assert.equal(result.description, 'Cell structure & function. Mitosis and meiosis.');
  assert.equal(result.subject, 'Biology');
  assert.deepEqual(result.crossListed, ['BIOL 239']);
  assert.ok(!JSON.stringify(result).includes('Quantum chemistry'));
  assert.equal(result.sourceUrl, `${source.pageUrl}#/courses/course-pid`);
  assert.throws(() => normalizeCatalogCourse(listing, { ...detail, pid: 'other-course' }, source), /identity mismatch/);
  assert.throws(() => validateCatalogList([listing, listing]), /Duplicate/);
});

test('coverage distinguishes collected courses from missing descriptions and missing detail records', () => {
  const titleOnly = normalizeCatalogCourse(listing, { ...detail, description: '' }, source);
  const report = catalogCoverage([source], [titleOnly]);
  assert.equal(report.collected, 1);
  assert.equal(report.withDescriptions, 0);
  assert.deepEqual(report.titleOnly, ['BIOL 130']);
  assert.equal(catalogCoverage([source], []).levels.undergraduate.collected, 0);
});

test('catalog chunks retain long description tails and support explicit title-only fallback', async () => {
  const countTokens = async (text) => text.split(/\s+/).length + 2;
  const course = normalizeCatalogCourse(listing, { ...detail, description: `${'Cell structure. '.repeat(300)}Final meiosis topic.` }, source);
  const chunks = await createCatalogChunks(course, countTokens);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.tokens <= 256));
  assert.ok(chunks.at(-1).text.includes('Final meiosis topic.'));
  const fallback = await createCatalogChunks(normalizeCatalogCourse(listing, { ...detail, description: '' }, source), countTokens);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].quality, 'title-only');
  assert.equal(fallback[0].text, 'Biology. Cell Biology.');
});

test('catalog preview rejects missing course coverage and corrupt vector files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'course-catalog-'));
  try {
    const vector = new Float32Array(EMBEDDING_DIMENSIONS);
    vector[0] = 1;
    const bytes = encodeOutlineVectors([vector], EMBEDDING_DIMENSIONS);
    const course = normalizeCatalogCourse(listing, detail, source);
    const manifest = { version: 1, kind: 'course-catalog', encoder: { modelKey: MODEL_KEY, dimensions: EMBEDDING_DIMENSIONS, encodingVersion: 'catalog-v1' },
      courses: [course], chunks: [{ courseKey: course.key, vectorIndex: 0 }], vectorHashes: ['text-hash'], vectorFile: 'vectors.f32', vectorFileHash: hash(bytes) };
    await writeFile(join(directory, 'vectors.f32'), bytes);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    assert.equal((await readCatalogBundle(directory)).vectors.length, 1);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, chunks: [] }));
    await assert.rejects(readCatalogBundle(directory), /cover/);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(directory, 'vectors.f32'), new Uint8Array(bytes.length));
    await assert.rejects(readCatalogBundle(directory), /checksum/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
