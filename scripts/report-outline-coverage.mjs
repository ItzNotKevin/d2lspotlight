import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(process.argv[2] || 'outline-data/collected/F26');
const collection = JSON.parse(await readFile(resolve(directory, 'collection.json'), 'utf8'));
const outlines = JSON.parse(await readFile(resolve(directory, 'outlines.json'), 'utf8'));
let embeddings;
try { embeddings = JSON.parse(await readFile('outline-data/embeddings/manifest.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const embedded = new Set((embeddings?.outlines || []).map(outline => outline.id));
const catalog = JSON.parse(await readFile('outline-data/catalog-embeddings/manifest.json', 'utf8'));
const codes = new Set(outlines.flatMap(outline => outline.courseCodes || [outline.course]));
const coverage = { createdAt: new Date().toISOString(), term: collection.term, scope: 'Viewer records discovered from current calendar subjects for this term only; not every course or historical outline.',
  statistics: { subjects: Object.keys(collection.subjects).length, failedSubjects: Object.values(collection.subjects).filter(row => row.status === 'failed').length,
    discovered: Object.keys(collection.records).length, captured: outlines.length, embedded: outlines.filter(outline => embedded.has(outline.id)).length,
    failedCaptures: Object.values(collection.records).filter(row => row.status === 'failed').length, unavailable: collection.unavailable.length,
    courseCodes: codes.size, parsedWeeklyPlans: outlines.filter(outline => outline.weeks.length).length,
    weeklyPlansWithTopicText: outlines.filter(outline => outline.weeks.some(week => week.topics)).length,
    teachingPlansWithTopicText: outlines.filter(outline => outline.weeks.some(week => week.topics) || outline.scheduleEntries?.some(entry => entry.topics)).length,
    parsedTeachingPlans: outlines.filter(outline => outline.weeks.length || outline.scheduleEntries?.length).length,
    parsedTeachingPlansPercent: Number((100 * outlines.filter(outline => outline.weeks.length || outline.scheduleEntries?.length).length / outlines.length).toFixed(2)),
    parsedWeeklyPlansPercent: Number((100 * outlines.filter(outline => outline.weeks.length).length / outlines.length).toFixed(2)),
    scheduleKinds: Object.fromEntries(['week', 'lecture', 'module', 'unit', 'chapter', 'dated', 'topic'].map(kind => [kind,
      outlines.filter(outline => kind === 'week' ? outline.weeks.length : outline.scheduleEntries?.some(entry => entry.kind === kind)).length])),
    scheduleStatuses: Object.fromEntries([...new Set(outlines.map(outline => outline.scheduleStatus || 'legacy'))].map(status => [status, outlines.filter(outline => outline.scheduleStatus === status).length])),
    parsedWeeksWithDates: outlines.reduce((sum, outline) => sum + outline.weeks.filter(week => week.dateLabels.length).length, 0),
    retainedUnparsedSchedules: outlines.filter(outline => outline.unparsedSchedule?.length).length },
  courses: [...new Set(catalog.courses.map(course => course.code))].map(code => ({ code, outlines: outlines.filter(outline => (outline.courseCodes || [outline.course]).includes(code)).map(outline => ({ id: outline.id, term: outline.term, sections: outline.sections, sourceUrl: outline.sourceUrl,
    status: embedded.has(outline.id) ? 'embedded' : 'captured', weeks: outline.weeks.length, warnings: outline.warnings })),
    fallback: !codes.has(code) ? 'academic-calendar' : 'academic-calendar only if term/section does not match' })) };
await writeFile('outline-data/catalog-embeddings/outline-coverage.json', JSON.stringify(coverage, null, 2));
await writeFile(resolve(directory, 'coverage.json'), JSON.stringify({ ...coverage, courses: undefined }, null, 2));
console.log(JSON.stringify(coverage.statistics, null, 2));
