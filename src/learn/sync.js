import { normalizeToc } from './normalize.js';
import { enrichLearnLinks } from './links.js';

export const REFRESH_INTERVAL = 5 * 60 * 1000;

export async function refreshCourses({ client, session, previous, signal, onProgress = () => {}, onSnapshot = async () => {}, onDiagnostic = () => {} }) {
  const resources = [];
  const failedCourses = [];
  for (const [index, course] of session.courses.entries()) {
    signal.throwIfAborted();
    onProgress(index + 1, session.courses.length);
    try {
      const toc = await client.loadCourse(session.le, course);
      signal.throwIfAborted();
      const normalized = normalizeToc(toc, course, session.accountId);
      for (const resource of normalized) if (resource.type === 'PDF') {
        // The streaming file endpoint preserves inline PDF viewing and course permissions.
        resource.pdfUrl ||= `https://learn.uwaterloo.ca/d2l/api/le/${session.le}/${resource.courseId}/content/topics/${resource.topicId}/file?stream=true`;
      } else if (resource.documentFormat) {
        resource.documentUrl ||= `https://learn.uwaterloo.ca/d2l/api/le/${session.le}/${resource.courseId}/content/topics/${resource.topicId}/file?stream=true`;
      }
      resources.push(...await enrichLearnLinks(normalized, { signal, onDiagnostic,
        loadTopic: client.loadTopic ? (resource) => client.loadTopic(session.le, resource) : undefined,
        loadHtml: client.loadHtml ? (resource) => client.loadHtml(resource) : undefined }));
    } catch (error) {
      signal.throwIfAborted();
      // Stop a throttled or expired session rather than sending more requests.
      if (['RATE_LIMIT', 'SESSION', 'NOT_JSON'].includes(error.code)) throw error;
      failedCourses.push(course.id);
      // Never retain items for a course whose access was explicitly revoked.
      if (error.code !== 'FORBIDDEN' && previous.accountId === session.accountId) {
        resources.push(...previous.resources.filter((item) => item.courseId === course.id));
      }
    }
    const pending = session.courses.slice(index + 1).map((item) => item.id);
    await onSnapshot({ accountId: session.accountId, courses: session.courses,
      resources: [...resources, ...(previous.accountId === session.accountId ? previous.resources.filter((item) => pending.includes(item.courseId)) : [])],
      failedCourses: [...failedCourses, ...pending], updatedAt: null, generation: previous.generation });
  }
  return { accountId: session.accountId, courses: session.courses, resources,
    failedCourses, updatedAt: Date.now(), generation: previous.generation };
}
