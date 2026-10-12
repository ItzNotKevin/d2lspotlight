import { parseHTML } from 'linkedom';
import { splitOutlineText, OUTLINE_MAX_TOKENS } from '../outlines/chunks.js';

export const CATALOG_ENCODING_VERSION = 'catalog-v1';

export function catalogText(value) {
  if (typeof value !== 'string') return '';
  const { document } = parseHTML(`<html><body>${value}</body></html>`);
  document.querySelectorAll('script, style').forEach((element) => element.remove());
  document.querySelectorAll('p, div, li, br, h1, h2, h3, h4, tr').forEach((element) => {
    element.before(document.createTextNode(' '));
    element.after(document.createTextNode(' '));
  });
  return document.body.textContent.replace(/\s+/g, ' ').trim();
}

export function catalogCourseCode(value) {
  const match = String(value || '').trim().match(/^([A-Z]{2,8})\s*(\d{1,4}[A-Z]{0,3})$/i);
  if (!match) throw new Error(`Invalid catalog course code: ${String(value)}.`);
  return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
}

export function calendarConfiguration(html, pageUrl, level) {
  const origin = html.match(/window\.subdomain\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const id = html.match(/window\.catalogId\s*=\s*['"]([a-f0-9]{24})['"]/)?.[1];
  if (origin !== 'https://uwaterloocm.kuali.co' || !id) throw new Error(`Unsupported calendar configuration at ${pageUrl}.`);
  if (!['undergraduate', 'graduate'].includes(level)) throw new Error('Unsupported calendar level.');
  return { id, level, pageUrl, apiBase: `${origin}/api/v1/catalog` };
}

export function validateCatalogList(values) {
  if (!Array.isArray(values) || !values.length) throw new Error('The calendar course list is empty or invalid.');
  const codes = new Set();
  for (const value of values) {
    const code = catalogCourseCode(value?.__catalogCourseId);
    if (!/^[a-z0-9_-]+$/i.test(value.pid || '') || !/^[a-f0-9]{24}$/i.test(value.id || '') || !catalogText(value.title)) {
      throw new Error(`Incomplete calendar listing for ${code}.`);
    }
    if (codes.has(code)) throw new Error(`Duplicate course listing for ${code}.`);
    codes.add(code);
  }
  return values;
}

export function normalizeCatalogCourse(listing, detail, source) {
  const code = catalogCourseCode(listing.__catalogCourseId);
  if (detail.pid !== listing.pid || detail.id !== listing.id || catalogCourseCode(detail.__catalogCourseId) !== code) {
    throw new Error(`Calendar detail identity mismatch for ${code}.`);
  }
  const title = catalogText(detail.title);
  if (!title) throw new Error(`Missing title for ${code}.`);
  const description = catalogText(detail.description);
  const subject = catalogText(detail.subjectCode?.description || listing.subjectCode?.description).replace(/\s*\([A-Z]+\)$/, '');
  const crossListed = [...new Set((detail.crossListedCourses || []).map((course) => catalogCourseCode(course.__catalogCourseId)))].sort();
  return { key: `${source.id}:${code.replace(/ /g, '')}`, code, title, description, subject,
    level: source.level, catalogId: source.id, catalogTitle: source.title,
    sourceUrl: `${source.pageUrl}#/courses/${encodeURIComponent(listing.pid)}`,
    detailUrl: `${source.apiBase}/course/${source.id}/${encodeURIComponent(listing.pid)}`,
    recordId: detail.id, pid: detail.pid, effectiveFrom: detail.dateStart || null,
    crossListed, quality: description ? 'description' : 'title-only' };
}

export function catalogCoverage(sources, courses) {
  const levels = Object.fromEntries(sources.map((source) => [source.level, {
    listed: source.listed, collected: courses.filter((course) => course.catalogId === source.id).length
  }]));
  return { listed: sources.reduce((total, source) => total + source.listed, 0), collected: courses.length,
    uniqueCodes: new Set(courses.map((course) => course.code)).size,
    subjects: new Set(courses.map((course) => course.code.split(' ')[0])).size,
    withDescriptions: courses.filter((course) => course.description).length,
    titleOnly: courses.filter((course) => !course.description).map((course) => course.code), levels };
}

export async function createCatalogChunks(course, countTokens) {
  const code = catalogCourseCode(course.code);
  const title = String(course.title || '').trim();
  if (!title || !course.key || !['undergraduate', 'graduate'].includes(course.level)) throw new Error(`Incomplete catalog metadata for ${code}.`);
  const prefix = `${course.subject ? `${course.subject}. ` : ''}${title}.`;
  const description = String(course.description || '').trim();
  const bodies = description ? await splitOutlineText(description, prefix, countTokens) : [''];
  const chunks = [];
  for (const [part, body] of bodies.entries()) {
    const text = `${prefix}${body ? ` ${body}` : ''}`;
    const tokens = await countTokens(text);
    if (tokens > OUTLINE_MAX_TOKENS) throw new Error(`Catalog chunk exceeds the token budget for ${code}.`);
    chunks.push({ id: `${course.key}:${part}`, courseKey: course.key, course: code, title, level: course.level,
      sourceUrl: course.sourceUrl, quality: description ? 'description' : 'title-only', text, tokens });
  }
  return chunks;
}
