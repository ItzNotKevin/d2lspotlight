import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { calendarConfiguration, validateCatalogList, normalizeCatalogCourse, catalogCoverage } from '../src/search/catalog/academic.js';
import { root, hash, atomicJson } from './outline-runtime.mjs';

let directory = resolve(root, 'outline-data', 'catalog');
let refresh = false;
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index];
  if (argument === '--help') {
    console.log('npm run update:course-catalog -- [--out DIRECTORY] [--refresh]');
    process.exit(0);
  }
  if (argument === '--refresh') refresh = true;
  else if (argument === '--out') {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error('Missing output directory.');
    directory = resolve(value);
  } else throw new Error(`Unknown option ${argument}.`);
}

async function request(url, json = true) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { Accept: json ? 'application/json' : 'text/html' } });
      if (response.ok) return json ? await response.json() : await response.text();
      if (response.status !== 429 && response.status < 500) throw new Error(`Request failed with HTTP ${response.status}: ${url}`);
    } catch (error) {
      if (attempt === 3 || response && response.status !== 429 && response.status < 500) throw error;
    }
    if (attempt === 3) throw new Error(`Request retries exhausted: ${url}`);
    const retryAfter = Number(response?.headers.get('retry-after'));
    await delay(Math.min(30000, retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
  }
}

await mkdir(directory, { recursive: true });
const lockPath = resolve(directory, 'collection.lock');
const lock = await open(lockPath, 'wx').catch((error) => {
  if (error.code === 'EEXIST') throw new Error('Another catalog collection is using this directory.');
  throw error;
});
try {
  const sources = [];
  const jobs = [];
  for (const level of ['undergraduate', 'graduate']) {
    const pageUrl = `https://uwaterloo.ca/academic-calendar/${level}-studies/catalog`;
    const configuration = calendarConfiguration(await request(pageUrl, false), pageUrl, level);
    const metadata = await request(`${configuration.apiBase}/public/catalogs/${configuration.id}`);
    if (metadata._id !== configuration.id || typeof metadata.title !== 'string') throw new Error('Unexpected calendar metadata.');
    const listings = validateCatalogList(await request(`${configuration.apiBase}/courses/${configuration.id}?q=`));
    if (listings.length < (level === 'undergraduate' ? 2000 : 500)) throw new Error(`The ${level} list is unexpectedly small; existing snapshots were kept.`);
    const source = { ...configuration, title: metadata.title, listed: listings.length,
      listUrl: `${configuration.apiBase}/courses/${configuration.id}?q=`, listHash: hash(JSON.stringify(listings)) };
    sources.push(source);
    const cacheDirectory = resolve(directory, 'details', configuration.id);
    await mkdir(cacheDirectory, { recursive: true });
    await atomicJson(resolve(directory, `${level}-list.json`), { source, listings });
    listings.forEach((listing) => jobs.push({ source, listing, path: resolve(cacheDirectory, `${listing.id}.json`) }));
    console.log(`${metadata.title}: ${listings.length} courses.`);
  }
  const courses = new Array(jobs.length);
  const failures = [];
  let next = 0;
  let completed = 0;
  let reused = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const index = next++;
      const { source, listing, path } = jobs[index];
      try {
        let detail;
        if (!refresh) {
          try {
            const cached = JSON.parse(await readFile(path, 'utf8'));
            const age = Date.now() - Date.parse(cached.fetchedAt);
            if (cached.catalogId === source.id && cached.listingHash === hash(JSON.stringify(listing)) && age >= 0 && age < 86400000) {
              normalizeCatalogCourse(listing, cached.detail, source);
              detail = cached.detail;
              reused++;
            }
          } catch (error) {
            if (error.code !== 'ENOENT') console.log(`Refreshing cached detail for ${listing.__catalogCourseId}: ${error.message}`);
          }
        }
        if (!detail) {
          detail = await request(`${source.apiBase}/course/${source.id}/${encodeURIComponent(listing.pid)}`);
          normalizeCatalogCourse(listing, detail, source);
          await atomicJson(path, { catalogId: source.id, listingHash: hash(JSON.stringify(listing)), fetchedAt: new Date().toISOString(), detail });
          await delay(100);
        }
        courses[index] = normalizeCatalogCourse(listing, detail, source);
      } catch (error) {
        failures.push({ course: listing.__catalogCourseId, catalogId: source.id, error: error.message });
        console.log(`Failed ${listing.__catalogCourseId}: ${error.message}`);
      }
      completed++;
      if (completed % 100 === 0 || completed === jobs.length) console.log(`Collected ${completed}/${jobs.length}; ${reused} cached; ${failures.length} failures.`);
    }
  }));
  const collected = courses.filter(Boolean).sort((a, b) => a.code.localeCompare(b.code) || a.level.localeCompare(b.level));
  const coverage = catalogCoverage(sources, collected);
  await atomicJson(resolve(directory, 'collection-report.json'), { fetchedAt: new Date().toISOString(), sources, coverage, reused, failures });
  if (failures.length || coverage.collected !== coverage.listed) throw new Error('The catalog collection is incomplete. Saved details can be resumed; the previous inventory and bundled titles were kept.');
  await atomicJson(resolve(directory, 'inventory.json'), { version: 1, kind: 'course-catalog', fetchedAt: new Date().toISOString(), sources, coverage, courses: collected });
  const titles = Object.fromEntries(collected.map((course) => [course.code.replace(/ /g, ''), course.title]));
  await atomicJson(resolve(root, 'src', 'search', 'catalog', 'waterloo.json'), {
    source: sources.map((source) => source.pageUrl), fetchedAt: new Date().toISOString(),
    term: sources.map((source) => source.title).join('; '), courses: titles
  });
  console.log(`Saved ${coverage.uniqueCodes} course codes with ${coverage.withDescriptions} descriptions; ${coverage.titleOnly.length} title-only entries. ${resolve(directory, 'inventory.json')}`);
} finally {
  await lock.close();
  await unlink(lockPath);
}
