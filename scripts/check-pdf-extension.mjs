import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { searchPdfFixture } from '../tests/fixtures/search-pdf.js';

// A disposable fixture extension grants access only to an intercepted LEARN origin.
// No request reaches LEARN and no existing browser profile is used.
const temporary = await mkdtemp(join(tmpdir(), 'spotlight-pdf-check-'));
const extension = join(temporary, 'extension');
for (const path of ['src', 'dist', 'background.js', 'semantic.html']) await cp(resolve(path), join(extension, path), { recursive: true });
// Expose the statically imported handler only in the disposable fixture: dynamic
// import is disallowed in service workers, and production has no debug globals.
await writeFile(join(extension, 'background.js'), `${await readFile('background.js', 'utf8')}\nglobalThis.__spotlightToggleForTest = toggleSpotlight;\n`);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
await writeFile(join(extension, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: ['https://learn.uwaterloo.ca/*'] }));
const browser = spawn(process.env.SPOTLIGHT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-extension-debugging',
    `--user-data-dir=${join(temporary, 'profile')}`, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let sequence = 0, buffered = '';
const pending = new Map();
const errors = [];
const requested = [];
function call(method, params = {}, sessionId) {
  return new Promise((resolveCall, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser check timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve: resolveCall, reject, timer });
    browser.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
}
browser.on('error', error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); });
const origin = 'https://learn.uwaterloo.ca';
const pdfBytes = searchPdfFixture();
function fixture(url) {
  const path = new URL(url).pathname;
  if (path === '/') return ['text/html', '<!doctype html><title>Fixture LEARN</title><h1>PDF search fixture</h1>'];
  if (path === '/d2l/api/versions/') return ['application/json', JSON.stringify([
    { ProductCode: 'lp', SupportedVersions: ['1.49'] }, { ProductCode: 'le', SupportedVersions: ['1.82'] }])];
  if (path.endsWith('/users/whoami')) return ['application/json', JSON.stringify({ Identifier: 'fixture-account' })];
  if (path.includes('/enrollments/myenrollments/')) return ['application/json', JSON.stringify({ Items: [230, 231].map(id =>
    ({ OrgUnit: { Id: id, Code: `STAT_${id}_001_F26`, Name: `STAT ${id} Fall 2026` }, Access: { CanAccess: true } })), PagingInfo: { HasMoreItems: false } })];
  if (path.endsWith('/content/toc')) {
    const course = path.includes('/230/') ? 230 : 231;
    return ['application/json', JSON.stringify({ Modules: [{ Title: 'Lecture notes', Topics: [], Modules: [{ Title: 'Instructor A', Topics: [
      { TopicId: course, Title: 'week_02.pdf', Url: `/content/enforced/${course}/notes.pdf`, TopicType: 1, LastModifiedDate: '2026-10-12' }
    ] }] }] })];
  }
  if (path.endsWith('/notes.pdf')) return ['application/pdf', Buffer.from(pdfBytes)];
  return ['application/json', JSON.stringify({ fixtureError: 'Unexpected request' })];
}
browser.stdio[4].on('data', data => {
  buffered += data.toString();
  let end;
  while ((end = buffered.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffered.slice(0, end)); buffered = buffered.slice(end + 1);
    const entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); clearTimeout(entry.timer); message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      requested.push(request.url);
      const [type, body] = fixture(request.url);
      call('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: type }], body: Buffer.from(body).toString('base64') }, message.sessionId).catch(error => errors.push(error.message));
    }
  }
});
async function evaluate(session, expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session)
    .catch(error => { throw new Error(`${error.message}: ${expression.slice(0, 140)}`); });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(operation, assertion, description) {
  const deadline = Date.now() + 30000;
  let value;
  while (Date.now() < deadline) {
    value = await operation();
    if (assertion(value)) return value;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`${description}: ${JSON.stringify(value)}; errors: ${JSON.stringify(errors)}`);
}
try {
  const { id } = await call('Extensions.loadUnpacked', { path: extension });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId: page } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Runtime.enable', {}, page);
  await call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*`, requestStage: 'Request' }] }, page);
  await call('Page.navigate', { url: `${origin}/` }, page);
  await until(() => evaluate(page, 'document.body?.textContent'), text => text?.includes('PDF search fixture'), 'Fixture document must load');
  const worker = await until(() => call('Target.getTargets'), result => result.targetInfos.some(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`)), 'Extension worker must start');
  const target = worker.targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`));
  const { sessionId: background } = await call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await call('Runtime.enable', {}, background);
  await until(() => evaluate(background, "typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)"), Boolean, 'Extension worker context must initialize');
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/spotlight.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.open = url => { window.__pdfTestOpened = url; }; } });
  })()`);
  const root = "document.getElementById('learn-spotlight-root')?.shadowRoot";
  await until(() => evaluate(page, `${root}?.textContent`), text => text?.includes('2 of 2 PDFs'), 'Automatic PDF indexing must finish');
  async function closeAndReopen() {
    await evaluate(background, `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.getElementById('learn-spotlight-root').closeSpotlight() });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/spotlight.js'] });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.getElementById('learn-spotlight-root')?.isSpotlightOpen() }))[0].result;
    })()`).then(open => assert.equal(open, true, 'A closing root must reopen instead of swallowing the toggle'));
  }
  await closeAndReopen();
  const { targetId: otherTab } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId: otherPage } = await call('Target.attachToTarget', { targetId: otherTab, flatten: true });
  await call('Page.bringToFront', {}, otherPage);
  await closeAndReopen();
  await call('Page.bringToFront', {}, page);
  await new Promise(resolveWait => setTimeout(resolveWait, 350));
  assert.equal(await evaluate(page, `Boolean(${root}?.querySelector('[role=dialog]'))`), true, 'Delayed background-tab exit must not remove the reopened overlay');
  await call('Target.closeTarget', { targetId: otherTab });
  async function change(selector, value) {
    await evaluate(page, `(() => {
      const element = ${root}.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing input: ' + ${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set;
      setter.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true, composed: true }));
    })()`);
  }
  const rows = () => evaluate(page, `${root}?.querySelector('[role=listbox]')?.textContent`);
  await change('input[type=search]', 'permutation');
  const matched = await until(rows, text => text?.includes('PDF page 2') && text.includes('STAT_231'), 'PDF contents must match across courses');
  assert.match(matched, /ordered arrangement/);
  await change('[aria-label="Filter by course"]', '230');
  await until(rows, text => text?.includes('PDF page 2') && !text.includes('STAT_231'), 'Course filter must exclude STAT 231');
  const section = JSON.stringify(['230', 'Lecture notes / Instructor A']);
  await change('[aria-label="Filter by notes section"]', section);
  await change('[aria-label="Instructor for this notes section"]', 'Dr Example');
  await evaluate(page, `Array.from(${root}.querySelectorAll('button')).find(button => button.textContent === 'Save instructor').click()`);
  await until(() => evaluate(page, `${root}.querySelector('[aria-label="Filter by instructor"]')?.textContent`), text => text?.includes('Dr Example'), 'Saved instructor label must become a filter');
  await change('[aria-label="Filter by instructor"]', 'Dr Example');
  await until(rows, text => text?.includes('PDF page 2') && text.includes('Dr Example'), 'Instructor and notes filters must preserve page match');
  await evaluate(page, `${root}.querySelector('input[type=search]').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, page);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, page);
  const opened = await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__pdfTestOpened }))[0].result;
  })()`);
  assert.equal(opened, `${origin}/content/enforced/230/notes.pdf#page=2`);
  const history = await until(() => evaluate(background, "chrome.storage.local.get('learnSpotlightIndexV1')"), saved => Object.keys(saved.learnSpotlightIndexV1.history).length === 1, 'Opening a page must record original-resource history');
  assert.equal(Object.keys(history.learnSpotlightIndexV1.history)[0], `${origin}:fixture-account:230:230`);
  await evaluate(background, 'chrome.offscreen.closeDocument()');
  const stored = await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () =>
      chrome.runtime.sendMessage({ type: 'pdf-index', action: 'search', query: 'permutation', filters: { courseId: '230', instructor: 'Dr Example' } }) }))[0].result;
  })()`);
  assert.equal(stored.ok, true);
  assert.equal(stored.matches[0].pdfPage, 2);
  // Native OS accelerator delivery and idle-worker wake-up require a manual
  // Chrome check; the headless debug fixture cannot reliably exercise them.
  assert.equal(await evaluate(background, `(async () => {
    const toggleSpotlight = globalThis.__spotlightToggleForTest;
    if (!await toggleSpotlight()) throw new Error('Shortcut fallback did not resolve the focused tab');
    if (!await toggleSpotlight()) throw new Error('Shortcut fallback did not reopen');
    const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.getElementById('learn-spotlight-root')?.isSpotlightOpen() }))[0].result;
  })()`), true, 'Shortcut must resolve the focused tab when its event omits the tab');
  await new Promise(resolveWait => setTimeout(resolveWait, 350));
  assert.equal(await evaluate(page, `Boolean(${root}?.querySelector('[role=dialog]'))`), true);
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => chrome.runtime.sendMessage({ type: 'learn-index', action: 'clear' }) });
  })()`);
  const remaining = await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => chrome.runtime.sendMessage({ type: 'pdf-index', action: 'status' }) }))[0].result;
  })()`);
  assert.equal(remaining.documents.length, 0);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(requested.filter(url => url.endsWith('notes.pdf')).length, 2);
  console.log(JSON.stringify({ automaticExtraction: 'passed', pageSnippets: 'passed', courseSectionInstructorFilters: 'passed',
    keyboardPageOpening: opened, originalResourceHistory: 'passed', offscreenRestartPersistence: 'passed',
    interruptedExitReopening: 'passed', tabSwitchReopening: 'passed', focusedTabFallback: 'passed', clearLearnData: 'passed', browserErrors: 0 }, null, 2));
} finally {
  browser.kill();
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Browser check closed.')); }
  pending.clear();
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else browser.once('exit', resolveExit); });
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
