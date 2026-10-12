import test from 'node:test';
import assert from 'node:assert/strict';
import { classFromUrl, normalizePosts, searchPiazza, summarizeApiError } from '../src/piazza/client.js';

test('detects class only from Piazza class URLs', () => {
  assert.equal(classFromUrl('https://piazza.com/class/example123?cid=96'), 'example123');
  assert.equal(classFromUrl('https://example.com/class/example123'), '');
  assert.equal(classFromUrl('https://piazza.com/'), '');
});

test('search uses the observed RPC envelope and session credentials', async () => {
  let request;
  const diagnostics = [];
  const posts = await searchPiazza({ getCsrfToken: async () => 'fixture-token', classId: 'class123', query: ' ass ', onDiagnostic: (data) => diagnostics.push(data), fetchImpl: async (path, options) => {
    request = { path, options };
    return Response.json({ result: [{ nr: 96, subject: 'Private title' }], error: null });
  } });
  assert.equal(request.path, '/logic/api?method=network.search');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(request.options.body), { method: 'network.search', params: { nid: 'class123', sort: 'date_desc', query: 'ass' } });
  assert.equal(posts.length, 1);
  assert.deepEqual(diagnostics, [{ method: 'network.search', status: 200, result: 'OK', csrfHeaderPresent: true, count: 1 }]);
});

test('handles API errors within HTTP 200 without exposing server secrets', async () => {
  await assert.rejects(searchPiazza({ getCsrfToken: async () => 'fixture-token', classId: 'class123', query: 'a', fetchImpl: async () => Response.json({ error: 'secret server detail' }) }), (error) => error.code === 'API_ERROR' && !error.message.includes('secret'));
});

test('handles denied access, throttling, login HTML and invalid result shapes', async () => {
  for (const [response, code] of [
    [new Response('', { status: 403 }), 'AUTH'],
    [new Response('', { status: 429 }), 'RATE_LIMIT'],
    [new Response('<html>login</html>'), 'NOT_JSON'],
    [Response.json({ error: null, result: {} }), 'SCHEMA']
  ]) await assert.rejects(searchPiazza({ getCsrfToken: async () => 'fixture-token', classId: 'class123', query: 'a', fetchImpl: async () => response }), { code });
});

test('normalizes optional fields and generates trusted post links', () => {
  const posts = normalizePosts([{ nr: 96, subject: 'Title', content_snipet: 'Preview' }, { nr: 96 }, { nr: 97 }, { nr: 'bad' }], 'class123', (value) => String(value || ''));
  assert.equal(posts.length, 2);
  assert.equal(posts[0].path, 'Preview');
  assert.equal(posts[0].url, 'https://piazza.com/class/class123?cid=96');
  assert.equal(posts[1].title, 'Post @97');
});

test('cancellation does not turn into a misleading diagnostic error', async () => {
  const controller = new AbortController();
  controller.abort();
  const entries = [];
  await assert.rejects(searchPiazza({ getCsrfToken: async () => 'fixture-token', classId: 'class123', query: 'a', signal: controller.signal, onDiagnostic: (entry) => entries.push(entry), fetchImpl: async (_, options) => options.signal.throwIfAborted() }), { name: 'AbortError' });
  assert.deepEqual(entries, []);
});


test('attaches CSRF header without disclosing its value in diagnostics', async () => {
  const entries = [];
  await searchPiazza({ getCsrfToken: async () => 'fixture-token', classId: 'class123', query: 'a', getCsrfToken: () => 'test-secret-value', onDiagnostic: (entry) => entries.push(entry), fetchImpl: async (_, options) => {
    assert.equal(options.headers['CSRF-Token'], 'test-secret-value');
    return Response.json({ error: null, result: [] });
  } });
  assert.equal(entries[0].csrfHeaderPresent, true);
  assert.ok(!JSON.stringify(entries).includes('test-secret-value'));
});

test('classifies server errors without copying their raw contents', () => {
  assert.deepEqual(summarizeApiError({ code: 403, message: 'CSRF failed for secret-value' }), { category: 'CSRF', errorType: 'object', serverCode: 403 });
  assert.equal(summarizeApiError('not logged in').category, 'AUTH');
  assert.equal(summarizeApiError('private unknown text').category, 'UNKNOWN');
  assert.equal(summarizeApiError('Request not valid').category, 'REQUEST');
});


test('missing token prevents an invalid API call', async () => {
  const diagnostics = [];
  await assert.rejects(searchPiazza({ classId: 'class123', query: 'a', getCsrfToken: async () => '',
    onDiagnostic: (entry) => diagnostics.push(entry), fetchImpl: async () => assert.fail('must not fetch') }), { code: 'CSRF_UNAVAILABLE' });
  assert.equal(diagnostics[0].csrfHeaderPresent, false);
});

test('cancelling while obtaining the token prevents search', async () => {
  const controller = new AbortController();
  await assert.rejects(searchPiazza({ classId: 'class123', query: 'a', signal: controller.signal,
    getCsrfToken: async () => { controller.abort(); return 'fixture'; },
    fetchImpl: async () => assert.fail('must not fetch') }), { name: 'AbortError' });
});
