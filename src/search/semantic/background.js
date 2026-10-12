import { CACHE_KEY, emptyIndex } from '../../learn/cache.js';
import { PIAZZA_CACHE_KEY } from '../../piazza/cache.js';
import { filterResources } from '../../learn/search.js';
import { semanticConstraintsMatch } from '../hybrid.js';
import { prepareQuery } from '../rank.js';
import { resourceText } from './model.js';
import { openEmbeddingCache } from './cache.js';

let creating;
let clearing = Promise.resolve();
const requests = new Map();

async function ensureDocument() {
  const documentUrls = [chrome.runtime.getURL('semantic.html')];
  if ((await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls })).length) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({ url: 'semantic.html', reasons: ['WORKERS'],
      justification: 'Run local semantic search without blocking the course search interface.' }).finally(() => { creating = null; });
  }
  await creating;
}

async function snapshot() {
  const saved = await chrome.storage.local.get([CACHE_KEY, PIAZZA_CACHE_KEY]);
  const learn = saved[CACHE_KEY] || emptyIndex();
  const piazza = saved[PIAZZA_CACHE_KEY] || emptyIndex();
  const resources = [[learn, 'LEARN'], [piazza, 'Piazza']].flatMap(([index, source]) => index.accountId
    ? index.resources.map((resource) => ({ ...resource, source, accountId: index.accountId })) : []);
  const fingerprint = JSON.stringify([learn.generation, piazza.generation,
    resources.map((resource) => [resource.source, resource.accountId, resource.id, resourceText(resource)])]);
  return { resources, history: { ...learn.history, ...piazza.history }, fingerprint };
}

export async function clearSemanticCache() {
  const task = clearing.then(async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('semantic.html')] });
    if (contexts.length) {
      const result = await chrome.runtime.sendMessage({ target: 'semantic-offscreen', action: 'clear' });
      if (!result?.ok) throw new Error(result?.error || 'Could not clear meaning-search data.');
    } else {
      const cache = await openEmbeddingCache();
      try { await cache.clear(); } finally { cache.close(); }
    }
  });
  clearing = task.catch(() => {});
  return task;
}

export function registerSemanticSearch() {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!['semantic-search', 'semantic-cancel'].includes(message?.type) || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return;
    if (message.type === 'semantic-cancel') {
      if (requests.get(sender.tab.id) === message.requestId) requests.delete(sender.tab.id);
      chrome.runtime.sendMessage({ target: 'semantic-offscreen', action: 'cancel',
        client: String(sender.tab.id), requestId: message.requestId }).catch(() => {});
      return;
    }
    const query = typeof message.query === 'string' ? message.query.trim().slice(0, 300) : '';
    if (query.length < 3 || !prepareQuery(query).words.length) {
      reply({ ok: true, matches: [] });
      return;
    }
    const requestId = typeof message.requestId === 'string' ? message.requestId : crypto.randomUUID();
    requests.set(sender.tab.id, requestId);
    const current = () => requests.get(sender.tab.id) === requestId;
    (async () => {
      await clearing;
      const before = await snapshot();
      if (!before.resources.length) return { ok: true, matches: [] };
      const filters = message.filters || {};
      const allowedIds = filterResources(before.resources, { ...filters, history: before.history })
        .filter((resource) => semanticConstraintsMatch(resource, query)).map((resource) => resource.id);
      if (!allowedIds.length) return { ok: true, matches: [] };
      await ensureDocument();
      if (!current()) return { ok: false, error: 'Search superseded.' };
      const response = await chrome.runtime.sendMessage({ target: 'semantic-offscreen', action: 'search',
        client: String(sender.tab.id), requestId, query, resources: before.resources, allowedIds, fingerprint: before.fingerprint });
      const after = await snapshot();
      if (!current() || after.fingerprint !== before.fingerprint) return { ok: false, error: 'Saved resources changed. Search again.' };
      return response;
    })().then(reply, () => reply({ ok: false, error: 'Meaning search unavailable. Keyword search still works.' })).finally(() => {
      if (current()) requests.delete(sender.tab.id);
    });
    return true;
  });
}
