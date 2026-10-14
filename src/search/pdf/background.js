import { CACHE_KEY, emptyIndex } from '../../learn/cache.js';
import { filterResources } from '../../learn/search.js';
import { ensureDocument } from '../semantic/background.js';
import { openPdfCache } from './cache.js';
import { MAX_CACHE_CHARS, MAX_DOCUMENTS, pdfRevision, notesSection, searchPdfPages, pdfPageUrl } from './core.js';

let queue = Promise.resolve();
const active = new Map();
async function indexSnapshot() { return (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || emptyIndex(); }
function withCache(operation) {
  const task = queue.then(async () => {
    const cache = await openPdfCache();
    try { return await operation(cache); } finally { cache.close(); }
  });
  queue = task.catch(() => {});
  return task;
}
function currentDocument(document, index) {
  return document.accountId === index.accountId && index.resources.some(resource => resource.id === document.id && pdfRevision(resource) === document.revision);
}
function cancel(id) {
  active.delete(id);
  chrome.runtime.sendMessage({ target: 'pdf-offscreen', action: 'cancel', id }).catch(() => {});
}
export async function clearPdfCache() {
  for (const id of active.keys()) cancel(id);
  await withCache(cache => cache.clear());
  await chrome.storage.local.set({ pdfCacheRevision: crypto.randomUUID() });
}

export async function pdfStatus(cache, index) {
  const all = await cache.all();
  const stale = all.filter(document => !currentDocument(document, index));
  if (stale.length) await cache.remove(stale.map(document => document.id));
  const documents = all.filter(document => currentDocument(document, index));
  return { ok: true, documents: documents.map(({ id, revision, pages, chars, totalPages, partial, emptyPages }) =>
    ({ id, revision, pages: pages.length, chars, totalPages, partial, emptyPages })),
    chars: documents.reduce((sum, document) => sum + document.chars, 0), limit: MAX_CACHE_CHARS };
}

export async function searchPdfCache(cache, index, query, filters = {}) {
  const resources = index.resources.map(resource => ({ ...resource, source: 'LEARN',
    notesSection: notesSection(resource), instructor: index.pdfLabels?.[notesSection(resource)] || '' }));
  const allowed = new Map(filterResources(resources, { ...filters, history: index.history }).map(resource => [resource.id, resource]));
  const matches = [];
  for (const document of await cache.all()) {
    const resource = allowed.get(document.id);
    if (!resource || !currentDocument(document, index)) continue;
    for (const evidence of searchPdfPages(resource, document.pages, query)) {
      matches.push({ ...resource, id: `${resource.id}:page:${evidence.page}`, resourceId: resource.id,
        url: pdfPageUrl(resource, evidence.page), parentUrl: resource.url, pdfMatch: true,
        pdfPage: evidence.page, snippet: evidence.snippet, pdfScore: evidence.score, pdfPartial: document.partial });
    }
  }
  return matches.sort((a, b) => b.pdfScore - a.pdfScore || a.pdfPage - b.pdfPage).slice(0, 50);
}

export function registerPdfSearch() {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'pdf-index' || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return;
    const id = `${sender.tab.id}:${String(message.requestId || '').slice(0, 100)}`;
    let onLearn = false;
    try { onLearn = new URL(sender.url).origin === 'https://learn.uwaterloo.ca'; } catch {}
    if (message.action === 'cancel') { cancel(id); reply({ ok: true }); return; }
    (async () => {
      if (message.action === 'status') return withCache(async cache => pdfStatus(cache, await indexSnapshot()));
      if (message.action === 'search') return withCache(async cache => {
        const before = await indexSnapshot();
        const matches = await searchPdfCache(cache, before, String(message.query || '').slice(0, 300), message.filters || {});
        const after = await indexSnapshot();
        return before.generation === after.generation && before.accountId === after.accountId ? { ok: true, matches } : { ok: true, matches: [] };
      });
      if (message.action === 'prioritize-course' && onLearn) return withCache(async cache => {
        const index = await indexSnapshot();
        if (index.accountId !== message.accountId || index.generation !== message.generation || !index.courses.some(course => course.id === message.courseId)) throw new Error('LEARN data changed. Reopen Spotlight.');
        for (const id of active.keys()) cancel(id);
        await chrome.storage.local.set({ [`pdfIndexCourses:${index.accountId}`]: [message.courseId] });
        const keep = new Set(index.resources.filter(resource => resource.courseId === message.courseId).map(resource => resource.id));
        await cache.remove((await cache.all()).filter(document => !keep.has(document.id)).map(document => document.id));
        await chrome.storage.local.set({ pdfCacheRevision: crypto.randomUUID() });
        return pdfStatus(cache, index);
      });
      if (message.action !== 'extract' || !onLearn) throw new Error('Index PDFs from a signed-in LEARN tab.');
      const before = await indexSnapshot();
      const resource = before.resources.find(resource => resource.id === message.resourceId && resource.type === 'PDF' && resource.pdfUrl);
      if (!resource || before.accountId !== message.accountId || before.generation !== message.generation) throw new Error('LEARN data changed. Reopen Spotlight.');
      if (active.size >= 2 || active.has(id)) throw new Error('PDF indexing is busy in another tab. Retry shortly.');
      active.set(id, true);
      try {
        await ensureDocument();
        if (!active.has(id)) throw new Error('PDF indexing cancelled.');
        const response = await chrome.runtime.sendMessage({ target: 'pdf-offscreen', action: 'extract', id, bytes: message.bytes });
        if (!response?.ok) throw new Error(response?.error || 'PDF extraction unavailable.');
        return await withCache(async cache => {
          const after = await indexSnapshot();
          if (!active.has(id) || after.accountId !== before.accountId || after.generation !== before.generation
            || !after.resources.some(item => item.id === resource.id && pdfRevision(item) === pdfRevision(resource))) throw new Error('LEARN data changed. Reopen Spotlight.');
          const all = (await cache.all()).filter(document => currentDocument(document, after) && document.id !== resource.id);
          await cache.remove((await cache.all()).filter(document => !currentDocument(document, after)).map(document => document.id));
          if (all.length >= MAX_DOCUMENTS || all.reduce((sum, document) => sum + document.chars, 0) + response.document.chars > MAX_CACHE_CHARS) throw new Error('PDF text cache is full. Prioritize a course in Settings or clear PDF text.');
          await cache.put({ ...response.document, id: resource.id, accountId: before.accountId, revision: pdfRevision(resource) });
          await chrome.storage.local.set({ pdfCacheRevision: crypto.randomUUID() });
          return { ok: true, document: { ...response.document, pages: response.document.pages.length } };
        });
      } finally { active.delete(id); }
    })().then(reply, error => reply({ ok: false, error: error.message || 'PDF search unavailable.' }));
    return true;
  });
}
