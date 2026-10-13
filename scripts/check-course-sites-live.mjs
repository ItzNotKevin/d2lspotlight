import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { crawlCourseSite, fetchSiteHtml, validateCourseSite } from '../src/sites/core.js';
import { parseCoursePage } from '../src/sites/parse.js';
import { searchResources } from '../src/learn/search.js';

const course = { id: 'public-check', code: 'CS_246_001_F26', name: 'CS 246 Fall 2026' };
const site = validateCourseSite('https://student.cs.uwaterloo.ca/~cs246/F26/index.shtml', course);
const signal = AbortSignal.timeout(60000);
const result = await crawlCourseSite(site, course, 'public-fixture', { signal,
  loadPage: url => fetchSiteHtml(url, site, { signal }),
  parsePage: (html, url) => parseCoursePage(html, url, DOMParser) });
const matches = Object.fromEntries(['cs246 late policy', 'cs246 office hours', 'cs246 schedule', 'cs246 course outline'].map(query =>
  [query, searchResources(result.resources, { query, courseId: course.id, source: 'Website' }).slice(0, 3).map(resource => ({ title: resource.title, url: resource.url }))]));
for (const [query, resources] of Object.entries(matches)) assert.ok(resources.length, `Real site must match ${query}`);
assert.ok(matches['cs246 late policy'][0].url.includes('assignments.shtml#'));
assert.ok(result.resources.some(resource => resource.websiteReference && resource.url.startsWith('https://outline.uwaterloo.ca/')));
console.log(JSON.stringify({ site: site.url, pages: result.pageCount, resources: result.resources.length, partial: result.partial, failures: result.failures, matches }, null, 2));
