import { CACHE_KEY, emptyIndex } from '../../learn/cache.js';
import { PIAZZA_CACHE_KEY } from '../../piazza/cache.js';
import { filterResources } from '../../learn/search.js';
import { semanticConstraintsMatch } from '../hybrid.js';
import { prepareQuery } from '../rank.js';
import { resourceText } from './model.js';
import { MODEL_ID, MODEL_REVISION } from './config.js';
import { openPdfCache } from '../pdf/cache.js';
import { documentDownloadUrl } from '../documents.js';
import { documentPassages, passageMatches } from './passages.js';
import { notesSection } from '../pdf/core.js';
import { openEmbeddingCache } from './cache.js';
import { associateCourses } from '../associations.js';
import { isSearchSender } from '../../message-sender.js';

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
  const metadata = associateCourses(learn.courses || [], piazza.courses || [], rawResources, confirmations[associationKey] || {}).resources.map(resource => {
    const course = learnCourses.get(resource.courseId);
    const labelled = resource.source === 'LEARN' ? { ...resource, notesSection: notesSection(resource), instructor: learn.pdfLabels?.[notesSection(resource)] || '' } : resource;
    return course ? { ...labelled, outlineCourseCode: course.code, outlineCourseName: course.name } : labelled;
  });
  let documents = [];
  let passageError = false;
  if (metadata.some(resource => resource.source === 'LEARN' && documentDownloadUrl(resource))) {
    try {
      const cache = await openPdfCache();
      try { documents = await cache.all(); } finally { cache.close(); }
    } catch { passageError = true; }
  }
  const { passages, totals } = documentPassages(metadata, documents);
  const resources = [...metadata, ...passages];
  const fingerprint = JSON.stringify([learn.generation, piazza.generation, totals,
    resources.map((resource) => [resource.source, resource.accountId, resource.id, resource.courseId, resource.modifiedAt,
      resource.outlineCourseCode, resource.outlineCourseName, resource.pdfPage, resource.documentLocation, resource.pdfPartial, resourceText(resource)])]);
  return { resources, history: { ...learn.history, ...piazza.history }, fingerprint, passageTotals: totals, passageError };
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
    if (!['semantic-search', 'semantic-cancel', 'semantic-status'].includes(message?.type) || !isSearchSender(sender, chrome.runtime.id)) return;
    if (message.type === 'semantic-status') {
      // Read private bundled assets in the extension worker, not the webpage.
      fetch(chrome.runtime.getURL('dist/model-manifest.json')).then(response => response.ok ? response.json() : null)
        .then(manifest => reply({ ok: true, available: manifest?.model === MODEL_ID && manifest?.revision === MODEL_REVISION }))
        .catch(() => reply({ ok: true, available: false }));
      return true;
    }
    if (message.type === 'semantic-cancel') {
      if (requests.get((sender.tab?.id ?? 'standalone')) === message.requestId) requests.delete((sender.tab?.id ?? 'standalone'));
      chrome.runtime.sendMessage({ target: 'semantic-offscreen', action: 'cancel',
        client: String((sender.tab?.id ?? 'standalone')), requestId: message.requestId }).catch(() => {});
      return;
    }
    const query = typeof message.query === 'string' ? message.query.trim().slice(0, 300) : '';
    if (query.length < 3 || !prepareQuery(query).words.length) {
      reply({ ok: true, matches: [] });
      return;
    }
    const requestId = typeof message.requestId === 'string' ? message.requestId : crypto.randomUUID();
    requests.set((sender.tab?.id ?? 'standalone'), requestId);
    const current = () => requests.get((sender.tab?.id ?? 'standalone')) === requestId;
    (async () => {
      await clearing;
      const before = await snapshot();
      if (!before.resources.length) return { ok: true, matches: [] };
      const filters = message.filters || {};
      const eligible = filterResources(before.resources.filter(resource => !resource.semanticPassage), { ...filters, history: before.history })
        .filter(resource => semanticConstraintsMatch(resource, query));
      const parentIds = new Set(eligible.map(resource => resource.id));
      const allowedIds = [...parentIds, ...before.resources.filter(resource => resource.semanticPassage && parentIds.has(resource.resourceId)).map(resource => resource.id)];
      if (!allowedIds.length) return { ok: true, matches: [] };
      await ensureDocument();
      if (!current()) return { ok: false, error: 'Search superseded.' };
      const response = await chrome.runtime.sendMessage({ target: 'semantic-offscreen', action: 'search',
        client: String((sender.tab?.id ?? 'standalone')), requestId, query, resources: before.resources, allowedIds, fingerprint: before.fingerprint });
      const after = await snapshot();
      if (!current() || after.fingerprint !== before.fingerprint) return { ok: false, error: 'Saved resources changed. Search again.' };
      if (!response?.ok) return response;
      const allowed = new Set(allowedIds);
      const parents = new Set(before.resources.filter(resource => !resource.semanticPassage && allowed.has(resource.id)).map(resource => resource.id));
      const totalPassages = Object.entries(before.passageTotals).reduce((sum, [id, count]) => sum + (parents.has(id) ? count : 0), 0);
      const passageIds = new Set(before.resources.filter(resource => resource.semanticPassage).map(resource => resource.id));
      return { ...response,
        matches: (response.matches || []).filter(match => !passageIds.has(match.id)),
        passageMatches: passageMatches(response.matches || [], before.resources.filter(resource => allowed.has(resource.id))),
        passageCoverage: { indexed: response.indexedPassages || 0, total: totalPassages, unavailable: before.passageError } };
    })().then(reply, () => reply({ ok: false, error: 'Meaning search unavailable. Keyword search still works.' })).finally(() => {
      if (current()) requests.delete((sender.tab?.id ?? 'standalone'));
    });
    return true;
  });
}
