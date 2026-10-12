import { extractKnownLinks, isContextLaunch } from '../services.js';
import { parseResourceDate } from '../search/intent.js';

export function classFromUrl(value) {
  const url = new URL(value);
  if (url.origin !== 'https://piazza.com') return '';
  return url.pathname.match(/^\/class\/([a-zA-Z0-9]+)(?:\/|$)/)?.[1] || '';
}

async function pageCsrfToken() {
  if (typeof document === 'undefined' || location.origin !== 'https://piazza.com') return '';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'piazza-session' });
    return result?.ok ? result.token : '';
  } catch { return ''; }
}

export function summarizeApiError(error) {
  // Classify locally. Never expose arbitrary server text, tokens, or user data.
  const text = typeof error === 'string' ? error : JSON.stringify(error) || '';
  const category = /csrf|xsrf|cross.site request/i.test(text) ? 'CSRF'
    : /not.?logged|login|sign.?in|session|unauth|authenticat/i.test(text) ? 'AUTH'
    : /permission|denied|forbidden|access/i.test(text) ? 'PERMISSION'
    : /rate.?limit|too many|throttl/i.test(text) ? 'RATE_LIMIT'
    : /invalid|not valid|parameter|argument|method|format/i.test(text) ? 'REQUEST' : 'UNKNOWN';
  const code = typeof error === 'number' ? error : error?.code;
  return { category, errorType: typeof error, ...(Number.isSafeInteger(code) ? { serverCode: code } : {}) };
}

export async function piazzaRequest({ method, params, signal, fetchImpl = fetch, onDiagnostic = () => {}, getCsrfToken = pageCsrfToken }) {
  let status = null;
  let csrfHeaderPresent = false;
  let apiError;
  const fail = (code, message) => Object.assign(new Error(message), { code });
  try {
    signal?.throwIfAborted();
    const csrf = await getCsrfToken();
    signal?.throwIfAborted();
    if (typeof csrf !== 'string' || !csrf || csrf.length > 8192 || /[\r\n]/.test(csrf)) {
      throw fail('CSRF_UNAVAILABLE', 'Could not read Piazza’s page token. Reload the extension, refresh this Piazza tab, and try again.');
    }
    csrfHeaderPresent = Boolean(csrf);
    const response = await fetchImpl(`/logic/api?method=${encodeURIComponent(method)}`, {
      method: 'POST', credentials: 'same-origin', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(csrf ? { 'CSRF-Token': csrf } : {}) },
      body: JSON.stringify({ method, params }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
    });
    status = response.status;
    if ([401, 403].includes(status)) throw fail('AUTH', 'Piazza denied the request. Confirm you are signed in; an additional request header may be required.');
    if (status === 429) throw fail('RATE_LIMIT', 'Piazza is limiting requests. Wait before trying again.');
    if (!response.ok) throw fail('HTTP', `Piazza returned HTTP ${status}.`);
    if (!response.headers.get('content-type')?.includes('application/json')) throw fail('NOT_JSON', 'Piazza returned a page instead of JSON. Check your login.');
    const data = await response.json();
    if (data.error != null) {
      apiError = summarizeApiError(data.error);
      const message = apiError.category === 'CSRF'
        ? 'Piazza rejected the CSRF check. Refresh the Piazza tab and try again.'
        : apiError.category === 'AUTH' ? 'Piazza could not verify your session. Sign in and refresh this tab.'
        : 'Piazza returned an API error. Show diagnostics for the error category.';
      throw Object.assign(fail('API_ERROR', message), { apiCategory: apiError.category });
    }
    if (method === 'network.search' && !Array.isArray(data.result)) throw fail('SCHEMA', 'Unexpected Piazza search response.');
    onDiagnostic({ method, status, result: 'OK', csrfHeaderPresent, count: Array.isArray(data.result) ? data.result.length : undefined });
    return data.result;
  } catch (error) {
    if (signal?.aborted) throw error;
    const safe = error.code ? error : fail('NETWORK_OR_JSON', 'Request failed, timed out, or returned invalid JSON. Check your Piazza session.');
    onDiagnostic({ method, status, result: safe.code, csrfHeaderPresent, ...(apiError ? { apiError } : {}) });
    throw safe;
  }
}

export async function searchPiazza({ classId, query, ...options }) {
  if (!/^[a-zA-Z0-9]+$/.test(classId)) throw new Error('Open a Piazza class or enter its class ID.');
  if (!query.trim()) throw new Error('Type a search first.');
  return piazzaRequest({ ...options, method: 'network.search', params: { nid: classId, sort: 'date_desc', query: query.trim() } });
}

// Bounded pagination: a capped or repeating feed is explicitly marked partial.
export async function loadPiazzaFeed({ classId, signal, request = piazzaRequest, onPage = () => {} }) {
  if (!/^[a-zA-Z0-9]+$/.test(classId)) throw new Error('Invalid Piazza class ID.');
  const posts = new Map();
  const limit = 100;
  for (let page = 0; page < 20; page++) {
    signal?.throwIfAborted();
    const result = await request({ method: 'network.get_my_feed', params: { nid: classId, limit, offset: page * limit, sort: 'updated' }, signal });
    signal?.throwIfAborted();
    if (!Array.isArray(result?.feed)) throw new Error('Unexpected Piazza feed response. Refresh failed.');
    const before = posts.size;
    for (const post of result.feed) {
      if (!/^\d+$/.test(String(post.nr))) throw new Error('Piazza feed is missing post numbers.');
      posts.set(String(post.nr), post);
    }
    onPage(posts.size);
    if (result.feed.length < limit) return { posts: [...posts.values()], partial: false };
    if (posts.size === before) return { posts: [...posts.values()], partial: true };
  }
  return { posts: [...posts.values()], partial: true };
}

// Return plain text only; never insert source HTML into the visible document.
export function plainText(value) {
  const doc = new DOMParser().parseFromString(String(value || ''), 'text/html');
  doc.querySelectorAll('script,style,iframe,object').forEach((node) => node.remove());
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function normalizePosts(posts, classId, toText = plainText) {
  const seen = new Set();
  return posts.filter((post) => {
    if (!/^\d+$/.test(String(post.nr)) || seen.has(post.nr)) return false;
    seen.add(post.nr);
    return true;
  }).flatMap((post) => {
    const links = extractKnownLinks(post.content_snipet || '', 'https://piazza.com');
    const resource = {
    id: `piazza:${classId}:${post.nr}`, courseId: classId, course: 'Piazza', type: 'POST',
    title: (toText(post.subject) || `Post @${post.nr}`).slice(0, 300),
    path: (toText(post.content_snipet || '') || (post.folders || []).map(toText).join(' / ')).slice(0, 500),
    url: `https://piazza.com/class/${classId}?cid=${post.nr}`,
    modifiedAt: parseResourceDate(post.modified) ?? parseResourceDate(post.updated),
    aliases: [...new Set(links.flatMap((link) => link.aliases))]
    };
    return [resource, ...links.map((link) => ({
      ...resource, id: `${resource.id}:link:${link.url}`, type: 'LINK',
      title: `${link.name} · ${(toText(link.label) || resource.title).slice(0, 200)}`,
      path: `Linked from ${resource.title}`, url: isContextLaunch(link.url) ? resource.url : link.url, parentUrl: resource.url,
      service: link.name, aliases: link.aliases, destinationHost: link.hostname
    }))];
  });
}
