import { prepareQuery, matchesQueryConstraints, normalizeQuery } from '../rank.js';

export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_PAGES = 400;
export const MAX_PAGE_CHARS = 30000;
export const MAX_DOCUMENT_CHARS = 1000000;
export const MAX_CACHE_CHARS = 8000000;
export const MAX_DOCUMENTS = 100;
export const pdfRevision = resource => JSON.stringify([resource.pdfUrl, resource.modifiedAt]);
export const notesSection = resource => JSON.stringify([resource.courseId, resource.path || '']);

export function mergePdfResults(metadata, pages, limit = 100) {
  const matched = new Set(pages.map(page => page.resourceId));
  return [...pages, ...metadata.filter(resource => !matched.has(resource.id))].slice(0, limit);
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
  const metadata = normalizeQuery(`${resource.title} ${resource.path} ${resource.courseName} ${resource.instructor || ''}`);
  const matches = [];
  for (const { page, text } of pages) {
    const normalized = normalizeQuery(text);
    const words = normalized.split(' ');
    const contains = term => words.some(word => word === term || (term.length >= 4 && word === `${term}s`));
    if (!terms.every(term => contains(term) || metadata.split(' ').includes(term)) || !terms.some(contains)) continue;
    const matched = terms.filter(contains);
    const position = Math.max(0, text.toLowerCase().indexOf(matched[0]));
    const start = Math.max(0, position - 90);
    const snippet = `${start ? '…' : ''}${text.slice(start, start + 260)}${text.length > start + 260 ? '…' : ''}`;
    const phrase = normalized.includes(terms.join(' '));
    const occurrences = matched.reduce((sum, term) => sum + Math.min(words.filter(word => word === term || word === `${term}s`).length, 10), 0);
    matches.push({ page, snippet, score: matched.length * 20 + (phrase ? 15 : 0) + occurrences });
  }
  return matches.sort((a, b) => b.score - a.score || a.page - b.page).slice(0, limit);
}

export async function downloadPdf(url, { signal, fetchImpl = fetch } = {}) {
  pdfPageUrl({ pdfUrl: url }, 1);
  const response = await fetchImpl(url, { credentials: 'same-origin', redirect: 'error', signal,
    headers: { Accept: 'application/pdf' } });
  if ([401, 429].includes(response.status)) throw Object.assign(new Error(response.status === 401 ? 'Sign in to LEARN to index PDFs.' : 'LEARN is limiting requests. Retry later.'), { stop: true, code: response.status === 401 ? 'SESSION' : 'RATE_LIMIT' });
  if (!response.ok) throw new Error(`PDF unavailable (HTTP ${response.status}).`);
  const type = response.headers.get('content-type') || '';
  if (/text\/html/i.test(type)) throw Object.assign(new Error('LEARN returned a page instead of a PDF. Reopen Spotlight on signed-in LEARN.'), { stop: true });
  if (Number(response.headers.get('content-length')) > MAX_PDF_BYTES) throw new Error('PDF exceeds the 12 MB download limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('PDF response was empty.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PDF_BYTES) throw new Error('PDF exceeds the 12 MB download limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('This topic did not return a PDF.');
  return bytes;
}

export function encodePdf(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
