export const LEARN_ORIGIN = 'https://learn.uwaterloo.ca';

export class LearnError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function selectVersion(products, code, minimum) {
  const versions = products.find((item) => item.ProductCode === code)?.SupportedVersions;
  const compare = (a, b) => {
    const [am, an] = a.split('.').map(Number);
    const [bm, bn] = b.split('.').map(Number);
    return am - bm || an - bn;
  };
  const compatible = versions?.filter((v) => /^1\.\d+$/.test(v) && compare(v, minimum) >= 0);
  if (!compatible?.length) throw new LearnError('VERSION', `No compatible ${code.toUpperCase()} API version reported.`);
  return compatible.sort(compare)[0];
}

export function createLearnClient({ fetchImpl = fetch, signal, onDiagnostic = () => {}, onIdentity = async () => {} } = {}) {
  async function get(path, stage) {
    if (!path.startsWith('/d2l/api/')) throw new LearnError('PATH', 'Unexpected API path.');
    let status = null;
    try {
      const response = await fetchImpl(path, {
        method: 'GET', credentials: 'same-origin', redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
      });
      status = response.status;
      if (status === 401) throw new LearnError('SESSION', 'Sign in to LEARN, then retry.');
      if (status === 403) throw new LearnError('FORBIDDEN', 'LEARN denied this request. Check your login; browser-session access may be unavailable.');
      if (status === 429) {
        const retry = response.headers.get('Retry-After');
        throw new LearnError('RATE_LIMIT', `LEARN is limiting requests. Retry ${/^\d+$/.test(retry || '') ? `after ${retry} seconds` : 'later'}.`);
      }
      if (!response.ok) throw new LearnError('HTTP', `LEARN returned HTTP ${status}.`);
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new LearnError('NOT_JSON', 'LEARN returned a page instead of data. Sign in and retry.');
      }
      let data;
      try { data = await response.json(); }
      catch { throw new LearnError('INVALID_JSON', 'LEARN returned invalid JSON.'); }
      onDiagnostic({ stage, status, result: 'OK' });
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      const safe = error instanceof LearnError ? error : new LearnError('NETWORK', 'Request failed or timed out. Check your connection and LEARN login.');
      onDiagnostic({ stage, status, result: safe.code });
      throw safe;
    }
  }

  return {
    async connect() {
      const products = await get('/d2l/api/versions/', 'versions');
      if (!Array.isArray(products)) throw new LearnError('SCHEMA', 'Unexpected version response.');
      const lp = selectVersion(products, 'lp', '1.49');
      const le = selectVersion(products, 'le', '1.82');
      onDiagnostic({ stage: 'selected versions', lp, le });
      const user = await get(`/d2l/api/lp/${lp}/users/whoami`, 'account');
      if (!user?.Identifier) throw new LearnError('SCHEMA', 'Account identity was missing.');
      await onIdentity(String(user.Identifier));
      const courses = new Map();
      const bookmarks = new Set();
      let bookmark = '';
      for (let page = 0; page < 100; page++) {
        const data = await get(`/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3&canAccess=true${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`, 'enrollments');
        if (!Array.isArray(data?.Items) || typeof data?.PagingInfo?.HasMoreItems !== 'boolean') {
          throw new LearnError('SCHEMA', 'Unexpected enrollment response.');
        }
        for (const item of data.Items) {
          const unit = item.OrgUnit;
          if (unit?.Id && item.Access?.CanAccess === true) courses.set(String(unit.Id), {
            id: String(unit.Id), name: unit.Name || unit.Code || 'Course', code: unit.Code || unit.Name || 'Course'
          });
        }
        if (!data.PagingInfo.HasMoreItems) return { accountId: String(user.Identifier), lp, le, courses: [...courses.values()] };
        bookmark = String(data.PagingInfo.Bookmark || '');
        if (!bookmark || bookmarks.has(bookmark)) throw new LearnError('PAGING', 'LEARN returned a repeated or missing page bookmark.');
        bookmarks.add(bookmark);
      }
      throw new LearnError('PAGING', 'Enrollment paging exceeded the safety limit.');
    },
    async loadCourse(le, course) {
      if (!/^1\.\d+$/.test(le) || !/^\d+$/.test(course.id)) throw new LearnError('PATH', 'Invalid course or version.');
      return get(`/d2l/api/le/${le}/${course.id}/content/toc`, 'course contents');
    },
    async loadTopic(le, resource) {
      if (!/^1\.\d+$/.test(le) || !/^\d+$/.test(resource.courseId) || !/^\d+$/.test(resource.topicId)) throw new LearnError('PATH', 'Invalid topic identifier.');
      return get(`/d2l/api/le/${le}/${resource.courseId}/content/topics/${resource.topicId}`, 'tool link details');
    },
    async loadHtml(resource) {
      const url = new URL(resource.contentUrl);
      if (url.origin !== LEARN_ORIGIN || url.username || url.password || !url.pathname.startsWith('/content/') || !/\.html?$/i.test(url.pathname)) {
        throw new LearnError('PATH', 'Unsupported HTML content path.');
      }
      const response = await fetchImpl(url.href, {
        method: 'GET', credentials: 'same-origin', redirect: 'error',
        headers: { Accept: 'text/html' },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
      });
      if (response.status === 429) throw new LearnError('RATE_LIMIT', 'LEARN is limiting requests. Retry later.');
      if (response.status === 401) throw new LearnError('SESSION', 'Sign in to LEARN, then retry.');
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new LearnError('HTML_UNAVAILABLE', 'Could not inspect this HTML topic.');
      const maximum = 256 * 1024;
      const reader = response.body?.getReader();
      if (!reader) throw new LearnError('HTML_UNAVAILABLE', 'HTML topic was empty.');
      const decoder = new TextDecoder();
      let size = 0;
      let html = '';
      try {
        while (true) {
          signal?.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maximum) throw new LearnError('HTML_SIZE', 'HTML topic exceeded the inspection limit.');
          html += decoder.decode(value, { stream: true });
        }
        return html + decoder.decode();
      } finally { await reader.cancel().catch(() => {}); }
    }
  };
}
