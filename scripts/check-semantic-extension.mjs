import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const project = resolve('.');
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<h1>Isolated extension test</h1>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(`${tmpdir()}/spotlight-semantic-`);
const browser = spawn(process.env.SPOTLIGHT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let sequence = 0, buffered = '';
const pending = new Map();
const pageErrors = [];
browser.stdio[4].on('data', (data) => {
  buffered += data.toString();
  let end;
  while ((end = buffered.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffered.slice(0, end)); buffered = buffered.slice(end + 1);
    if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails);
    const entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); clearTimeout(entry.timer); message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result); }
  }
});
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser check timed out: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
    browser.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
}
try {
  {
    const { id } = await call('Extensions.loadUnpacked', { path: project });
    const { targetId } = await call('Target.createTarget', { url: origin });
    const { sessionId: pageSession } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Runtime.enable', {}, pageSession);
    await call('Page.bringToFront', {}, pageSession);
    for (let attempt = 0; attempt < 40; attempt++) {
      const ready = await call('Runtime.evaluate', { expression: "document.readyState === 'complete' && document.body?.textContent.includes('Isolated extension test')", returnByValue: true }, pageSession);
      if (ready.result.value) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    let tab;
    for (let attempt = 0; attempt < 30 && !tab; attempt++) {
      tab = (await call('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.find((target) => target.url.startsWith(origin));
      if (!tab) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(tab, 'Fixture tab must be available');
    await call('Extensions.triggerAction', { id, targetId: tab.targetId });
    async function assertSpotlightOpen() {
      let open = false;
      for (let attempt = 0; attempt < 40 && !open; attempt++) {
        const result = await call('Runtime.evaluate', { expression: "Boolean(document.getElementById('learn-spotlight-root')?.shadowRoot?.querySelector('[role=dialog]'))", returnByValue: true }, pageSession);
        open = result.result.value;
        if (!open) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(open, true, `Spotlight dialog must render: ${JSON.stringify(pageErrors)}`);
    }
    let worker;
    for (let attempt = 0; attempt < 30 && !worker; attempt++) {
      worker = (await call('Target.getTargets')).targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`));
      if (!worker) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(worker, 'Extension service worker must start');
    const { sessionId } = await call('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
    await call('Runtime.enable', {}, sessionId);
    await call('Runtime.runIfWaitingForDebugger', {}, sessionId);
    for (let attempt = 0; attempt < 30; attempt++) {
      const ready = await call('Runtime.evaluate', { expression: "typeof chrome !== 'undefined' && Boolean(chrome.runtime)", returnByValue: true }, sessionId);
      if (ready.result.value) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const injection = await call('Runtime.evaluate', { expression: `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('${origin}'));
      return chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', files: ['dist/spotlight.js'] });
    })()`, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(injection.exceptionDetails, undefined, JSON.stringify(injection));
    await assertSpotlightOpen();
    await call('Runtime.evaluate', { expression: `chrome.storage.local.set({ learnSpotlightIndexV1: { version: 1, accountId: 'fixture-account', generation: 'fixture', courses: [], resources: [ { id: 'counting', title: 'Combinatorics: permutations and combinations, counting arrangements', course: 'MATH239', courseId: '239', path: '', type: 'PDF' }, { id: 'cpp', title: 'C++ inheritance and virtual destructors', course: 'CS246', courseId: '246', path: '', type: 'PDF' } ], history: {}, failedCourses: [] } })`, awaitPromise: true }, sessionId);
    const result = await call('Runtime.evaluate', { expression: `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('${origin}'));
      if (!tab) throw new Error('Active tab permission was not granted');
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        return chrome.runtime.sendMessage({ type: 'semantic-search', requestId: 'fixture', query: 'counting ways to arrange objects', filters: {} });
      } });
      return result[0].result;
    })()`, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    assert.equal(result.result.value.ok, true, JSON.stringify(result.result.value));
    assert.equal(result.result.value.matches[0].id, 'counting');
    let catalogManifest;
    try { catalogManifest = JSON.parse(await readFile(resolve(project, 'dist/catalog/manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (catalogManifest) assert.equal(result.result.value.catalogCourses, Object.keys(catalogManifest.courses).length, 'Worker must load and verify the packaged catalog');
    let outlineManifest;
    try { outlineManifest = JSON.parse(await readFile(resolve(project, 'dist/outlines/manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (outlineManifest) assert.equal(result.result.value.outlineCourses, Object.keys(outlineManifest.courses).length, 'Worker must load and verify the packaged real outlines');
    console.log(JSON.stringify({ extensionOffscreenInference: 'passed', ...result.result.value }));
    const probabilityOutline = outlineManifest?.courses.STAT230?.outlines.find(outline => outline.term === 'Fall 2026' && outline.sections.includes('001') && outline.weeks?.[5]);
    if (probabilityOutline) {
      await call('Runtime.evaluate', { expression: `chrome.storage.local.set({ learnSpotlightIndexV1: { version: 1, accountId: 'fixture-account', generation: 'outline-fixture', courses: [], resources: [
        { id: 'week5', title: 'week_05_annotated', course: 'STAT_230_001_F26', courseId: '230', path: '', type: 'SLIDES' },
        { id: 'week6', title: 'week_06_annotated', course: 'STAT_230_001_F26', courseId: '230', path: '', type: 'SLIDES' }
      ], history: {}, failedCourses: [] } })`, awaitPromise: true }, sessionId);
      const topic = await call('Runtime.evaluate', { expression: `(async () => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('${origin}'));
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () =>
          chrome.runtime.sendMessage({ type: 'semantic-search', requestId: 'outline-fixture', query: 'probability mass functions notes', filters: {} }) });
        return results[0].result;
      })()`, awaitPromise: true, returnByValue: true }, sessionId);
      assert.equal(topic.result.value?.ok, true, JSON.stringify(topic));
      assert.equal(topic.result.value.matches[0]?.id, 'week5');
      assert.equal(topic.result.value.matches[0]?.outlineWeek?.week, 5);
      console.log(JSON.stringify({ outlineWeekRetrieval: 'passed', ...topic.result.value }));
    }
    const clearing = await call('Runtime.evaluate', { expression: `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('${origin}'));
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => chrome.runtime.sendMessage({ type: 'learn-index', action: 'clear' }) });
      if (!result[0].result.ok) return false;
      return await new Promise((resolveCount, reject) => {
        const request = indexedDB.open('spotlight-semantic-v1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const count = db.transaction('vectors').objectStore('vectors').count();
          count.onsuccess = () => { db.close(); resolveCount(count.result === 0); };
        };
      });
    })()`, awaitPromise: true, returnByValue: true }, sessionId);
    if (clearing.exceptionDetails) throw new Error(JSON.stringify(clearing.exceptionDetails));
    assert.equal(clearing.result.value, true, 'Clearing source data must clear persistent model vectors');
    console.log('Source-clear persistent-cache cleanup passed');
    const recovery = await call('Runtime.evaluate', { expression: `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('${origin}'));
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        document.getElementById('learn-spotlight-root')?.closeSpotlight();
        await new Promise(resolve => setTimeout(resolve, 600));
        const stale = document.createElement('div');
        stale.id = 'learn-spotlight-root';
        stale.isSpotlightContextAlive = () => false;
        stale.closeSpotlight = () => { throw new Error('Invalidated callback must not be reused'); };
        document.documentElement.append(stale);
      } });
      return chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', files: ['dist/spotlight.js'] });
    })()`, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(recovery.exceptionDetails, undefined, JSON.stringify(recovery));
    await assertSpotlightOpen();
    assert.deepEqual(pageErrors, [], 'Opening Spotlight and replacing a stale extension root must not throw page errors');
    console.log('Spotlight dialog and stale-context recovery passed');
  }
} finally {
  const exited = new Promise((resolve) => { browser.once('exit', resolve); setTimeout(resolve, 3000); });
  browser.kill();
  await exited;
  await new Promise((resolve) => server.close(resolve));
  // A disposable test profile only; never the user's browser profile.
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
