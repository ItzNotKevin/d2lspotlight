import { extractCourseCode } from '../search/courseCode.js';

export const SITE_HOSTS = ['student.cs.uwaterloo.ca', 'www.student.cs.uwaterloo.ca'];
export const MAX_SITE_PAGES = 12;
export const MAX_HTML_BYTES = 256 * 1024;
export const MAX_SITE_RESOURCES = 150;
export const siteKey = site => `${site.courseId}:${site.root}`;

export function courseTerm(course) {
  const text = `${course.code || ''} ${course.name || ''}`.replace(/[_-]/g, ' ');
  const short = text.match(/\b([FWS])\s*(\d{2}|20\d{2})\b/i);
  const long = text.match(/\b(fall|winter|spring|summer)\s*(20\d{2})\b/i);
  return short ? `${short[1].toUpperCase()}${short[2].slice(-2)}` : long ? `${long[1][0].toUpperCase()}${long[2].slice(-2)}` : '';
}

export function validateCourseSite(value, course) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/~([a-z]{2,8})(\d{1,4}[a-z]?)\/([fws]\d{2})\//i);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !SITE_HOSTS.includes(url.hostname)
    || !match || url.search || extractCourseCode(`${match[1]}${match[2]}`) !== extractCourseCode(course.code || course.name)
    || (courseTerm(course) && courseTerm(course) !== match[3].toUpperCase())) throw new Error('Choose the matching course and term on a supported Waterloo CS website.');
  url.hash = '';
  const root = `${url.origin}${match[0]}`;
  return { courseId: course.id, url: url.href, root, code: extractCourseCode(course.code || course.name), term: match[3].toUpperCase() };
}

export function sitePageUrl(value, site) {
  try {
    const url = new URL(value, site.url);
    if (url.username || url.password || url.search || url.origin !== new URL(site.root).origin || !url.href.startsWith(site.root)) return null;
    if (!/\.(?:s?html?|php)$/i.test(url.pathname) && !url.pathname.endsWith('/')) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function detectCourseSites(links, course) {
  const sites = new Map();
  for (const link of links.slice(0, 250)) {
    try {
      const site = validateCourseSite(link.url, course);
      if (!sitePageUrl(site.url, site)) continue;
      if (!sites.has(site.root)) sites.set(site.root, { ...site,
        reason: /(?:does\s+not|do\s+not|not\s+use).*learn|course\s+(?:webpage|website|web\s*site)/i.test(link.context || '') ? 'Linked from a course website notice' : 'Course and term match the LEARN course' });
    } catch { /* Ignore unrelated links and previous-term sites. */ }
  }
  return [...sites.values()].slice(0, 3);
}

// Runs only in the signed-in LEARN tab. Open Shadow DOM is common in D2L widgets.
export function readCourseHomeLinks() {
  const links = [];
  let visited = 0;
  function walk(root) {
    for (const element of root.children || []) {
      if (++visited > 15000 || links.length >= 250) return;
      if (element.id === 'learn-spotlight-root') continue;
      if (element.tagName === 'A' && element.href) links.push({ url: element.href,
        context: (element.closest('p,article,section,li')?.textContent || element.textContent || '').slice(0, 500) });
      if (element.shadowRoot) walk(element.shadowRoot);
      walk(element);
    }
  }
  walk(document.documentElement);
  return { url: location.href, links };
}

export async function fetchSiteHtml(url, site, { signal, fetchImpl = fetch } = {}) {
  const target = sitePageUrl(url, site);
  if (!target) throw new Error('Page is outside the selected course website.');
  const response = await fetchImpl(target, { credentials: 'omit', redirect: 'error', signal,
    headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`Course website returned HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('This link is not an HTML course page.');
  if (Number(response.headers.get('content-length')) > MAX_HTML_BYTES) throw new Error('Course page exceeds the 256 KiB limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Course page was empty.');
  let bytes = 0;
  let html = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) throw new Error('Course page exceeds the 256 KiB limit.');
      html += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => {}); }
  return html + decoder.decode();
}

export async function crawlCourseSite(site, course, accountId, { loadPage, parsePage, signal, onProgress = () => {} }) {
  const queue = [site.url];
  const visited = new Set();
  const resources = new Map();
  let failures = 0;
  let truncated = false;
  while (queue.length && visited.size < MAX_SITE_PAGES) {
    signal.throwIfAborted();
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    onProgress(visited.size);
    try {
      const parsed = await parsePage(await loadPage(url), url);
      signal.throwIfAborted();
      if (visited.size === 1 && parsed.courseCode && parsed.courseCode !== site.code) throw new Error('Website title belongs to a different course.');
      truncated ||= parsed.partial;
      const add = (title, contentText, destination, suffix, extra = {}) => {
        if (resources.size >= MAX_SITE_RESOURCES) { truncated = true; return; }
        const id = `website:${accountId}:${course.id}:${site.root}:${url}:${suffix}`;
        resources.set(id, { id, courseId: course.id, course: course.code, courseName: course.name,
          title, type: 'NOTES', source: 'Website', path: `Course website / ${parsed.title}`, url: destination,
          siteKey: siteKey(site), parentUrl: url, contentText: contentText.slice(0, 1500),
          snippet: contentText.slice(0, 260), ...extra });
      };
      add(parsed.title, parsed.intro, parsed.forwardUrl || url, 'page', parsed.forwardUrl ? { type: 'LINK', websiteReference: true, directLink: true } : {});
      for (const [number, section] of (parsed.forwardUrl ? [] : parsed.sections).entries()) add(section.title, section.text, section.url, `section:${number}`, { websiteSection: true, aliases: section.aliases });
      for (const link of parsed.links) {
        const internal = sitePageUrl(link.url, site);
        if (internal) { if (!visited.has(internal) && !queue.includes(internal)) queue.push(internal); }
        else if (link.reference && link.url !== parsed.forwardUrl && link.label && /^https:\/\/(?:[a-z0-9-]+\.)*uwaterloo\.ca\//i.test(link.url)) {
          add(`${link.label} · linked reference`, `${parsed.title}. ${link.context}`, link.url, `reference:${link.url}`, { type: 'LINK', websiteReference: true });
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      if (visited.size === 1) throw error;
      failures++;
    }
  }
  return { resources: [...resources.values()], pageCount: visited.size - failures,
    partial: Boolean(queue.length || failures || truncated), failures };
}
