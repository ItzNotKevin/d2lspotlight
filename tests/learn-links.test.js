import test from 'node:test';
import assert from 'node:assert/strict';
import { linkOnlyTarget, enrichLearnLinks, analyzeLinkPage, descriptionIsEmpty } from '../src/learn/links.js';
import { DOMParser } from 'linkedom';
import { normalizeToc, learnLaunchUrl } from '../src/learn/normalize.js';
import { createLearnClient } from '../src/learn/client.js';
import { identifyService, isContextLaunch, canOpenResource } from '../src/services.js';

const mobius = 'https://uwaterloo.mapleserver.com/class/123';
const parent = 'https://learn.uwaterloo.ca/d2l/le/content/100/viewContent/1/View';
const base = { id: '1', title: 'Möbius', courseId: '100', topicId: '1', type: 'LINK', url: parent, descriptionChecked: true };

test('observed mobius.cloud LTI endpoint keeps context; verified LEARN quicklinks skip the wrapper', async () => {
  const endpoint = 'https://uwmo.mobius.cloud/lti/advantage';
  const quicklink = 'https://learn.uwaterloo.ca/d2l/common/dialogs/quickLink/quickLink.d2l?ou=100&type=lti&rCode=course-link';
  const [external] = await enrichLearnLinks([{ ...base, topicType: 3, targetUrl: endpoint }]);
  assert.equal(external.url, parent);
  const records = normalizeToc({ Modules: [{ Topics: [{ TopicId: 1, TopicType: 3, Title: 'Möbius', Url: quicklink, Description: null }] }] }, { id: '100', code: 'MATH 135' }, 'user');
  const [launch] = await enrichLearnLinks(records);
  assert.equal(launch.url, quicklink);
  assert.equal(launch.directLink, true);
  assert.equal(learnLaunchUrl(quicklink, '999'), null);
  assert.equal(learnLaunchUrl(endpoint, '100'), null);
  assert.equal(learnLaunchUrl(quicklink.replace('learn.uwaterloo.ca', 'evil.example'), '100'), null);
  const [instructions] = await enrichLearnLinks([{ ...records[0], description: 'Read these instructions first' }]);
  assert.equal(instructions.url, parent);
});

// linkedom requires a document wrapper for fragments; browsers supply it.
globalThis.DOMParser = class extends DOMParser {
  parseFromString(html, type) {
    return super.parseFromString(/<html[\s>]/i.test(html) ? html : `<html><head></head><body>${html}</body></html>`, type);
  }
};

test('actual link-only HTML and empty rich-text descriptions qualify for direct opening', async () => {
  const html = `<html><head><script src="/template.js"></script><style>body{color:black}</style></head><body><h1>Möbius</h1><p><a href="${mobius}">Open Möbius</a></p></body></html>`;
  assert.equal(analyzeLinkPage(html, parent, 'Möbius').directUrl, mobius);
  assert.equal(descriptionIsEmpty('<p><br></p><p>&nbsp;</p>'), true);
  assert.equal(descriptionIsEmpty('<p>Read the instructions</p>'), false);
  assert.equal(descriptionIsEmpty('<img src="instructions.png">'), false);
  assert.equal(analyzeLinkPage(`<p>Read first</p><a href="${mobius}">Open</a>`, parent).directUrl, null);
  const [direct] = await enrichLearnLinks([{ ...base, topicType: 3, targetUrl: mobius, description: '<p>&nbsp;</p>' }]);
  assert.equal(direct.url, mobius);
  const [described] = await enrichLearnLinks([{ ...base, topicType: null, descriptionChecked: false }], {
    loadTopic: async () => ({ TopicType: 1, Description: { Html: `<p><a href="${mobius}">Open</a></p>` } })
  });
  assert.equal(described.url, mobius);
});

test('tool candidates get inspected before lecture pages consume the cap, preserving result order', async () => {
  const records = [{ ...base, id: 'notes', title: 'Lecture', contentUrl: 'https://learn.uwaterloo.ca/content/notes.html' },
    { ...base, id: 'tool', descriptionChecked: false, topicType: null }];
  const results = await enrichLearnLinks(records, { maximum: 1,
    loadTopic: async () => ({ TopicType: 3, Url: mobius, Description: null }),
    loadHtml: async () => { throw new Error('Lecture pages should not consume this request'); } });
  assert.deepEqual(results.map((item) => item.id), ['notes', 'tool']);
  assert.equal(results[1].url, mobius);
});

test('only one plain Möbius link on a content-free page qualifies for bypass', () => {
  const links = [identifyService(mobius)];
  assert.equal(linkOnlyTarget({ links, remainingText: '' }), mobius);
  for (const change of [{ remainingText: 'Read this before starting' }, { hasInteractive: true }, { hasMedia: true }, { links: [...links, identifyService('https://github.com/org/repo')] }, { links: [identifyService('https://uwaterloo.mapleserver.com/lti/launch')] }]) {
    assert.equal(linkOnlyTarget({ links, remainingText: '', ...change }), null);
  }
});

test('ordinary Mobius link topics bypass LEARN; LTI, unknown type, and descriptions stay in context', async () => {
  const records = [
    { ...base, topicType: 3, targetUrl: mobius },
    { ...base, id: 'lti', topicType: 3, targetUrl: 'https://uwaterloo.mapleserver.com/lti/launch' },
    { ...base, id: 'unknown', targetUrl: mobius },
    { ...base, id: 'instructions', topicType: 3, targetUrl: mobius, description: 'Read the instructions first' }
  ];
  const results = await enrichLearnLinks(records);
  assert.equal(results[0].url, mobius);
  assert.equal(results[0].parentUrl, parent);
  assert.ok(results.slice(1).every((resource) => resource.url === parent));
});

