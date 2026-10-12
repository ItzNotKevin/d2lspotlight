import { prepareQuery, rankResource } from '../search/rank.js';

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
  return results.map((resource, order) => ({ resource, order, rank: rankResource(resource, parsed) }))
    .filter((item) => item.rank)
    .sort((a, b) => b.rank.score - a.rank.score || a.order - b.order)
    .slice(0, limit).map(({ resource }) => resource);
}
