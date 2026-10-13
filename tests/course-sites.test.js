import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { detectCourseSites, validateCourseSite, sitePageUrl, crawlCourseSite, fetchSiteHtml, MAX_HTML_BYTES, MAX_SITE_PAGES, siteKey } from '../src/sites/core.js';
import { parseCoursePage } from '../src/sites/parse.js';
import { createIndexStore } from '../src/learn/cache.js';
import { searchResources } from '../src/learn/search.js';
import { registerCourseSites } from '../src/sites/background.js';

const base = 'https://student.cs.uwaterloo.ca/~cs246/F26/';
const course = { id: '246', code: 'CS_246_001_F26', name: 'CS 246 Fall 2026' };
const site = validateCourseSite(`${base}index.shtml`, course);
const html = `<html><head><title>CS 246 - Software Development</title></head><body>
<nav><a href="schedule.shtml">Schedule</a><a href="https://uwaterloo.ca">University</a></nav>
<main><h1>Assignment Information</h1><p>Assignments use the course repository.</p>
<h2 id="lates">Lates</h2><!-- Invisible template instructions must not be indexed. --><p>Late submissions receive no credit.</p>
<h2>Outline</h2><p>Use the <a href="https://outline.uwaterloo.ca/viewer/view/public-test">course outline</a> for assessment dates.</p>
<script>window.shouldNeverRun = true;</script><form><input value="private"></form></main></body></html>`;
const parse = (body, url) => parseCoursePage(body, url, DOMParser);

test('course notices discover only matching Waterloo CS course and term URLs', () => {
  const sites = detectCourseSites([{ url: site.url, context: 'CS 246 does not use LEARN. Course webpage.' },
    { url: `${base}schedule.shtml` }, { url: site.url.replace('F26', 'W26') },
    { url: site.url.replace('cs246', 'cs245') }, { url: 'https://student.cs.uwaterloo.ca.evil.test/~cs246/F26/index.shtml' }], course);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].root, base);
  assert.match(sites[0].reason, /notice/);
  for (const url of ['http://student.cs.uwaterloo.ca/~cs246/F26/index.shtml', 'https://user@student.cs.uwaterloo.ca/~cs246/F26/index.shtml', `${site.url}?secret=x`]) assert.throws(() => validateCourseSite(url, course));
  assert.equal(sitePageUrl('../W26/index.shtml', site), null);
  assert.equal(sitePageUrl('notes.pdf', site), null);
  assert.equal(sitePageUrl('assignments.shtml#lates', site), `${base}assignments.shtml`);
});

test('HTML parsing separates navigation, section passages, anchors and linked references without executing scripts', () => {
  const parsed = parse(html, `${base}assignments.shtml`);
  assert.equal(parsed.title, 'Assignment Information');
  assert.equal(parsed.courseCode, 'CS 246');
  assert.ok(!parsed.intro.includes('Schedule'));
  assert.ok(!parsed.intro.includes('shouldNeverRun'));
  assert.ok(parsed.links.some(link => link.url === `${base}schedule.shtml`));
  assert.equal(parsed.sections.find(section => section.title === 'Lates').url, `${base}assignments.shtml#lates`);
  assert.ok(!parsed.sections.some(section => section.text.includes('Invisible template')));
  assert.ok(parsed.sections.find(section => section.title === 'Outline').url.includes('#:~:text='));
  assert.equal(parsed.links.find(link => link.label === 'University').reference, false);
});

test('a short Course Outline pointer opens the observed official outline; instruction pages retain their own route', () => {
  const pointer = '<title>CS 246</title><main><h1>Course Outline</h1><p>The outline is <a href="https://outline.uwaterloo.ca/viewer/view/official">here</a>.</p></main>';
  assert.equal(parse(pointer, `${base}outline.shtml`).forwardUrl, 'https://outline.uwaterloo.ca/viewer/view/official');
  assert.equal(parse(pointer.replace('</main>', '<h2>Instructions</h2><p>Review these instructions.</p></main>'), `${base}outline.shtml`).forwardUrl, null);
  assert.equal(parse(pointer.replace('</main>', '<p>Read the grading instructions first.</p></main>'), `${base}outline.shtml`).forwardUrl, null);
});

test('bounded crawler follows term-local navigation and body search opens the intended section with normal filters', async () => {
  const loaded = [];
  const result = await crawlCourseSite(site, course, 'A', { signal: new AbortController().signal,
    loadPage: async url => { loaded.push(url); return url.endsWith('schedule.shtml') ? '<title>CS 246</title><main><h1>Schedule</h1><p>See the outline for deadlines.</p></main>' : html; }, parsePage: parse });
  assert.equal(loaded.length, 2);
  const match = searchResources(result.resources, { query: 'cs246 late policy', source: 'Website', courseId: '246' })[0];
  assert.equal(match.url, `${base}index.shtml#lates`);
  assert.equal(match.source, 'Website');
  assert.ok(searchResources(result.resources, { query: 'cs246 deadlines' }).length);
  assert.ok(result.resources.some(resource => resource.websiteReference && resource.url.includes('outline.uwaterloo.ca')));
  assert.ok(!result.resources.some(resource => resource.url === 'https://uwaterloo.ca/'));
  assert.deepEqual(searchResources(result.resources, { query: 'cs245 late policy' }), []);
  assert.deepEqual(searchResources(result.resources, { query: 'late policy', source: 'LEARN' }), []);
});

