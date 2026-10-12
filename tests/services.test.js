import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyService, knownLinks, canOpenResource, extractKnownLinks } from '../src/services.js';
import { normalizeToc } from '../src/learn/normalize.js';
import { normalizePosts } from '../src/piazza/client.js';
import { searchResources } from '../src/learn/search.js';

test('recognizes Möbius by hostname and rejects spoofed hosts and credential links', () => {
  assert.equal(identifyService('https://uwaterloo.mapleserver.com/class/123').name, 'Möbius');
  assert.equal(identifyService('https://uwmo.mobius.cloud/lti/advantage').name, 'Möbius');
  assert.equal(identifyService('https://uwmo.mobius.cloud.evil.example/lti/advantage'), null);
  for (const url of ['https://mapleserver.com.evil.example/', 'https://evilmapleserver.com/', 'javascript:alert(1)', 'http://uwaterloo.mapleserver.com/', 'https://user:secret@uwaterloo.mapleserver.com/', 'https://uwaterloo.mapleserver.com/?session_id=secret']) {
    assert.equal(identifyService(url), null);
    assert.equal(canOpenResource(url), false);
  }
  assert.equal(canOpenResource('https://piazza.com/class/example'), true);
  assert.equal(canOpenResource('not a url'), false);
});

test('classifies vague anchor candidates without trusting misleading anchor text', () => {
  const links = knownLinks([
    { href: 'https://uwaterloo.mapleserver.com/class/123', label: 'here' },
    { href: 'https://uwaterloo.mapleserver.com/class/123', label: 'duplicate' },
    { href: 'https://example.com/', label: 'Möbius' }
  ], 'https://piazza.com');
  assert.equal(links.length, 1);
  assert.equal(links[0].label, 'here');
  assert.equal(links[0].name, 'Möbius');
});

test('recognizes bare URLs and makes a vague Piazza post and its direct link searchable', () => {
  assert.equal(extractKnownLinks('Go to https://uwaterloo.mapleserver.com/class/123.', 'https://piazza.com')[0].url, 'https://uwaterloo.mapleserver.com/class/123');
  const resources = normalizePosts([{ nr: 1, subject: 'Click here', content_snipet: 'https://uwaterloo.mapleserver.com/class/123' }], 'example', (value) => String(value || ''));
  assert.equal(resources.length, 2);
  assert.equal(resources[1].parentUrl, resources[0].url);
  assert.equal(resources[1].type, 'LINK');
  assert.equal(searchResources(resources, { query: 'mobius' }).length, 2);
  assert.equal(searchResources(resources, { query: 'Möbius' }).length, 2);
});

test('adds service aliases to LEARN metadata while preserving its authenticated launch route', () => {
  const resources = normalizeToc({ Modules: [{ Title: 'Practice', Topics: [{ TopicId: 1, Title: 'Open activity', Url: 'https://uwaterloo.mapleserver.com/class/123' }] }] }, { id: '100', code: 'MATH 135' }, 'user');
  assert.equal(resources[0].service, 'Möbius');
  assert.equal(resources[0].url, 'https://learn.uwaterloo.ca/d2l/le/content/100/viewContent/1/View');
  assert.equal(searchResources(resources, { query: 'mobius' }).length, 1);
});
