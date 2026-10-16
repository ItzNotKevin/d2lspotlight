import { compareDateIntent, courseRelevance, exactIdentifierMatch, matchesQueryConstraints, prepareQuery, prepareSearchQuery, rankResource, resourcePreference } from './rank.js';
import { filterResources, rankResources, searchResources } from '../learn/search.js';
import { MIN_SIMILARITY } from './semantic/config.js';
import { normalizedCourseScore } from './intent.js';
import { studyWeight } from './relevance.js';

export function semanticConstraintsMatch(resource, query) {
  return matchesQueryConstraints(resource, prepareQuery(query));
}

export function hybridSearch(resources, options, semanticMatches = []) {
  if (!options.query?.trim() || !semanticMatches.length) return searchResources(resources, options);
  const query = prepareSearchQuery(resources, options.query);
  if (!query.words.length) return query.dateOrder ? searchResources(resources, options) : [];
  const threshold = Number.isFinite(options.semanticThreshold) && options.semanticThreshold >= 0 && options.semanticThreshold < 1
    ? options.semanticThreshold : MIN_SIMILARITY;
  const limit = options.limit ?? 100;
  const eligible = new Map(filterResources(resources, options).map((resource) => [resource.id, resource]));
  const candidates = new Map(rankResources(resources, options).map((item) => [item.resource.id, { ...item, semantic: 0 }]));
  for (const match of semanticMatches) {
    const resource = eligible.get(match.id);
    if (!resource || !Number.isFinite(match.score) || match.score < threshold || match.score > 1) continue;
    if (!matchesQueryConstraints(resource, query)) continue;
    const item = candidates.get(match.id) || { resource, order: candidates.size, rank: rankResource(resource, query), semantic: 0 };
    item.semantic = Math.max(item.semantic, (match.score - threshold) / (1 - threshold));
    item.courseSemantic = Math.max(item.courseSemantic || 0, normalizedCourseScore(match.courseScore));
    if (match.outlineWeek) item.outlineWeek = match.outlineWeek;
    candidates.set(match.id, item);
  }
  return [...candidates.values()].map((item) => {
    const course = Math.max(courseRelevance(item.resource, query), item.courseSemantic || 0);
    return { ...item, courseRelevance: course,
      priority: item.rank?.exactTitle ? 2 : exactIdentifierMatch(item.resource, query) ? 1 : 0,
      score: (.35 * (item.rank?.relevance || 0) + .65 * item.semantic + .03 * resourcePreference(item.resource, query) + .18 * course + (item.rank?.titlePhrase ? .15 : 0)) * studyWeight(item.resource, options.query) };
  }).sort((a, b) => compareDateIntent(a, b, query) || b.priority - a.priority || b.score - a.score || (b.rank?.score || 0) - (a.rank?.score || 0) || a.order - b.order)
    .slice(0, limit).map(({ resource, rank, outlineWeek }) => ({ ...resource,
      ...(!rank ? { semanticMatch: true } : {}), ...(outlineWeek ? { outlineWeek } : {}) }));
}
