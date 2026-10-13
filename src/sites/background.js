import { ensureDocument } from '../search/semantic/background.js';
import { readCourseHomeLinks, detectCourseSites, validateCourseSite, siteKey, fetchSiteHtml, crawlCourseSite } from './core.js';

export function registerCourseSites(store, api = chrome) {
  const active = new Map();
  const pending = new Set();
  const cancelled = new Set();
  api.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'course-site' || sender.id !== api.runtime.id || !sender.tab || sender.frameId !== 0) return;
    const id = `${sender.tab.id}:${String(message.requestId || '')}`;
    if (message.action === 'cancel') { if (pending.has(id)) cancelled.add(id); active.get(id)?.abort(); reply({ ok: true }); return; }
    let senderUrl;
    try { senderUrl = new URL(sender.url); } catch { return; }
    if (senderUrl.origin !== 'https://learn.uwaterloo.ca') { reply({ ok: false, error: 'Manage course websites from a signed-in LEARN tab.' }); return; }
    // Request immediately inside the runtime event carrying the button's user
    // gesture; awaiting storage first would lose the permission request gesture.
    let permission = Promise.resolve(true);
    if (message.action === 'include') {
      try {
        const site = validateCourseSite(message.url, { id: message.courseId, code: message.code });
        permission = api.permissions.request({ origins: [`${new URL(site.root).origin}/*`] });
      } catch (error) { reply({ ok: false, error: error.message }); return; }
    }
    pending.add(id);
    (async () => {
      const granted = await permission;
      if (cancelled.has(id)) throw new Error('Website indexing cancelled.');
      if (!granted) throw new Error('Website access was not granted. LEARN search is still available.');
      const index = await store('read');
      if (!index.accountId || index.accountId !== message.accountId || index.generation !== message.generation) throw new Error('Check your LEARN session before indexing a website.');
      if (message.action === 'discover' || message.action === 'add') {
        const homeId = senderUrl.pathname.match(/^\/d2l\/home\/(\d+)\/?$/)?.[1];
        const course = index.courses.find(course => course.id === homeId);
        if (!course) return { ok: true, index };
        let sites;
        if (message.action === 'add') sites = [validateCourseSite(message.url, course)];
        else {
          const results = await api.scripting.executeScript({ target: { tabId: sender.tab.id }, world: 'ISOLATED', func: readCourseHomeLinks });
          const observed = results[0]?.result;
          if (observed?.url !== sender.url) throw new Error('Course tab changed. Reopen Spotlight on its home page.');
          sites = detectCourseSites(observed.links || [], course);
        }
        if (!sites.length) return { ok: true, index };
        return { ok: true, index: await store('discover-sites', { ...index, sites }) };
      }
      const selected = (index.courseSites || []).find(site => site.courseId === message.courseId && site.url === message.url);
      if (!selected) throw new Error('Detect or add this course website first.');
      const course = index.courses.find(course => course.id === selected.courseId);
      validateCourseSite(selected.url, course);
      if (message.action === 'remove') {
        for (const controller of active.values()) if (controller.siteKey === siteKey(selected)) controller.abort();
        return { ok: true, index: await store('remove-site', { ...index, key: siteKey(selected) }) };
      }
      if (!['include', 'refresh'].includes(message.action)) throw new Error('Unknown website action.');
      if (!await api.permissions.contains({ origins: [`${new URL(selected.root).origin}/*`] })) throw new Error('Website access was removed. Click Include website to allow access again.');
      if (active.size >= 2) throw new Error('Another website refresh is running. Retry shortly.');
      const controller = new AbortController();
      if (cancelled.has(id)) throw new Error('Website indexing cancelled.');
      controller.siteKey = siteKey(selected);
      active.set(id, controller);
      try {
        await store('begin-site', { ...index, key: siteKey(selected), run: id });
        await ensureDocument();
        const result = await crawlCourseSite(selected, course, index.accountId, {
          signal: controller.signal,
          onProgress: page => {
            api.tabs?.sendMessage(sender.tab.id, { type: 'course-site-progress', requestId: message.requestId, page }, { frameId: 0 }).catch(() => {});
          },
          loadPage: url => fetchSiteHtml(url, selected, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) }),
          parsePage: async (html, url) => {
            const response = await api.runtime.sendMessage({ target: 'site-parser', html, url });
            if (!response?.ok) throw new Error(response?.error || 'Course page parser unavailable.');
            return response.page;
          }
        });
        controller.signal.throwIfAborted();
        return { ok: true, index: await store('commit-site', { ...index, key: siteKey(selected), run: id, ...result }) };
      } finally { active.delete(id); }
    })().then(reply, error => reply({ ok: false, error: error.name === 'AbortError' ? 'Website indexing cancelled. Saved pages remain available.' : error.message || 'Course website unavailable.' })).finally(() => { pending.delete(id); cancelled.delete(id); });
    return true;
  });
}
