import { prepareQuery, matchesQueryConstraints, normalizeQuery, topicPhrase, containsPhrase, rankResource } from '../rank.js';
import { studyWeight } from '../relevance.js';
import { documentDownloadUrl } from '../documents.js';

export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_PAGES = 400;
export const MAX_PAGE_CHARS = 30000;
export const MAX_DOCUMENT_CHARS = 1000000;
export const MAX_CACHE_CHARS = 8000000;
export const MAX_DOCUMENTS = 100;
export const pdfRevision = resource => resource.documentFormat ? JSON.stringify([resource.documentUrl, resource.modifiedAt, resource.documentFormat]) : JSON.stringify([resource.pdfUrl, resource.modifiedAt]);
export const notesSection = resource => JSON.stringify([resource.courseId, resource.path || '']);

export function mergePdfResults(metadata, pages, limit = 100, query = '') {
  const matched = new Set(pages.map(page => page.resourceId));
  const combined = [...pages, ...metadata.filter(resource => !matched.has(resource.id))];
  if (query.trim()) {
    const parsed = prepareQuery(query);
    const phrase = topicPhrase(parsed);
    const priority = resource => {
      const rank = rankResource(resource, parsed);
      if (rank?.exactTitle) return 4;
      if (rank?.exactIdentifier) return 3;
      if (phrase.split(' ').length > 1 && containsPhrase(resource.title, phrase)) return 2;
      return resource.pdfPhraseMatch ? 1 : 0;
    };
    const hasTeaching = combined.some(resource => studyWeight(resource, query) > 1);
    const incidental = resource => studyWeight(resource, query) < 1 && normalizeQuery(resource.title) !== normalizeQuery(query);
    // Stable ties preserve the source rank. Explicit date ordering stays intact.
    if (!parsed.dateOrder) {
      const priorities = new Map(combined.map(resource => [resource, priority(resource)]));
      combined.sort((a, b) => priorities.get(b) - priorities.get(a)
        || (hasTeaching ? Number(incidental(a)) - Number(incidental(b)) : 0));
    }
  }
  return combined.slice(0, limit);
}

export function pdfPageUrl(resource, page) {
  const url = new URL(resource.pdfUrl);
  if (url.origin !== 'https://learn.uwaterloo.ca' || url.username || url.password
    || !(url.pathname.startsWith('/content/') || /^\/d2l\/api\/le\/1\.\d+\/\d+\/content\/topics\/\d+\/file$/.test(url.pathname))
    || !Number.isInteger(page) || page < 1) throw new Error('Unsupported PDF destination.');
  url.hash = `page=${page}`;
  return url.href;
}

export function pageText(items) {
  return items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')
    .replace(/([a-z])-\s*\n\s*([a-z])/gi, '$1$2').replace(/\s+/g, ' ').trim();
}

export async function extractDocumentText(pdf, check = () => {}) {
  const pages = [];
  let chars = 0;
  let partial = pdf.numPages > MAX_PAGES;
  for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number++) {
    check();
    const page = await pdf.getPage(number);
    const text = pageText((await page.getTextContent()).items);
    check();
    const remaining = Math.min(MAX_PAGE_CHARS, MAX_DOCUMENT_CHARS - chars);
    if (text.length > remaining) partial = true;
    const saved = text.slice(0, remaining);
    pages.push({ page: number, text: saved });
    chars += saved.length;
    page.cleanup();
    if (chars >= MAX_DOCUMENT_CHARS) { partial ||= number < pdf.numPages; break; }
  }
  return { pages, chars, totalPages: pdf.numPages, partial,
    emptyPages: pages.filter(page => !page.text.trim()).length };
}

export function searchPdfPages(resource, pages, query, limit = 3) {
  const parsed = prepareQuery(query);
  if (!matchesQueryConstraints(resource, parsed)) return [];
  const terms = parsed.topics.filter(term => !/\d|\+|#/.test(term));
  if (!terms.length) return [];
  const queryPhrase = topicPhrase(parsed);
  const metadata = normalizeQuery(`${resource.title} ${resource.path} ${resource.courseName} ${resource.instructor || ''}`);
  const matches = [];
  for (const { page, text, location } of pages) {
    const normalized = normalizeQuery(text);
    const words = normalized.split(' ');
    const contains = term => words.some(word => word === term || (term.length >= 4 && word === `${term}s`));
    if (!terms.every(term => contains(term) || metadata.split(' ').includes(term)) || !terms.some(contains)) continue;
    const matched = terms.filter(contains);
    const position = Math.max(0, text.toLowerCase().indexOf(matched[0]));
    const start = Math.max(0, position - 90);
    const snippet = `${start ? '…' : ''}${text.slice(start, start + 260)}${text.length > start + 260 ? '…' : ''}`;
    const phrase = containsPhrase(normalized, queryPhrase);
    const occurrences = matched.reduce((sum, term) => sum + Math.min(words.filter(word => word === term || word === `${term}s`).length, 10), 0);
    matches.push({ page, snippet, location, phraseMatch: phrase && queryPhrase.split(' ').length > 1,
      score: matched.length * 20 + (phrase ? 15 : 0) + occurrences });
  }
  return matches.sort((a, b) => b.score - a.score || a.page - b.page).slice(0, limit);
}

export async function downloadPdf(url, { signal, fetchImpl = fetch, format = 'PDF' } = {}) {
  pdfPageUrl({ pdfUrl: url }, 1);
  const response = await fetchImpl(url, { credentials: 'same-origin', redirect: 'error', signal,
    headers: { Accept: format === 'PDF' ? 'application/pdf' : format === 'PPTX'
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation, application/octet-stream'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/octet-stream' } });
  if ([401, 429].includes(response.status)) throw Object.assign(new Error(response.status === 401 ? 'Sign in to LEARN to index PDFs.' : 'LEARN is limiting requests. Retry later.'), { stop: true, code: response.status === 401 ? 'SESSION' : 'RATE_LIMIT' });
  if (!response.ok) throw new Error(`${format} unavailable (HTTP ${response.status}).`);
  const type = response.headers.get('content-type') || '';
  if (/text\/html/i.test(type)) throw Object.assign(new Error(`LEARN returned a page instead of a ${format} file. Reopen Spotlight on signed-in LEARN.`), { stop: true });
  if (Number(response.headers.get('content-length')) > MAX_PDF_BYTES) throw new Error('Document exceeds the 12 MB download limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Document response was empty.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PDF_BYTES) throw new Error('Document exceeds the 12 MB download limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (format === 'PDF' ? !new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')
    : !['PPTX', 'DOCX'].includes(format) || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) throw new Error(`This topic did not return a ${format} file.`);
  return bytes;
}

export const downloadDocument = (resource, options) => downloadPdf(documentDownloadUrl(resource), { ...options, format: resource.type === 'PDF' ? 'PDF' : resource.documentFormat });

export function encodePdf(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