test('crawler marks paging/failures partial, does not fetch external references and respects cancellation', async () => {
  const links = Array.from({ length: 20 }, (_, index) => `<a href="page${index}.shtml">Page ${index}</a>`).join('');
  const loaded = [];
  const result = await crawlCourseSite(site, course, 'A', { signal: new AbortController().signal,
    loadPage: async url => { loaded.push(url); if (url.includes('page0')) throw new Error('temporary'); return `<title>CS 246</title><main><h1>Notes</h1><p>Course material.</p>${links}</main>`; }, parsePage: parse });
  assert.equal(loaded.length, MAX_SITE_PAGES);
  assert.equal(result.partial, true);
  assert.equal(result.failures, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(crawlCourseSite(site, course, 'A', { signal: controller.signal, loadPage() { throw new Error('Should not fetch'); }, parsePage: parse }), { name: 'AbortError' });
});

test('external HTML requests omit credentials, reject non-HTML/oversized responses and never follow redirects', async () => {
  assert.equal(await fetchSiteHtml(site.url, site, { fetchImpl: async (url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  } }), html);
  for (const response of [new Response('PDF', { headers: { 'Content-Type': 'application/pdf' } }),
    new Response(html, { headers: { 'Content-Type': 'text/html', 'Content-Length': String(MAX_HTML_BYTES + 1) } })]) {
    await assert.rejects(fetchSiteHtml(site.url, site, { fetchImpl: async () => response }));
  }
  await assert.rejects(fetchSiteHtml('https://evil.test/', site, { fetchImpl() { throw new Error('Should not fetch'); } }));
});

test('website text survives metadata refresh and recents, and remove/account switch reject in-flight writes', async () => {
  let saved = {};
  const store = createIndexStore({ get: async () => structuredClone(saved), set: async value => { saved = structuredClone(value); } });
  let index = await store('begin', { accountId: 'A' });
  index = await store('commit', { ...index, courses: [course], resources: [] });
  await store('discover-sites', { ...index, sites: [site] });
  await store('begin-site', { ...index, key: siteKey(site), run: 'first' });
  const resource = { id: 'website:A:notes', siteKey: siteKey(site), courseId: course.id, title: 'Late policy', source: 'Website' };
  await store('commit-site', { ...index, key: siteKey(site), run: 'first', resources: [resource], pageCount: 1 });
  await store('opened', { id: resource.id });
  index = await store('commit', index);
  assert.equal(index.siteResources.length, 1);
  assert.ok(index.history[resource.id]);
  await store('begin-site', { ...index, key: siteKey(site), run: 'second' });
  await store('remove-site', { ...index, key: siteKey(site) });
  await assert.rejects(store('commit-site', { ...index, key: siteKey(site), run: 'second', resources: [resource] }), /cancelled|changed/);
  assert.equal((await store('read')).siteResources.length, 0);
  await store('begin', { accountId: 'B' });
  await assert.rejects(store('discover-sites', { ...index, sites: [site] }), /data changed/);
  assert.deepEqual((await store('read')).courseSites, []);
});

test('website broker rejects other extensions/frames/origins and requests permission before awaiting storage', async () => {
  let listener;
  const calls = [];
  const api = { runtime: { id: 'fixture', onMessage: { addListener: value => { listener = value; } } },
    permissions: { request: options => { calls.push(options.origins); return Promise.resolve(false); } } };
  registerCourseSites(() => { throw new Error('Should not read storage after permission denial'); }, api);
  const sender = { id: 'fixture', frameId: 0, tab: { id: 1 }, url: 'https://learn.uwaterloo.ca/d2l/home/246' };
  const message = { type: 'course-site', action: 'include', courseId: course.id, code: course.code, url: site.url };
  for (const invalid of [{ ...sender, id: 'other' }, { ...sender, frameId: 1 }, { ...sender, tab: null }]) {
    assert.equal(listener(message, invalid, () => { throw new Error('Should not reply to unknown contexts'); }), undefined);
  }
  const outside = await new Promise(resolve => listener(message, { ...sender, url: 'https://evil.test/' }, resolve));
  assert.equal(outside.ok, false);
  assert.equal(calls.length, 0);
  const response = new Promise(resolve => listener(message, sender, resolve));
  assert.deepEqual(calls, [['https://student.cs.uwaterloo.ca/*']]);
  assert.match((await response).error, /not granted/);
});

test('account changes during course-home detection cannot persist the old account’s website', async () => {
  let saved = {};
  let listener;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const store = createIndexStore({ get: async () => structuredClone(saved), set: async value => { saved = structuredClone(value); } });
  let index = await store('begin', { accountId: 'A' });
  index = await store('commit', { ...index, courses: [course], resources: [] });
  const sender = { id: 'fixture', frameId: 0, tab: { id: 1 }, url: 'https://learn.uwaterloo.ca/d2l/home/246' };
  registerCourseSites(store, { runtime: { id: 'fixture', onMessage: { addListener: value => { listener = value; } } },
    scripting: { executeScript: async () => { await gate; return [{ result: { url: sender.url, links: [{ url: site.url }] } }]; } } });
  const response = new Promise(resolve => listener({ type: 'course-site', action: 'discover', accountId: 'A', generation: index.generation }, sender, resolve));
  // Let the broker finish its initial serialized read before switching account.
  await new Promise(resolve => setImmediate(resolve));
  await store('begin', { accountId: 'B' });
  release();
  assert.equal((await response).ok, false);
  assert.deepEqual((await store('read')).courseSites, []);
});
