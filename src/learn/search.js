import { compareDateIntent, prepareSearchQuery, rankResource } from '../search/rank.js';
import { studyWeight } from '../search/relevance.js';

export function filterResources(resources, { courseId = '', source = '', documents = false, recent = false, history = {}, notesSection = '', instructor = '' } = {}) {
  return resources.filter((resource) => {
    return (!courseId || resource.courseId === courseId) &&
      (!source || resource.source === source) &&
      (!notesSection || resource.notesSection === notesSection) &&
      (!instructor || resource.instructor === instructor) &&
      (!documents || ['PDF', 'DOC', 'NOTES', 'SLIDES'].includes(resource.type)) &&
      (!recent || Boolean(history[resource.id]));
  });
}

export function searchResources(resources, { query = '', limit = 100, history = {}, ...filters } = {}) {
  const results = filterResources(resources, { ...filters, history });
  if (!query.trim()) {
    const opened = results.filter((resource) => history[resource.id]);
    return (opened.length ? opened.sort((a, b) => history[b.id] - history[a.id]) : results).slice(0, 8);
  }
  return rankResources(resources, { query, ...filters, history }).slice(0, limit).map(({ resource }) => resource);
}

export function rankResources(resources, { query = '', ...filters } = {}) {
  const parsed = prepareSearchQuery(resources, query);
  return filterResources(resources, filters).map((resource, order) => ({ resource, order, rank: rankResource(resource, parsed) }))
    .filter((item) => item.rank)
    .sort((a, b) => compareDateIntent({ ...a, courseRelevance: a.rank.courseRelevance }, { ...b, courseRelevance: b.rank.courseRelevance }, parsed)
      || Number(b.rank.exactTitle) - Number(a.rank.exactTitle) || Number(b.rank.exactIdentifier) - Number(a.rank.exactIdentifier) || b.rank.score * studyWeight(b.resource, query) - a.rank.score * studyWeight(a.resource, query) || a.order - b.order);
}
