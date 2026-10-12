export const CACHE_KEY = 'learnSpotlightIndexV1';
export const emptyIndex = () => ({ version: 1, accountId: null, courses: [], resources: [], history: {}, updatedAt: null, failedCourses: [], generation: null });

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
      const ids = new Set(payload.resources.map((item) => item.id));
      next = { ...current, courses: payload.courses, resources: payload.resources,
        updatedAt: payload.updatedAt, failedCourses: payload.failedCourses,
        history: Object.fromEntries(Object.entries(current.history).filter(([id]) => ids.has(id))) };
    } else if (action === 'rename-course') {
      const name = String(payload.name || '').trim().slice(0, 100);
      if (!name || !current.courses.some((course) => course.id === payload.courseId)) throw new Error('Choose an indexed course and enter its name.');
      next = { ...current, generation: crypto.randomUUID(),
        courses: current.courses.map((course) => course.id === payload.courseId ? { ...course, name } : course),
        resources: current.resources.map((resource) => resource.courseId === payload.courseId ? { ...resource, course: name } : resource) };
    } else if (action === 'opened') {
      if (!current.resources.some((item) => item.id === payload.id)) return current;
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
