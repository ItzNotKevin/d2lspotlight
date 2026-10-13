import { CACHE_KEY, emptyIndex } from '../../learn/cache.js';
import { PIAZZA_CACHE_KEY } from '../../piazza/cache.js';
import { filterResources } from '../../learn/search.js';
import { semanticConstraintsMatch } from '../hybrid.js';
import { prepareQuery } from '../rank.js';
import { resourceText } from './model.js';
import { openEmbeddingCache } from './cache.js';
import { associateCourses } from '../associations.js';

let creating;
let clearing = Promise.resolve();
const requests = new Map();

export async function ensureDocument() {
  const documentUrls = [chrome.runtime.getURL('semantic.html')];
  const exists = (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls })).length;
  if (!exists && !creating) {
    creating = chrome.offscreen.createDocument({ url: 'semantic.html', reasons: ['WORKERS', 'DOM_PARSER'],
      justification: 'Run local semantic search without blocking the course search interface.' }).finally(() => { creating = null; });
  }
  if (!exists) await creating;
  // The document can exist before its module imports/listeners finish loading.
  // Wait for the parser/search entrypoint instead of losing the first request.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { if ((await chrome.runtime.sendMessage({ target: 'spotlight-offscreen', action: 'ready' }))?.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Local parsers did not become ready. Reload the extension and webpage.');
}

async function snapshot() {
  const saved = await chrome.storage.local.get([CACHE_KEY, PIAZZA_CACHE_KEY]);
  const learn = saved[CACHE_KEY] || emptyIndex();
  const piazza = saved[PIAZZA_CACHE_KEY] || emptyIndex();
  const associationKey = `courseAssociations:${JSON.stringify([learn.accountId, piazza.accountId])}`;
  const confirmations = await chrome.storage.local.get(associationKey);
  const rawResources = [[learn, 'LEARN'], [piazza, 'Piazza']].flatMap(([index, source]) => index.accountId
    ? [...index.resources, ...(source === 'LEARN' ? index.siteResources || [] : [])].map((resource) => ({ ...resource, source: resource.source || source, accountId: index.accountId })) : []);
  const learnCourses = new Map((learn.courses || []).map(course => [course.id, course]));
  const resources = associateCourses(learn.courses || [], piazza.courses || [], rawResources, confirmations[associationKey] || {}).resources.map(resource => {
    const course = learnCourses.get(resource.courseId);
    return course ? { ...resource, outlineCourseCode: course.code, outlineCourseName: course.name } : resource;
  });
  const fingerprint = JSON.stringify([learn.generation, piazza.generation,
    resources.map((resource) => [resource.source, resource.accountId, resource.id, resource.courseId, resource.modifiedAt,
      resource.outlineCourseCode, resource.outlineCourseName, resourceText(resource)])]);
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
