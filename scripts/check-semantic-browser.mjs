import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { CACHE_DATABASE } from '../src/search/semantic/config.js';

const browserPath = process.env.SEMANTIC_BROWSER_PATH;
if (!browserPath) throw new Error('Set SEMANTIC_BROWSER_PATH to a Chromium or Chrome for Testing executable.');
const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'spotlight-semantic-browser-'));
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run', '--no-default-browser-check', 'about:blank']);
let socket;
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser startup timed out.')), 20000);
    browser.on('error', reject);
    browser.on('exit', () => reject(new Error('Browser exited during startup.')));
    browser.stderr.on('data', (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolveSocket, reject) => { socket.onopen = resolveSocket; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data);
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.error) request.reject(new Error(response.error.message));
    else request.resolve(response.result);
  };
  const call = (method, params = {}, sessionId) => new Promise((resolveCall, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 60000);
    pending.set(id, { resolve: resolveCall, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  let target;
  for (let attempt = 0; attempt < 20; attempt++) {
    const { targetInfos } = await call('Target.getTargets');
    target = targetInfos.find((item) => item.type === 'service_worker' && item.url.endsWith('/background.js'));
    if (target) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  assert.ok(target, 'Extension background worker should load.');
  const { sessionId } = await call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await call('Runtime.enable', {}, sessionId);
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const manifest = await evaluate('chrome.runtime.getManifest()');
  assert.ok(manifest.permissions.includes('offscreen'), JSON.stringify(manifest));
  const available = await evaluate('typeof chrome.offscreen');
  assert.notEqual(available, 'undefined', `Offscreen API unavailable: ${JSON.stringify(await call('Browser.getVersion'))}`);
  await evaluate(`chrome.offscreen.createDocument({url: 'semantic.html', reasons: ['WORKERS'], justification: 'Validate local semantic search.'})`);
  const resources = [
    { id: 'notes', title: 'Enumeration', course: 'MATH239_instructor_term_section_1269', path: 'Course Notes', type: 'PDF', source: 'LEARN', accountId: 'test-only' },
    { id: 'chemistry', title: 'Organic chemistry lab manual', course: 'Chemistry', path: 'Laboratory safety', type: 'PDF', source: 'LEARN', accountId: 'test-only' }
  ];
  const payload = { target: 'semantic-offscreen', action: 'search', client: 'smoke-test', requestId: 'first',
    query: 'combinatorics textbook', resources, allowedIds: ['notes', 'chemistry'], fingerprint: 'test-corpus' };
  const response = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify(payload)})`);
  assert.equal(response.ok, true, response.error);
  assert.equal(response.matches[0]?.id, 'notes');
  assert.equal(response.matches.some((match) => match.id === 'chemistry'), false);
  const started = performance.now();
  const repeated = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ ...payload, requestId: 'second' })})`);
  assert.deepEqual(repeated.matches, response.matches);
  const warmMs = performance.now() - started;
  const topicOnly = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ ...payload, requestId: 'topic', query: 'combinatorics' })})`);
  assert.equal(topicOnly.matches.some((match) => match.id === 'notes'), true, 'The title view should recover the topic without the textbook keyword.');
  const notesQuery = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ ...payload, requestId: 'notes-query', query: 'combinatorics notes' })})`);
  assert.equal(notesQuery.matches[0]?.id, 'notes', 'Full-phrase and topic views must retain the relevant resource.');
  assert.ok(notesQuery.matches[0].courseScore > .5, 'The query must be scored against the Combinatorics course independently.');
  const latestQuery = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ ...payload, requestId: 'latest-query', query: 'latest combinatorics notes' })})`);
  assert.deepEqual(latestQuery.matches, notesQuery.matches, 'Date words must not change the semantic topic being retrieved.');
  const filtered = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ ...payload, requestId: 'third', allowedIds: ['chemistry'] })})`);
  assert.equal(filtered.matches.length, 0);
  const cacheCount = () => evaluate(`new Promise((resolveCount, reject) => {
    const request = indexedDB.open(${JSON.stringify(CACHE_DATABASE)}, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const count = db.transaction('vectors').objectStore('vectors').count();
      count.onsuccess = () => { db.close(); resolveCount(count.result); };
      count.onerror = () => reject(count.error);
    };
  })`);
  assert.equal(await cacheCount(), 6);
  await evaluate('chrome.offscreen.closeDocument()');
  await evaluate(`chrome.offscreen.createDocument({url: 'semantic.html', reasons: ['WORKERS'], justification: 'Validate cached semantic search after a restart.'})`);
  const restarted = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ ...payload, requestId: 'restarted' })})`);
  assert.deepEqual(restarted.matches, response.matches);
  assert.equal(await cacheCount(), 6);
  const cleared = await evaluate(`chrome.runtime.sendMessage({target: 'semantic-offscreen', action: 'clear'})`);
  assert.equal(cleared.ok, true);
  assert.equal(await cacheCount(), 0);
  console.log(JSON.stringify({ browserWorker: 'passed', result: response.matches[0], topicOnly: 'passed', warmSearchMs: Math.round(warmMs),
    filters: 'passed', cachePersistenceAndClearing: 'passed' }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  await new Promise((resolveExit) => {
    if (browser.exitCode !== null) resolveExit();
    else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000); }
  });
  await rm(profile, { recursive: true, force: true });
}
