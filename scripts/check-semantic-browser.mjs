import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const project = resolve('.');
const server = http.createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end(process.argv.includes('--extension') ? '<h1>Isolated extension test</h1>' : '<script type="module" src="/dist/semantic/engine.js"></script>'); return; }
  const target = resolve(project, `.${path}`);
  if (!target.startsWith(`${project}/`) || !/^\/(dist\/semantic|models)\//.test(path)) { response.writeHead(404); response.end(); return; }
  try {
    response.setHeader('Content-Type', /\.m?js$/.test(path) ? 'application/javascript' : /\.wasm$/.test(path) ? 'application/wasm' : 'application/octet-stream');
    response.end(await readFile(target));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(`${tmpdir()}/spotlight-semantic-`);
const browser = spawn(process.env.SPOTLIGHT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let sequence = 0, buffered = '';
const pending = new Map();
browser.stdio[4].on('data', (data) => {
  buffered += data.toString();
  let end;
  while ((end = buffered.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffered.slice(0, end)); buffered = buffered.slice(end + 1);
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
  if (process.argv.includes('--extension')) {
    const { id } = await call('Extensions.loadUnpacked', { path: project });
    const { targetId } = await call('Target.createTarget', { url: origin });
    const { sessionId: pageSession } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Page.bringToFront', {}, pageSession);
    let tab;
    for (let attempt = 0; attempt < 30 && !tab; attempt++) {
      tab = (await call('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.find((target) => target.url.startsWith(origin));
      if (!tab) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(tab, 'Fixture tab must be available');
    await call('Extensions.triggerAction', { id, targetId: tab.targetId });
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
    const result = await call('Runtime.evaluate', { expression: `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('${origin}'));
      if (!tab) throw new Error('Active tab permission was not granted');
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        return chrome.runtime.sendMessage({ type: 'semantic-search', scope: 'extension-fixture', query: 'counting ways to arrange objects', documents: [
          { id: 'counting', text: 'Combinatorics: permutations and combinations, counting arrangements' },
          { id: 'cpp', text: 'C++ inheritance and virtual destructors' }
        ] });
      } });
      return result[0].result;
    })()`, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    assert.equal(result.result.value.ok, true, JSON.stringify(result.result.value));
    assert.equal(result.result.value.hits[0].id, 'counting');
    console.log(JSON.stringify({ extensionOffscreenInference: 'passed', ...result.result.value }));
    const clearing = await call('Runtime.evaluate', { expression: `(async () => {
      await chrome.storage.local.set({ learnSpotlightIndexV1: { version: 1, accountId: 'fixture-account', courses: [], resources: [], history: {}, failedCourses: [] } });
      for (let attempt = 0; attempt < 30; attempt++) {
        if (!(await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length) return true;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return false;
    })()`, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(clearing.result.value, true, 'Account changes must close the model cache');
    console.log('Account-change offscreen cleanup passed');
  } else {
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Page.enable', {}, sessionId);
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.chrome = { runtime: { id: 'test', getURL: path => '${origin}/' + path, onMessage: { addListener: listener => { globalThis.testListener = listener; } } } };` }, sessionId);
  await call('Page.navigate', { url: origin }, sessionId);
  const result = await call('Runtime.evaluate', { expression: `(async () => {
    const deadline = Date.now() + 20000;
    while (!globalThis.testListener && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
    if (!globalThis.testListener) throw new Error('Bundled engine failed to load');
    return await new Promise(resolve => testListener({ type: 'semantic-engine', scope: 'browser-fixture', query: 'counting ways to arrange objects', documents: [
      { id: 'counting', text: 'Combinatorics: permutations and combinations, counting arrangements' },
      { id: 'cpp', text: 'C++ inheritance and virtual destructors' }
    ] }, { id: 'test' }, resolve));
  })()`, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  assert.equal(result.result.value.ok, true, JSON.stringify(result.result.value));
  assert.equal(result.result.value.hits[0].id, 'counting');
  console.log(JSON.stringify({ browserWasmInference: 'passed', ...result.result.value }));
  }
} finally {
  const exited = new Promise((resolve) => { browser.once('exit', resolve); setTimeout(resolve, 3000); });
  browser.kill();
  await exited;
  await new Promise((resolve) => server.close(resolve));
  // A disposable test profile only; never the user's browser profile.
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
