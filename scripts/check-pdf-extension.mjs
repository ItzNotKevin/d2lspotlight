import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { wordFixture, slideFixture } from '../tests/fixtures/office.js';
import { searchPdfFixture } from '../tests/fixtures/search-pdf.js';

// A disposable fixture extension grants access only to an intercepted LEARN origin.
// No request reaches LEARN and no existing browser profile is used.
const temporary = await mkdtemp(join(tmpdir(), 'spotlight-pdf-check-'));
const ocrPdfBytes = process.env.SPOTLIGHT_OCR_PDF ? await readFile(process.env.SPOTLIGHT_OCR_PDF) : null;
const extension = join(temporary, 'extension');
for (const path of ['src', 'dist', 'background.js', 'semantic.html', 'spotlight.html']) await cp(resolve(path), join(extension, path), { recursive: true,
  filter: source => Boolean(ocrPdfBytes) || !source.includes('/ocr-models') });
if (!ocrPdfBytes) await writeFile(join(extension, 'dist/ocr-manifest.json'), JSON.stringify({ available: false }));
// Expose the statically imported handler only in the disposable fixture: dynamic
// import is disallowed in service workers, and production has no debug globals.
await writeFile(join(extension, 'dist/background.js'), `${await readFile('dist/background.js', 'utf8')}\nimport { toggleSpotlight as fixtureToggle } from '../src/toggle.js';\nglobalThis.__spotlightToggleForTest = fixtureToggle;\n`);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
await writeFile(join(extension, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: ['https://learn.uwaterloo.ca/*', 'https://student.cs.uwaterloo.ca/*', 'https://example.test/*'] }));
const browser = spawn(process.env.SPOTLIGHT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-extension-debugging',
    `--user-data-dir=${join(temporary, 'profile')}`, '--remote-debugging-pipe'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let sequence = 0, buffered = '';
let callTimeout = 20000;
const pending = new Map();
const errors = [];
const requested = [];
let loggedOut = false;
let officeEnabled = false;
let sessionDelay = 0;
let failSecondPdf = false;
let delaySecondPdf = 0;
function call(method, params = {}, sessionId) {
  return new Promise((resolveCall, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser check timed out: ${method}`)); }, callTimeout);
    pending.set(id, { resolve: resolveCall, reject, timer });
    browser.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
}
browser.on('error', error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); });
const origin = 'https://learn.uwaterloo.ca';
const pdfBytes = searchPdfFixture();
function fixture(url) {
  const destination = new URL(url);
  const path = destination.pathname;
  if (destination.hostname === 'student.cs.uwaterloo.ca') {
    const navigation = '<nav><a href="index.shtml">Home</a><a href="assignments.shtml">Assignment information</a><a href="schedule.shtml">Schedule</a><a href="outline.shtml">Course outline</a><a href="officehours.shtml">Office hours</a></nav>';
    const body = path.endsWith('assignments.shtml') ? '<h1>Assignment Information</h1><h2 id="lates">Lates</h2><p>Late submissions receive no credit.</p>'
      : path.endsWith('schedule.shtml') ? '<h1>Schedule</h1><p>Assessment deadlines are in the <a href="outline.shtml">course outline</a>.</p>'
      : path.endsWith('outline.shtml') ? '<h1>Course Outline</h1><p>Read the <a href="https://outline.uwaterloo.ca/viewer/view/fixture">official outline</a>.</p>'
      : path.endsWith('officehours.shtml') ? '<h1>Office Hours</h1><p>Visit the teaching team on Wednesdays.</p>'
      : '<h1>Welcome to CS 246</h1><p>This website holds course information.</p>';
    return ['text/html', `<html><head><title>CS 246 Fall 2026</title></head><body>${navigation}<main>${body}</main></body></html>`];
  }
  if (path === '/d2l/home/246') return ['text/html', '<!doctype html><title>CS 246 LEARN fixture</title><section><h1>CS 246 does NOT use LEARN</h1><p>Course webpage: <a href="https://student.cs.uwaterloo.ca/~cs246/F26/index.shtml">CS 246 course website</a></p><a href="https://student.cs.uwaterloo.ca/~cs246/W26/index.shtml">Old term</a></section>'];
  if (path === '/office-fixture') return ['text/html', '<!doctype html><title>Office fixture</title><h1>Office content search</h1>'];
  if (path === '/content/enforced/246/notes.docx') return ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from(wordFixture())];
  if (path === '/d2l/api/le/1.82/246/content/topics/2461/file') return ['application/vnd.openxmlformats-officedocument.presentationml.presentation', Buffer.from(slideFixture())];
  if (path === '/') return ['text/html', '<!doctype html><title>Fixture LEARN</title><h1>PDF search fixture</h1>'];
  if (path === '/d2l/api/versions/') return ['application/json', JSON.stringify([
    { ProductCode: 'lp', SupportedVersions: ['1.49'] }, { ProductCode: 'le', SupportedVersions: ['1.82'] }])];
  if (path.endsWith('/users/whoami')) return ['application/json', JSON.stringify({ Identifier: 'fixture-account' })];
  if (path.includes('/enrollments/myenrollments/')) return ['application/json', JSON.stringify({ Items: [230, 231, 246].map(id =>
    ({ OrgUnit: { Id: id, Code: `${id === 246 ? 'CS' : 'STAT'}_${id}_001_F26`, Name: `${id === 246 ? 'CS' : 'STAT'} ${id} Fall 2026` }, Access: { CanAccess: true } })), PagingInfo: { HasMoreItems: false } })];
  if (path.endsWith('/content/toc')) {
    if (path.includes('/246/')) return ['application/json', JSON.stringify({ Modules: officeEnabled ? [{ Title: 'Lecture notes', Topics: [
      { TopicId: 2461, Title: 'Week 2 slides', Url: '/d2l/file/lecture.pptx', TopicType: 1 },
      { TopicId: 2462, Title: 'Week 2 handout', Url: '/content/enforced/246/notes.docx', TopicType: 1 }
    ] }] : [] })];
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
      const responseCode = loggedOut && request.url.endsWith('/users/whoami') ? 401 : failSecondPdf && request.url.includes('/231/notes.pdf') ? 503 : 200;
      const delay = request.url.endsWith('/d2l/api/versions/') ? sessionDelay : request.url.includes('/231/notes.pdf') ? delaySecondPdf : 0;
      const fulfill = () => call('Fetch.fulfillRequest', { requestId, responseCode,
        responseHeaders: [{ name: 'Content-Type', value: type }], body: Buffer.from(body).toString('base64') }, message.sessionId).catch(error => {
          // A tab losing focus cancels its verification request before CDP replies.
          if (!error.message.includes('Invalid InterceptionId')) errors.push(error.message);
        });
      if (delay) setTimeout(fulfill, delay); else fulfill();
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
  throw new Error(`${description}: ${JSON.stringify(typeof value === 'string' ? value.slice(-1800) : value)}; errors: ${JSON.stringify(errors)}`);
}
try {
  const { id } = await call('Extensions.loadUnpacked', { path: extension });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId: page } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false }, page);
  await call('Runtime.enable', {}, page);
  await call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*`, requestStage: 'Request' }] }, page);
  await call('Page.navigate', { url: `${origin}/` }, page);
  await until(() => evaluate(page, 'document.body?.textContent'), text => text?.includes('PDF search fixture'), 'Fixture document must load');
  const worker = await until(() => call('Target.getTargets'), result => result.targetInfos.some(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`)), 'Extension worker must start');
  const target = worker.targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`));
  const { sessionId: background } = await call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await call('Runtime.enable', {}, background);
  await until(() => evaluate(background, "typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)"), Boolean, 'Extension worker context must initialize');
  await evaluate(background, "chrome.storage.local.set({ handwritingIndexingEnabled: false })");
  assert.equal(await evaluate(page, "Boolean(document.getElementById('learn-spotlight-root'))"), false, 'Automatic shortcut installation must not open the overlay');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'K', code: 'KeyK', modifiers: 12, windowsVirtualKeyCode: 75 }, page);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'K', code: 'KeyK', modifiers: 12, windowsVirtualKeyCode: 75 }, page);
  await until(() => evaluate(page, "Boolean(document.getElementById('learn-spotlight-root')?.shadowRoot?.querySelector('[role=dialog]'))"), Boolean, 'Installed LEARN shortcut must open before any worker injection');
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/spotlight.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.open = url => { window.__pdfTestOpened = url; }; } });
  })()`);
  const root = "document.getElementById('learn-spotlight-root')?.shadowRoot";
  assert.equal(await evaluate(page, `Boolean(${root}?.querySelector('[role=dialog]'))`), true, 'A duplicate command must not close a locally opened overlay');
  await until(() => evaluate(page, `${root}?.textContent`), text => text?.includes('2 of 2 documents'), 'Automatic PDF indexing must finish');
  assert.equal(await evaluate(page, `${root}.querySelector('[aria-label="Search settings"]').open`), false, 'Maintenance settings must start collapsed');
  async function checkRealOcr(sourceUrl) {
    callTimeout = 240000;
    const payload = await evaluate(background, `(async () => {
      const key = 'learnSpotlightIndexV1', index = (await chrome.storage.local.get(key))[key];
      const resource = { id: 'real-ocr-pdf', title: 'Annotated week 5', type: 'PDF', course: 'CS246', courseId: '246', path: 'Lecture notes', pdfUrl: '${origin}/content/ocr-notes.pdf', url: '${origin}/d2l/le/content/246/viewContent/999/View' };
      await chrome.storage.local.set({ [key]: { ...index, resources: [...index.resources, resource] } });
      return { resourceId: resource.id, revision: JSON.stringify([resource.pdfUrl, resource.modifiedAt]), accountId: index.accountId, generation: index.generation };
    })()`);
    async function sourceMessage(message) {
      return evaluate(background, `(async () => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${sourceUrl}');
        return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: payload => chrome.runtime.sendMessage(payload), args: [${JSON.stringify(message)}] }))[0].result;
      })()`);
    }
    const bytes = Buffer.from(ocrPdfBytes).toString('base64');
    const native = await sourceMessage({ type: 'pdf-index', action: 'extract', requestId: 'real-ocr-native', ...payload, bytes });
    assert.equal(native.ok, true, JSON.stringify(native));
    // Resume fixture: pages 1–4 are treated as previously scanned. The real
    // offscreen worker must render and recognize physical page 5 on this run.
    await evaluate(background, `(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open('spotlight-pdf-v1', 1); request.onsuccess = () => resolve(request.result); });
      await new Promise(resolve => { const tx = db.transaction('documents', 'readwrite'), store = tx.objectStore('documents'); const request = store.get('real-ocr-pdf'); request.onsuccess = () => store.put({ ...request.result, ocr: { version: 'handwriting-v1', nextPage: 5, scannedPages: 4, totalPages: 38 } }); tx.oncomplete = resolve; }); db.close();
    })()`);
    console.log('Testing real PDF handwriting in Chrome; models run locally.');
    let lastStage = '';
    const progressTimer = setInterval(async () => {
      try { const value = await evaluate(background, "chrome.storage.session.get('spotlightOcrStage')");
        const stage = value.spotlightOcrStage?.stage; if (stage && stage !== lastStage) { console.log('OCR: ' + stage); lastStage = stage; }
      } catch {}
    }, 10000);
    let scanned;
    try {
      for (let batch = 0; batch < 6; batch++) {
        scanned = await sourceMessage({ type: 'pdf-index', action: 'ocr', requestId: 'real-ocr-scan-' + batch, ...payload, bytes });
        if (!scanned.ok || scanned.document.ocr.nextPage === 6) break;
        console.log('Saved OCR region batch: ' + scanned.document.ocr.regionOffset);
        const checkpoint = await sourceMessage({ type: 'pdf-index', action: 'search', query: 'recall', filters: { courseId: '246' } });
        if (checkpoint.matches.some(match => match.resourceId === 'real-ocr-pdf' && match.pdfPage === 5 && match.ocrMatch)) break;
      }
    }
    finally { clearInterval(progressTimer); }
    assert.equal(scanned.ok, true, JSON.stringify(scanned));
    assert.ok(scanned.document.ocr.nextPage === 6 || scanned.document.ocr.regionOffset > 0, 'OCR must save page or region resume progress');
    const results = await sourceMessage({ type: 'pdf-index', action: 'search', query: 'recall', filters: { courseId: '246' } });
    const handwriting = results.matches.find(match => match.resourceId === 'real-ocr-pdf' && match.pdfPage === 5 && match.ocrMatch);
    assert.ok(handwriting, 'Ordinary search must include handwritten Recall from physical page 5');
    assert.match(handwriting.url, /#page=5$/);
    await evaluate(background, `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${sourceUrl}');
      const open = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.getElementById('learn-spotlight-root')?.isSpotlightOpen() }))[0].result;
      if (!open) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/spotlight.js'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.open = url => { window.__ocrOpened = url; }; } });
    })()`);
    const sourceTarget = (await call('Target.getTargets')).targetInfos.find(target => target.url === sourceUrl);
    const { sessionId: searchPage } = await call('Target.attachToTarget', { targetId: sourceTarget.targetId, flatten: true });
    await call('Runtime.enable', {}, searchPage);
    await evaluate(searchPage, `(() => {
      const input = ${root}.querySelector('input[type=search]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'cs246 recall');
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    })()`);
    await until(() => evaluate(searchPage, `${root}.querySelector('[role=listbox]')?.textContent`), text => text?.includes('PDF page 5') && text.includes('OCR text'), 'Unified UI must display the handwriting match and its OCR label');
    await evaluate(searchPage, `${root}.querySelector('[role=option]').click()`);
    const opened = await evaluate(background, `(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${sourceUrl}');
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__ocrOpened }))[0].result;
    })()`);
    assert.match(opened, /#page=5$/, 'Selecting the ordinary result must open physical PDF page 5');
    console.log('Real PDF OCR cache, normal search, resume progress, and page-5 URL passed.');
  }
  if (process.env.SPOTLIGHT_OCR_ONLY) {
    await checkRealOcr(origin + '/');
    assert.equal(errors.length, 0, JSON.stringify(errors));
  } else {
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
  assert.equal(await evaluate(page, `${root}.querySelector('.ls-match-reason')?.textContent`), 'PDF text · page 2', 'Result must explain its PDF passage match');
  await new Promise(resolveWait => setTimeout(resolveWait, 500));
  const preview = await call('Page.captureScreenshot', { format: 'png' }, page);
  await writeFile(join(tmpdir(), 'spotlight-search-preview.png'), Buffer.from(preview.data, 'base64'));
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
  await evaluate(page, `${root}.querySelector('input[type=search]').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  await until(() => evaluate(page, `${root}.querySelector('input[type=search]').value`), value => value === '', 'First Escape must clear the search');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  await until(() => evaluate(page, "!document.getElementById('learn-spotlight-root')"), Boolean, 'Escape must fully dispose the overlay');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'K', code: 'KeyK', modifiers: 12, windowsVirtualKeyCode: 75 }, page);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'K', code: 'KeyK', modifiers: 12, windowsVirtualKeyCode: 75 }, page);
  await until(() => evaluate(page, `Boolean(${root}?.querySelector('[role=dialog]'))`), Boolean, 'Tab-local Command Shift K must reopen a fully disposed overlay');
  assert.equal(await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    return globalThis.__spotlightToggleForTest(tab, chrome, 'toolbar');
  })()`), true, 'Toolbar must invoke the installed controller independently of a local shortcut');
  await until(() => evaluate(page, "!document.getElementById('learn-spotlight-root')"), Boolean, 'Toolbar must fully close the locally opened overlay');
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    return globalThis.__spotlightToggleForTest(tab, chrome, 'toolbar');
  })()`);
  await until(() => evaluate(page, `Boolean(${root}?.querySelector('[role=dialog]'))`), Boolean, 'Toolbar must reopen through the installed controller');
  await evaluate(page, `${root}.querySelector('[aria-label="Search settings"] summary').click()`);
  await until(() => evaluate(page, `${root}.querySelector('.ls-pdf-courses')?.textContent`), text => text?.includes('1 indexed') && text.includes('STAT 230'), 'Course indexing counts must be displayed');
  assert.equal(await evaluate(page, `${root}.querySelectorAll('.ls-settings-group').length`), 3, 'Settings must group connected sources');
  await evaluate(page, `${root}.querySelector('.ls-settings-group > summary').click()`);
  const settingsWheel = await evaluate(page, `(() => {
    const panel = ${root}.querySelector('.ls-settings-body');
    const bounds = panel.getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + 65, pageScroll: window.scrollY };
  })()`);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: settingsWheel.x, y: settingsWheel.y }, page);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: settingsWheel.x, y: settingsWheel.y, deltaX: 0, deltaY: 180 }, page);
  await until(() => evaluate(page, `${root}.querySelector('.ls-settings-body').scrollTop`), top => top > 0, 'Wheel and trackpad events must scroll hovered Settings');
  assert.equal(await evaluate(page, 'window.scrollY'), settingsWheel.pageScroll, 'Settings scrolling must not move the page behind Spotlight');
  await evaluate(page, `(() => { const panel = ${root}.querySelector('.ls-settings-body'); panel.scrollTop = 0; })()`);
  await evaluate(page, `Array.from(${root}.querySelectorAll('.ls-pdf-course')).find(row => row.textContent.includes('STAT 230')).querySelector('button').click()`);
  await until(() => evaluate(background, "chrome.storage.local.get('pdfPinnedCourses:fixture-account')"), saved => saved['pdfPinnedCourses:fixture-account']?.includes('230'), 'Pinning must save the course per account');
  await evaluate(page, `Array.from(${root}.querySelectorAll('.ls-pdf-course')).find(row => row.textContent.includes('STAT 230')).querySelectorAll('button')[1].click()`);
  await until(() => evaluate(background, "chrome.storage.local.get('pdfIndexCourses:fixture-account')"), saved => saved['pdfIndexCourses:fixture-account']?.join() === '230', 'Prioritization must save course selection');
  await until(() => evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => chrome.runtime.sendMessage({ type: 'pdf-index', action: 'status' }) }))[0].result;
  })()`), result => result.documents.length === 2, 'Indexing a selected course must not clear other cached text unnecessarily');
  // Remove one fixture document to exercise incomplete coverage and download retries.
  await evaluate(background, `(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('spotlight-pdf-v1', 1); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => { const tx = db.transaction('documents', 'readwrite'); const store = tx.objectStore('documents'); const request = store.getAll(); request.onsuccess = () => { for (const document of request.result) if (document.id.includes(':231:')) store.delete(document.id); }; tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close(); await chrome.storage.local.set({ pdfCacheRevision: crypto.randomUUID() });
  })()`);
  await change('[aria-label="Filter by course"]', '231');
  await until(() => evaluate(page, `${root}.querySelector('.ls-coverage')?.textContent`), text => text?.includes('0 of 1'), 'A course whose PDF text was removed must show incomplete coverage');
  await change('[aria-label="Filter by course"]', '230');
  failSecondPdf = true;
  delaySecondPdf = 1500;
  await evaluate(page, `${root}.querySelector('[aria-label="Index documents for STAT 231 Fall 2026"]').click()`);
  await evaluate(page, `${root}.querySelector('[aria-label="Index documents for STAT 230 Fall 2026"]').click()`);
  await until(() => evaluate(background, "chrome.storage.local.get('pdfIndexProgressV1')"), saved => Object.entries(saved.pdfIndexProgressV1?.entries || {}).some(([id, entry]) => id.includes(':231:') && entry.state === 'pending'), 'An unfinished download must have a saved progress record');
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    await globalThis.__spotlightToggleForTest(tab, chrome, 'toolbar');
  })()`);
  await until(() => evaluate(page, "!document.getElementById('learn-spotlight-root')"), Boolean, 'Close must interrupt the unfinished download');
  const interruptedDownloads = requested.filter(url => url.includes('/231/notes.pdf')).length;
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    await globalThis.__spotlightToggleForTest(tab, chrome, 'toolbar');
  })()`);
  await until(async () => requested.filter(url => url.includes('/231/notes.pdf')).length, count => count > interruptedDownloads, 'Reopening must resume the unfinished PDF download');
  await until(() => evaluate(page, `${root}.querySelector('.ls-pdf-courses')?.textContent`), text => text?.includes('1 failed') && text.includes('Retry week_02.pdf'), 'Failed PDF must show its error and individual retry');
  delaySecondPdf = 0;
  const failedDownloads = requested.filter(url => url.includes('/231/notes.pdf')).length;
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    await globalThis.__spotlightToggleForTest(tab, chrome, 'toolbar');
  })()`);
  await until(() => evaluate(page, "!document.getElementById('learn-spotlight-root')"), Boolean, 'Close must dispose the failed-file UI');
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/');
    await globalThis.__spotlightToggleForTest(tab, chrome, 'toolbar');
  })()`);
  await until(() => evaluate(page, `${root}?.querySelector('.ls-pdf-courses')?.textContent`), text => text?.includes('1 failed') && text.includes('Retry week_02.pdf'), 'Failure must survive complete overlay disposal and reopen');
  await until(() => evaluate(page, `${root}?.textContent`), text => text?.includes('0 of 1 documents in this scope indexed.'), 'Reopened indexing must finish without automatically retrying a saved failure');
  assert.equal(requested.filter(url => url.includes('/231/notes.pdf')).length, failedDownloads, 'Saved failures must not be downloaded again without an explicit retry');
  await evaluate(page, `${root}.querySelector('[aria-label="Search settings"] summary').click()`);
  failSecondPdf = false;
  await evaluate(page, `Array.from(${root}.querySelectorAll('button')).find(button => button.textContent === 'Retry week_02.pdf').click()`);
  await until(() => evaluate(page, `${root}.querySelector('.ls-pdf-courses')?.textContent`), text => !text?.includes('1 failed') && !text?.includes('Retry week_02.pdf'), 'Individual retry must clear a resolved failure');
  await until(() => evaluate(page, `Array.from(${root}.querySelectorAll('.ls-pdf-course')).find(row => row.textContent.includes('STAT 231'))?.textContent`), text => text?.includes('1 indexed'), 'Retried PDF must actually finish indexing');
  await evaluate(page, `Array.from(${root}.querySelectorAll('button')).find(button => button.textContent === 'All courses / follow search filters').click()`);
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
  assert.equal(new Set(requested.filter(url => url.endsWith('notes.pdf'))).size, 2, 'Blur cancellation may retry a PDF, but must not expand its scope');
  const externalRoot = 'https://student.cs.uwaterloo.ca/~cs246/F26/';
  await call('Fetch.enable', { patterns: [{ urlPattern: 'https://student.cs.uwaterloo.ca/*', requestStage: 'Request' }] }, background);
  await call('Page.navigate', { url: `${origin}/d2l/home/246` }, page);
  await until(() => evaluate(page, 'document.body?.textContent'), text => text?.includes('CS 246 does NOT use LEARN'), 'External course notice must render');
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/d2l/home/246');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/spotlight.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.open = url => { window.__pdfTestOpened = url; }; } });
  })()`);
  await until(() => evaluate(page, `${root}?.textContent`), text => text?.includes('CS 246 · Course website detected'), 'Course home link must be automatically discovered');
  const detected = await evaluate(background, "chrome.storage.local.get('learnSpotlightIndexV1')");
  assert.equal(detected.learnSpotlightIndexV1.courseSites.length, 1, 'Previous-term site must not be detected');
  await until(() => evaluate(page, `${root}?.querySelector('[aria-label="Course website access"]')?.textContent`), text => text?.includes('Include CS 246') && text.includes('student.cs.uwaterloo.ca'), 'Detected site must automatically offer access with its address');
  const includeButton = await evaluate(page, `(() => {
    const button = Array.from(${root}.querySelectorAll('button')).find(button => button.textContent === 'Allow and index');
    const bounds = button.getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, disabled: button.disabled };
  })()`);
  assert.equal(includeButton.disabled, false);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: includeButton.x, y: includeButton.y, button: 'left', clickCount: 1 }, page);
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: includeButton.x, y: includeButton.y, button: 'left', clickCount: 1 }, page);
  await until(() => evaluate(page, `${root}?.textContent`), text => text?.includes('5 website pages indexed.'), 'Optional-permission inclusion must index term-local pages');
  await change('input[type=search]', 'cs246 late policy');
  await until(rows, text => text?.includes('Lates') && text.includes('Late submissions'), 'Page body search must show late-policy passage');
  await change('[aria-label="Search source"]', 'Website');
  await change('[aria-label="Filter by course"]', '246');
  await until(rows, text => text?.includes('Lates'), 'Website and course filters must retain section match');
  await evaluate(page, `${root}.querySelector('input[type=search]').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, page);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, page);
  assert.equal(await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/d2l/home/246');
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__pdfTestOpened }))[0].result;
  })()`), `${externalRoot}assignments.shtml#lates`);
  await change('input[type=search]', 'cs246 official outline');
  await until(rows, text => text?.includes('Linked reference'), 'Official outline reference must be searchable');
  assert.ok(await evaluate(page, `${root}.querySelector('[role=listbox]').textContent.includes('destination contents not searched')`), 'References must explain that destination contents were not searched');
  assert.ok(!requested.some(url => url.startsWith('https://outline.uwaterloo.ca/')), 'Reference must open as a link rather than crawling another site');
  await evaluate(page, `${root}.querySelector('[aria-label="Search settings"] summary').click()`);
  assert.equal(await evaluate(page, `${root}.querySelector('[aria-label="Search settings"]').open`), true, 'Settings must open on demand');
  await evaluate(page, `Array.from(${root}.querySelectorAll('button')).find(button => button.textContent === 'Remove website data').click()`);
  await until(() => evaluate(background, "chrome.storage.local.get('learnSpotlightIndexV1')"), saved => saved.learnSpotlightIndexV1.siteResources?.length === 0, 'Removing website data must remove searchable passages');
  await call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*`, requestStage: 'Request' }] }, background);
  const { targetId: crossTab } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId: crossPage } = await call('Target.attachToTarget', { targetId: crossTab, flatten: true });
  await call('Runtime.enable', {}, crossPage);
  await call('Fetch.enable', { patterns: [{ urlPattern: 'https://example.test/*', requestStage: 'Request' }] }, crossPage);
  await call('Page.navigate', { url: 'https://example.test/' }, crossPage);
  await until(() => evaluate(crossPage, 'document.body?.textContent'), Boolean, 'Other tab must load');
  await call('Page.bringToFront', {}, crossPage);
  loggedOut = true;
  sessionDelay = 700;
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === 'https://example.test/');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/spotlight.js'] });
  })()`);
  await until(() => evaluate(crossPage, `Boolean(${root}?.querySelector('input[type=search]'))`), Boolean, 'Other-tab Spotlight must open');
  await evaluate(crossPage, `(() => {
    const input = ${root}.querySelector('input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'stat230');
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  })()`);
  const crossRows = () => evaluate(crossPage, `${root}?.querySelectorAll('[role=option]').length`);
  assert.equal(await crossRows(), 0, 'Cached resources must be hidden while session verification is pending');
  await until(() => evaluate(crossPage, `${root}?.textContent`), text => text?.includes('Sign in to LEARN'), 'Logged-out cross-tab check must request sign-in');
  assert.equal(await crossRows(), 0, 'Logged-out users must not see cached keyword or PDF results');
  loggedOut = false;
  await evaluate(crossPage, `Array.from(${root}.querySelectorAll('button')).find(button => button.textContent === 'Check LEARN login').click()`);
  assert.equal(await crossRows(), 0, 'Retry must keep cached results hidden until verification succeeds');
  await until(crossRows, count => count > 0, 'Confirmed login must unlock saved resources on a different tab');
  const { targetId: newTab } = await call('Target.createTarget', { url: 'chrome://newtab/' });
  const { sessionId: newTabPage } = await call('Target.attachToTarget', { targetId: newTab, flatten: true });
  await call('Page.bringToFront', {}, newTabPage);
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab || !await globalThis.__spotlightToggleForTest({ ...tab, url: 'chrome://newtab/' }, chrome, 'toolbar')) throw new Error('New tab fallback failed');
  })()`);
  const standaloneTarget = await until(() => call('Target.getTargets'), targets => targets.targetInfos.some(target => target.url === `chrome-extension://${id}/spotlight.html`), 'Restricted page must open a standalone Spotlight window');
  const standaloneInfo = standaloneTarget.targetInfos.find(target => target.url === `chrome-extension://${id}/spotlight.html`);
  const { sessionId: standalonePage } = await call('Target.attachToTarget', { targetId: standaloneInfo.targetId, flatten: true });
  await call('Runtime.enable', {}, standalonePage);
  await until(() => evaluate(standalonePage, `${root}?.textContent`), text => text?.includes('LEARN login confirmed'), 'Standalone window must verify login through the shared broker');
  await evaluate(standalonePage, `(() => {
    const input = ${root}.querySelector('input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'stat230');
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  })()`);
  await until(() => evaluate(standalonePage, `${root}?.querySelectorAll('[role=option]').length`), count => count > 0, 'Standalone window must search the shared course index');
  await evaluate(standalonePage, `(() => {
    const input = ${root}.querySelector('input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'permutation');
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  })()`);
  await until(() => evaluate(standalonePage, `${root}?.querySelector('[role=listbox]')?.textContent`), text => text?.includes('PDF page 2'), 'Standalone window must search the shared PDF cache');
  await new Promise(resolveWait => setTimeout(resolveWait, 400));
  const standalonePreview = await call('Page.captureScreenshot', { format: 'png' }, standalonePage);
  await writeFile(join(tmpdir(), 'spotlight-standalone-preview.png'), Buffer.from(standalonePreview.data, 'base64'));
  await evaluate(background, `(async () => {
    await globalThis.__spotlightToggleForTest({ id: 0, url: 'chrome://newtab/' }, chrome, 'command');
  })()`);
  const allTargets = await call('Target.getTargets');
  assert.equal(allTargets.targetInfos.filter(target => target.url === `chrome-extension://${id}/spotlight.html`).length, 1, 'Repeated fallback must reuse the search window');
  // Fill the real IndexedDB cache, making the pinned course the oldest entry.
  const policySetup = await evaluate(background, `(async () => {
    const key = 'learnSpotlightIndexV1';
    const index = (await chrome.storage.local.get(key))[key];
    const seeds = Array.from({ length: 98 }, (_, number) => ({ id: 'cache-seed-' + number, courseId: '231', course: 'STAT 231', type: 'PDF', title: 'Cache fixture', pdfUrl: '${origin}/content/cache-' + number + '.pdf' }));
    const incoming = { id: 'cache-new', courseId: '230', course: 'STAT 230', type: 'PDF', title: 'New lecture notes', pdfUrl: '${origin}/content/cache-new.pdf' };
    await chrome.storage.local.set({ [key]: { ...index, resources: [...index.resources, ...seeds, incoming] }, ['pdfPinnedCourses:' + index.accountId]: ['230'] });
    const db = await new Promise(resolve => { const request = indexedDB.open('spotlight-pdf-v1', 1); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite'); const store = tx.objectStore('documents');
      const read = store.getAll(); read.onsuccess = () => { for (const document of read.result) if (document.id.includes(':230:')) store.put({ ...document, lastUsedAt: 0, indexedAt: 0 }); };
      seeds.forEach((resource, number) => store.put({ id: resource.id, accountId: index.accountId, revision: JSON.stringify([resource.pdfUrl, resource.modifiedAt]), pages: [{ page: 1, text: 'fixture' }], chars: 7, totalPages: 1, emptyPages: 0, partial: false, lastUsedAt: number + 1 }));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { accountId: index.accountId, generation: index.generation };
  })()`);
  const policyResult = await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/d2l/home/246');
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: payload => chrome.runtime.sendMessage(payload), args: [${JSON.stringify({ type: 'pdf-index', action: 'extract', requestId: 'retention-check', resourceId: 'cache-new', ...policySetup, bytes: Buffer.from(pdfBytes).toString('base64') })}] }))[0].result;
  })()`);
  assert.equal(policyResult.ok, true, 'A full cache must automatically make space');
  const retained = await evaluate(standalonePage, "chrome.runtime.sendMessage({ type: 'pdf-index', action: 'status' })");
  assert.equal(retained.documents.length, 100);
  assert.ok(retained.documents.some(document => document.id.includes(':230:')), 'Old pinned text must survive replacement');
  assert.ok(retained.documents.some(document => document.id === 'cache-new'));
  assert.ok(!retained.documents.some(document => document.id === 'cache-seed-0'), 'Oldest unpinned text must be replaced');
  assert.equal(retained.progress['cache-seed-0'].state, 'evicted', 'Replaced text must be tracked to prevent repeated automatic downloads');
  // Discover modern Office files through the real TOC -> download -> offscreen
  // -> IndexedDB pipeline, including a topic that needs the file API fallback.
  officeEnabled = true;
  await evaluate(background, `(async () => {
    const key = 'learnSpotlightIndexV1', index = (await chrome.storage.local.get(key))[key];
    await chrome.storage.local.set({ [key]: { ...index, updatedAt: null }, ['pdfIndexCourses:' + index.accountId]: ['246'], pdfContentSearchEnabled: true });
  })()`);
  const { targetId: officeTab } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId: officePage } = await call('Target.attachToTarget', { targetId: officeTab, flatten: true });
  await call('Runtime.enable', {}, officePage);
  await call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*`, requestStage: 'Request' }] }, officePage);
  await call('Page.navigate', { url: `${origin}/office-fixture` }, officePage);
  await until(() => evaluate(officePage, 'document.body?.textContent'), text => text?.includes('Office content search'), 'Office fixture must load');
  await evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/office-fixture');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/spotlight.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.open = url => { window.__officeOpened = url; }; } });
  })()`);
  await until(() => evaluate(officePage, `${root}?.textContent`), text => text?.includes('2 of 2 documents in this scope indexed.'), 'Office files must automatically download and index');
  await evaluate(officePage, `(() => {
    const input = ${root}.querySelector('input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'cs246 permutation');
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  })()`);
  const officeRows = await until(() => evaluate(officePage, `${root}?.querySelector('[role=listbox]')?.textContent`), text => text?.includes('Slide 2') && text.includes('Paragraphs 1–2'), 'Both Office formats must match body text despite generic titles');
  assert.ok(!officeRows.includes('PDF page'), 'Office passage labels must never claim PDF pages');
  // Verify the refreshed layout at desktop and narrow viewport sizes.
  for (const width of [1280, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: false }, officePage);
    await until(() => evaluate(officePage, `(() => {
      const panel = ${root}.querySelector('.ls-panel').getBoundingClientRect();
      const results = ${root}.querySelector('.ls-results').getBoundingClientRect();
      return panel.left >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight && results.height > 100;
    })()`), Boolean, 'Search results must stay visible within the viewport');
    if (process.env.SPOTLIGHT_UI_SCREENSHOT) {
      const shot = await call('Page.captureScreenshot', { format: 'png' }, officePage);
      await writeFile(`${process.env.SPOTLIGHT_UI_SCREENSHOT}-${width}.png`, Buffer.from(shot.data, 'base64'));
    }
  }
  await call('Emulation.clearDeviceMetricsOverride', {}, officePage);

  await evaluate(officePage, `${root}.querySelector('[role=option]').click()`);
  const officeOpened = await until(() => evaluate(background, `(async () => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === '${origin}/office-fixture');
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__officeOpened }))[0].result;
  })()`), Boolean, 'Office match must open its LEARN viewer');
  assert.match(officeOpened, /\/d2l\/le\/content\/246\/viewContent\/246[12]\/View$/);
  assert.ok(requested.some(url => url.includes('/246/content/topics/2461/file?stream=true')), 'PowerPoint must use its streaming topic endpoint');
  assert.ok(requested.some(url => url.includes('/246/notes.docx')), 'Word must use the supplied course content URL');
  if (ocrPdfBytes) await checkRealOcr(`${origin}/office-fixture`);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ automaticExtraction: 'passed', pageSnippets: 'passed', courseSectionInstructorFilters: 'passed',
    keyboardPageOpening: opened, officeAutomaticExtraction: 'passed', officeSlideAndParagraphMatches: 'passed', officeViewerOpening: officeOpened, originalResourceHistory: 'passed', offscreenRestartPersistence: 'passed',
    interruptedExitReopening: 'passed', tabSwitchReopening: 'passed', focusedTabFallback: 'passed', fullyClosedLocalShortcutReopening: 'passed', automaticLearnShortcut: 'passed', clearLearnData: 'passed',
    courseSiteDiscovery: 'passed', websiteIndexing: 'passed', websiteSectionOpening: 'passed', websiteRemoval: 'passed', crossTabLoginGate: 'passed', standaloneNewTabSearch: 'passed', collapsedSettings: 'passed', settingsWheelScrolling: 'passed', coursePdfPrioritization: 'passed', persistentPdfFailures: 'passed', individualPdfRetry: 'passed', browserErrors: 0 }, null, 2));
  }
} finally {
  browser.kill();
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Browser check closed.')); }
  pending.clear();
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else browser.once('exit', resolveExit); });
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
