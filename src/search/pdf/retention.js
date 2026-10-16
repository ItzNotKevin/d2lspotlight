import { MAX_CACHE_CHARS, MAX_DOCUMENTS, pdfRevision } from './core.js';

export function shouldIndexPdf(resource, cachedRevision, progress, mode) {
  const revision = pdfRevision(resource);
  if (cachedRevision === revision) return false;
  const state = progress?.revision === revision ? progress.state : null;
  if (state === 'failed') return mode === '*' || mode === resource.id;
  if (state === 'evicted') return Boolean(mode);
  return true;
}

export function planPdfRetention(documents, incoming, resources, pinnedCourses = [], limits = {}) {
  const maxDocuments = limits.documents ?? MAX_DOCUMENTS;
  const maxChars = limits.chars ?? MAX_CACHE_CHARS;
  const courses = new Map(resources.map(resource => [resource.id, resource.courseId]));
  const candidates = documents.filter(document => document.id !== incoming.id);
  let chars = candidates.reduce((sum, document) => sum + document.chars, 0) + incoming.chars;
  let count = candidates.length + 1;
  const removed = [];
  for (const document of candidates.filter(document => !pinnedCourses.includes(courses.get(document.id)))
    .sort((a, b) => (a.lastUsedAt || a.indexedAt || 0) - (b.lastUsedAt || b.indexedAt || 0) || a.id.localeCompare(b.id))) {
    if (count <= maxDocuments && chars <= maxChars) break;
    removed.push(document.id);
    count--;
    chars -= document.chars;
  }
  if (count > maxDocuments || chars > maxChars) throw new Error('Document text cache is full. Unpin a course or clear document text to make space.');
  return removed;
}
