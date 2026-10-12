import { openEmbeddingCache } from './cache.js';

let worker;
let idleTimer;
const pending = new Map();

function stop() {
  worker?.terminate();
  worker = null;
  for (const { reply, timer } of pending.values()) {
    clearTimeout(timer);
    reply({ ok: false, error: 'Meaning search interrupted. Keyword search still works.' });
  }
  pending.clear();
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!pending.size) stop();
    else scheduleIdle();
  }, 120000);
}

function getWorker() {
  if (!worker) {
    worker = new Worker(chrome.runtime.getURL('dist/semantic-worker.js'), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.progress) return;
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      clearTimeout(request.timer);
      request.reply(data);
      scheduleIdle();
    };
    worker.onerror = stop;
  }
  return worker;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== 'semantic-offscreen' || sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.action === 'cancel') {
    const id = `${message.client}:${message.requestId}`;
    worker?.postMessage({ action: 'cancel', client: message.client, id });
    const request = pending.get(id);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(id);
      request.reply({ ok: false, error: 'Search superseded.' });
    }
    reply({ ok: true });
    scheduleIdle();
    return;
  }
  if (message.action === 'clear') {
    stop();
    openEmbeddingCache().then(async (cache) => {
      try { await cache.clear(); } finally { cache.close(); }
    }).then(
      () => reply({ ok: true }),
      () => reply({ ok: false, error: 'Could not clear meaning-search data.' })
    );
    return true;
  }
  if (message.action !== 'search') return;
  const id = `${message.client}:${message.requestId || crypto.randomUUID()}`;
  const timer = setTimeout(() => {
    pending.delete(id);
    reply({ ok: false, error: 'Meaning search timed out. Keyword search still works.' });
    stop();
  }, 120000);
  pending.set(id, { reply, timer });
  getWorker().postMessage({ ...message, id });
  scheduleIdle();
  return true;
});