test('HTML inspection changes only verified empty pages and preserves fallback on failure', async () => {
  const resource = { ...base, contentUrl: 'https://learn.uwaterloo.ca/content/enforced/100/page.html' };
  const direct = await enrichLearnLinks([resource], { loadHtml: async () => '<html/>', analyze: () => ({ links: [identifyService(mobius)], directUrl: mobius }) });
  assert.equal(direct[0].url, mobius);
  const meaningful = await enrichLearnLinks([resource], { loadHtml: async () => '<html/>', analyze: () => ({ links: [identifyService(mobius)], directUrl: null }) });
  assert.equal(meaningful.length, 2);
  assert.ok(meaningful.every((r) => r.url === parent));
  assert.deepEqual(await enrichLearnLinks([resource], { loadHtml: async () => { throw new Error('offline'); } }), [resource]);
});

test('enrichment respects its request cap, cancellations and throttling', async () => {
  let calls = 0;
  const records = Array.from({ length: 5 }, (_, i) => ({ ...base, id: String(i), contentUrl: 'https://learn.uwaterloo.ca/content/page.html' }));
  await enrichLearnLinks(records, { maximum: 2, loadHtml: async () => { calls++; return ''; }, analyze: () => ({ links: [], directUrl: null }) });
  assert.equal(calls, 2);
  await assert.rejects(enrichLearnLinks(records, { loadHtml: async () => { throw Object.assign(new Error('wait'), { code: 'RATE_LIMIT' }); } }), { code: 'RATE_LIMIT' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(enrichLearnLinks(records, { signal: controller.signal }), { name: 'AbortError' });
});

test('HTML download is same-origin, bounded, and does not fetch external tools', async () => {
  const calls = [];
  const client = createLearnClient({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response('<p>example</p>', { headers: { 'Content-Type': 'text/html' } });
  } });
  assert.equal(await client.loadHtml({ contentUrl: 'https://learn.uwaterloo.ca/content/enforced/100/link.html' }), '<p>example</p>');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(client.loadHtml({ contentUrl: mobius }), { code: 'PATH' });
  assert.equal(calls.length, 1);
  const large = createLearnClient({ fetchImpl: async () => new Response('x'.repeat(300000), { headers: { 'Content-Type': 'text/html' } }) });
  await assert.rejects(large.loadHtml({ contentUrl: 'https://learn.uwaterloo.ca/content/link.html' }), { code: 'HTML_SIZE' });
});

test('service recognition expands to observed tool hosts without accepting lookalikes', () => {
  for (const [url, name] of [
    ['https://marmoset.student.cs.uwaterloo.ca/', 'Marmoset'], ['https://app.crowdmark.com/course/123', 'Crowdmark'],
    ['https://www.gradescope.com/courses/123', 'Gradescope'], ['https://github.com/org/repo', 'GitHub'],
    ['https://git.uwaterloo.ca/org/repo', 'GitLab'], ['https://student.cs.uwaterloo.ca/~cs246/', 'Course website']
  ]) { assert.equal(identifyService(url).name, name); assert.equal(canOpenResource(url), true); }
  assert.equal(identifyService('https://app.crowdmark.com.evil.example'), null);
  assert.equal(isContextLaunch('https://uwaterloo.mapleserver.com/lti/launch'), true);
});

test('normalization keeps topic kind and HTML paths for inspection', () => {
  const [resource] = normalizeToc({ Modules: [{ Topics: [{ TopicId: 1, TopicType: 1, Title: 'Practice', Url: '/content/enforced/100/link.html' }] }] }, { id: '100', code: 'MATH 135' }, 'user');
  assert.equal(resource.topicType, 1);
  assert.equal(resource.contentUrl, 'https://learn.uwaterloo.ca/content/enforced/100/link.html');
});

test('table-of-contents entries require topic details before direct bypass', async () => {
  const saved = { ...base, topicType: null, descriptionChecked: false, targetUrl: mobius };
  const result = await enrichLearnLinks([saved], { loadTopic: async () => ({ TopicType: 3, Url: mobius, Description: { Text: '', Html: '' } }) });
  assert.equal(result[0].url, mobius);
  const instructions = await enrichLearnLinks([saved], { loadTopic: async () => ({ TopicType: 3, Url: mobius, Description: { Html: '<p>Do the practice first.</p>' } }) });
  assert.equal(instructions[0].url, parent);
  const incomplete = await enrichLearnLinks([saved], { loadTopic: async () => ({ TopicType: 3, Url: mobius }) });
  assert.equal(incomplete[0].url, parent);
});

test('topic details are fetched only through validated course/topic API identifiers', async () => {
  let path;
  const client = createLearnClient({ fetchImpl: async (url) => { path = url; return Response.json({ TopicType: 3, Description: null, Url: mobius }); } });
  await client.loadTopic('1.82', base);
  assert.equal(path, '/d2l/api/le/1.82/100/content/topics/1');
  await assert.rejects(client.loadTopic('1.82', { ...base, topicId: '../other' }), { code: 'PATH' });
});
