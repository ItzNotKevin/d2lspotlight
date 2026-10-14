import { deduplicateSiteCandidates } from '../sites/core.js';
export const CACHE_KEY = 'learnSpotlightIndexV1';
export const emptyIndex = () => ({ version: 1, accountId: null, courses: [], resources: [], siteResources: [], courseSites: [], history: {}, pdfLabels: {}, updatedAt: null, failedCourses: [], generation: null });

// Only the service worker mutates storage. Its message queue serializes writes
// from multiple tabs so indexing cannot overwrite a recently opened resource.
export function createIndexStore(storage, key = CACHE_KEY) {
  let queue = Promise.resolve();
  async function read() {
    const value = (await storage.get(key))[key];
    return value?.version === 1 && Array.isArray(value.resources) && Array.isArray(value.courses) && Array.isArray(value.failedCourses) && value.history ? value : emptyIndex();
  }
  async function handle(action, payload = {}) {
    const current = await read();
    if (action === 'read') return current;
    let next = current;
    if (action === 'begin') {
      if (!payload.accountId) throw new Error('Missing account identity.');
      next = current.accountId === payload.accountId ? current : emptyIndex();
      next = { ...next, accountId: payload.accountId, generation: crypto.randomUUID() };
    } else if (action === 'commit') {
      if (payload.generation !== current.generation || payload.accountId !== current.accountId) {
        throw new Error('A newer refresh replaced this one.');
      }
      const courseIds = new Set(payload.courses.map(course => course.id));
      const siteResources = (current.siteResources || []).filter(resource => courseIds.has(resource.courseId));
      const ids = new Set([...payload.resources, ...siteResources].map((item) => item.id));
      next = { ...current, courses: payload.courses, resources: payload.resources,
        siteResources, courseSites: (current.courseSites || []).filter(site => courseIds.has(site.courseId)),
        updatedAt: payload.updatedAt, failedCourses: payload.failedCourses,
        history: Object.fromEntries(Object.entries(current.history).filter(([id]) => ids.has(id))) };
    } else if (['discover-sites', 'begin-site', 'commit-site', 'remove-site'].includes(action)) {
      if (payload.accountId !== current.accountId || payload.generation !== current.generation) throw new Error('LEARN data changed. Reopen Spotlight.');
      if (action === 'discover-sites') {
        const sites = new Map(deduplicateSiteCandidates(current.courseSites || []).map(site => [`${site.courseId}:${site.root}`, site]));
        for (const site of payload.sites) {
          const key = `${site.courseId}:${site.root}`;
          if (!current.courses.some(course => course.id === site.courseId)) throw new Error('Course is no longer accessible.');
          const aliasExists = [...sites.values()].some(existing => existing.courseId === site.courseId && new URL(existing.root).pathname === new URL(site.root).pathname);
          if (!sites.has(key) && !aliasExists) {
            if (sites.size >= 10) throw new Error('Ten course websites are already saved. Remove one before adding another.');
            sites.set(key, { ...site, enabled: false });
          }
        }
        next = { ...current, courseSites: [...sites.values()] };
      } else {
        const selected = (current.courseSites || []).find(site => `${site.courseId}:${site.root}` === payload.key);
        if (!selected) throw new Error('Course website changed. Detect it again from LEARN.');
        if (action === 'begin-site') {
          next = { ...current, courseSites: current.courseSites.map(site => site === selected ? { ...site, run: payload.run } : site) };
          await storage.set({ [key]: next });
          return next;
        }
        if (action === 'commit-site' && selected.run !== payload.run) throw new Error('Website indexing was cancelled or replaced.');
        const retained = (current.siteResources || []).filter(resource => resource.siteKey !== payload.key);
        const documents = action === 'remove-site' ? [] : payload.partial
          ? [...payload.resources, ...(current.siteResources || []).filter(resource => resource.siteKey === payload.key && !payload.resources.some(item => item.id === resource.id))]
          : payload.resources;
        if (retained.length + documents.length > 600) throw new Error('Course website cache is full. Remove a website before indexing another.');
        next = { ...current, siteResources: [...retained, ...documents],
          courseSites: action === 'remove-site' ? current.courseSites.filter(site => site !== selected)
            : current.courseSites.map(site => site === selected ? { ...site, enabled: true, updatedAt: Date.now(),
              run: null, partial: Boolean(payload.partial), pageCount: payload.pageCount || 0 } : site),
          history: Object.fromEntries(Object.entries(current.history).filter(([id]) => !id.startsWith('website:') || [...retained, ...documents].some(resource => resource.id === id))) };
      }
    } else if (action === 'label-notes') {
      if (payload.accountId !== current.accountId || !current.resources.some(resource => resource.type === 'PDF' && JSON.stringify([resource.courseId, resource.path || '']) === payload.section)) throw new Error('Choose an indexed notes section.');
      const pdfLabels = { ...current.pdfLabels };
      const name = String(payload.name || '').trim().slice(0, 100);
      if (name) pdfLabels[payload.section] = name;
      else delete pdfLabels[payload.section];
      next = { ...current, pdfLabels };
    } else if (action === 'rename-course') {
      const name = String(payload.name || '').trim().slice(0, 100);
      if (!name || !current.courses.some((course) => course.id === payload.courseId)) throw new Error('Choose an indexed course and enter its name.');
      next = { ...current, generation: crypto.randomUUID(),
        courses: current.courses.map((course) => course.id === payload.courseId ? { ...course, name } : course),
        resources: current.resources.map((resource) => resource.courseId === payload.courseId ? { ...resource, course: name, courseName: name } : resource) };
    } else if (action === 'opened') {
      if (![...current.resources, ...(current.siteResources || [])].some((item) => item.id === payload.id)) return current;
      const history = { ...current.history, [payload.id]: Date.now() };
      next = { ...current, history: Object.fromEntries(Object.entries(history).sort((a, b) => b[1] - a[1]).slice(0, 100)) };
    } else if (action === 'clear') {
      next = emptyIndex();
    } else throw new Error('Unknown index action.');
    await storage.set({ [key]: next });
    return next;
  }
  return (action, payload) => {
    const task = queue.then(() => handle(action, payload));
    queue = task.catch(() => {});
    return task;
  };
}

export async function indexMessage(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type: 'learn-index', action, payload });
  if (!response?.ok) throw new Error(response?.error || 'Cannot access the saved index. Reload the extension and webpage.');
  return response.index;
}
