import { matchesIdentifiers, prepareQuery } from '../search/rank.js';
import { resourceContext } from '../search/context.js';

export function embeddingText(resource) {
  const facts = resourceContext(resource);
  return [resource.title, resource.course, resource.path, resource.service, ...(resource.aliases || []), ...facts.aliases].filter(Boolean).join('. ').slice(0, 2000);
}

export function semanticCandidates(resources, options) {
  const query = prepareQuery(options.query);
  return resources.filter((resource) => (!options.courseId || resource.courseId === options.courseId)
    && (!options.source || resource.source === options.source)
    && (!options.documents || ['PDF', 'DOC', 'NOTES', 'SLIDES'].includes(resource.type))
    && (!options.recent || options.history?.[resource.id])
    && matchesIdentifiers(resource, query) && (!query.latest || resourceContext(resource).notes));
}

export function cosine(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export function mergeSemantic(lexical, candidates, hits, threshold = .4) {
  const seen = new Set(lexical.map((resource) => resource.id));
  const byId = new Map(candidates.map((resource) => [resource.id, resource]));
  const extra = [...hits].filter((hit) => Number.isFinite(hit.score) && hit.score >= threshold)
    .sort((a, b) => b.score - a.score).flatMap((hit) => {
      if (seen.has(hit.id) || !byId.has(hit.id)) return [];
      seen.add(hit.id);
      return [{ ...byId.get(hit.id), semanticMatch: true }];
    }).slice(0, 10);
  return [...lexical, ...extra];
}
