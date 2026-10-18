import { pdfRevision } from './core.js';

// Count each resource once, using only text and attempts for its current revision.
export function documentCoverage(resources, status) {
  const cached = new Map((status?.documents || []).map(document => [document.id, document]));
  const result = { total: resources.length, indexed: 0, partial: 0, pending: 0, replaced: 0, failures: [] };
  for (const resource of resources) {
    const revision = pdfRevision(resource);
    const document = cached.get(resource.id);
    const attempt = status?.progress?.[resource.id];
    if (document?.revision === revision) {
      result.indexed++;
      if (document.partial || document.emptyPages) result.partial++;
    } else if (attempt?.revision === revision && attempt.state === 'failed') {
      result.failures.push({ resource, error: attempt.error || 'Document could not be read.' });
    } else if (attempt?.revision === revision && attempt.state === 'evicted') {
      result.replaced++;
    } else {
      result.pending++;
    }
  }
  return result;
}
