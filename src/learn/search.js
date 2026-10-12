import { prepareQuery, rankResource } from '../search/rank.js';
import { contextualOrder } from '../search/context.js';

export function searchResources(resources, { query = '', courseId = '', source = '', documents = false, recent = false, history = {}, limit = 100 } = {}) {
  const parsed = prepareQuery(query);
  const results = resources.filter((resource) => {
    return (!courseId || resource.courseId === courseId) &&
      (!source || resource.source === source) &&
      (!documents || ['PDF', 'DOC', 'NOTES', 'SLIDES'].includes(resource.type)) &&
      (!recent || Boolean(history[resource.id]));
  });
  if (!query.trim()) {
    const opened = results.filter((resource) => history[resource.id]);
    return (opened.length ? opened.sort((a, b) => history[b.id] - history[a.id]) : results).slice(0, 8);
  }
  const ranked = results.map((resource, order) => ({ resource, order, rank: rankResource(resource, parsed) }))
    .filter((item) => item.rank)
    .sort((a, b) => b.rank.score - a.rank.score || a.order - b.order).map(({ resource }) => resource);
  if (parsed.latest) {
    // Reorder only each course's slots; cross-course scores stay comparable.
    const groups = new Map();
    for (const resource of ranked) {
      const key = resource.courseId || resource.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(resource);
    }
    for (const group of groups.values()) group.sort((a, b) => contextualOrder(a, b, parsed));
    return ranked.map((resource) => groups.get(resource.courseId || resource.id).shift()).slice(0, limit);
  }
  return ranked.slice(0, limit);
}
