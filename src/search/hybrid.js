import { normalizeQuery, prepareQuery } from './rank.js';
import { filterResources, searchResources } from '../learn/search.js';
import { MIN_SIMILARITY } from './semantic/config.js';

export function semanticConstraintsMatch(resource, query) {
  const parsed = prepareQuery(query);
  const courseWords = normalizeQuery(resource.course).split(' ');
  const fields = [resource.title, resource.course, resource.path, resource.type, resource.service, ...(resource.aliases || [])];
  const words = new Set(normalizeQuery(fields.join(' ')).split(' '));
  const titleAssignments = prepareQuery(resource.title).assignments;
  const assignments = titleAssignments.length ? titleAssignments : prepareQuery(resource.path).assignments;
  if (!parsed.assignments.every((id) => assignments.includes(id))) return false;
  return parsed.words.filter((word) => /\d|\+|#/.test(word)).every((word) => {
    if (/^[a-z]{2,8}\d{2,4}[a-z]?$/.test(word) && !/^(?:week|lecture|lec|chapter|unit|module|section|topic|page|slide)s?\d/.test(word)) return courseWords.includes(word);
    return words.has(word);
  });
}

export function hybridSearch(resources, options, semanticMatches = []) {
  const lexical = searchResources(resources, options);
  if (!options.query?.trim() || !prepareQuery(options.query).words.length) return lexical;
  const limit = options.limit ?? 100;
  const eligible = new Map(filterResources(resources, options).map((resource) => [resource.id, resource]));
  const seen = new Set(lexical.map((resource) => resource.id));
  const added = [];
  for (const match of [...semanticMatches].sort((a, b) => b.score - a.score)) {
    const resource = eligible.get(match.id);
    if (!resource || seen.has(match.id) || !Number.isFinite(match.score) || match.score < MIN_SIMILARITY || match.score > 1) continue;
    if (!semanticConstraintsMatch(resource, options.query)) continue;
    seen.add(match.id);
    added.push({ ...resource, semanticMatch: true });
  }
  return [...lexical, ...added].slice(0, limit);
}
