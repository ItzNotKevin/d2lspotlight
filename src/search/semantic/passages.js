import { MIN_SIMILARITY } from './config.js';
import { pdfRevision, pdfPageUrl, notesSection } from '../pdf/core.js';
import { isSearchableDocument, documentFormat, documentDownloadUrl } from '../documents.js';

export const MAX_PASSAGES = 2000;
export const PASSAGE_CHARS = 600;
export const PASSAGE_OVERLAP = 100;
export const MIN_PASSAGE_SIMILARITY = MIN_SIMILARITY;

// Keep passages within one physical page/Office location. OCR stays in the
// existing labelled keyword path until semantic OCR accuracy is evaluated.
export function documentPassages(resources, documents, { maxPassages = MAX_PASSAGES } = {}) {
  const parents = new Map(resources.filter(resource => resource.source === 'LEARN' && isSearchableDocument(resource) && documentDownloadUrl(resource)).map(resource => [resource.id, resource]));
  const groups = [];
  const totals = {};
  for (const document of documents) {
    const parent = parents.get(document.id);
    if (!parent || !parent.accountId || document.accountId !== parent.accountId || document.revision !== pdfRevision(parent)) continue;
    const chunks = [];
    for (const page of document.pages || []) {
      if (!Number.isInteger(page.page) || page.page < 1) continue;
      const text = String(page.text || '');
      for (let start = 0; start < text.length; start += PASSAGE_CHARS - PASSAGE_OVERLAP) {
        const passageText = text.slice(start, start + PASSAGE_CHARS).trim();
        if (!passageText) continue;
        chunks.push({ ...parent, id: `${parent.id}:passage:${page.page}:${start}`, resourceId: parent.id,
          semanticPassage: true, passageText, pdfPage: page.page, documentLocation: page.location,
          pdfPartial: document.partial, notesSection: notesSection(parent) });
        if (start + PASSAGE_CHARS >= text.length) break;
      }
    }
    totals[parent.id] = chunks.length;
    if (chunks.length) groups.push(chunks);
  }
  // Allocate the budget fairly across documents, then sample across each whole
  // document rather than silently indexing only the beginning of a large book.
  const quotas = groups.map(() => 0);
  let remaining = Math.max(0, Math.min(MAX_PASSAGES, Math.floor(maxPassages)));
  while (remaining > 0) {
    let allocated = false;
    for (let i = 0; i < groups.length && remaining > 0; i++) {
      if (quotas[i] < groups[i].length) { quotas[i]++; remaining--; allocated = true; }
    }
    if (!allocated) break;
  }
  const passages = groups.flatMap((chunks, group) => Array.from({ length: quotas[group] }, (_, i) => chunks[Math.floor(i * chunks.length / quotas[group])]));
  return { passages, totals };
}

export function passageMatches(matches, resources) {
  const byId = new Map(resources.filter(resource => resource.semanticPassage).map(resource => [resource.id, resource]));
  return matches.filter(match => Number.isFinite(match.score) && match.score >= MIN_PASSAGE_SIMILARITY && match.score <= 1 && byId.has(match.id))
    .sort((a, b) => b.score - a.score).map(match => {
      const passage = byId.get(match.id);
      return { ...passage, id: `${passage.resourceId}:page:${passage.pdfPage}`, pdfMatch: true, semanticMatch: true,
        semanticPassage: true, pdfScore: match.score * 40,
        url: documentFormat(passage) === 'PDF' ? pdfPageUrl(passage, passage.pdfPage) : passage.url,
        parentUrl: passage.url, snippet: passage.passageText };
    });
}

export function mergePassageMatches(keyword, semantic, limit = 50) {
  const seen = new Set();
  return [...keyword, ...semantic].filter(match => {
    const key = JSON.stringify([match.resourceId, match.pdfPage]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
