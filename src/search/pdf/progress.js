import { pdfRevision } from './core.js';

export const PDF_PROGRESS_KEY = 'pdfIndexProgressV1';

export function reconcilePdfProgress(saved, index, documents = []) {
  const resources = new Map(index.resources.filter(resource => resource.type === 'PDF').map(resource => [resource.id, resource]));
  const completed = new Set(documents.map(document => document.id));
  const entries = saved?.accountId === index.accountId ? Object.entries(saved.entries || {}).filter(([id, entry]) =>
    resources.has(id) && entry.revision === pdfRevision(resources.get(id)) && !completed.has(id)
    && ['pending', 'failed'].includes(entry.state)) : [];
  return { accountId: index.accountId, entries: Object.fromEntries(entries) };
}

export function updatePdfProgress(saved, index, message) {
  if (message.accountId !== index.accountId || message.generation !== index.generation) throw new Error('LEARN data changed. Reopen Spotlight.');
  const resource = index.resources.find(resource => resource.id === message.resourceId && resource.type === 'PDF' && resource.pdfUrl);
  if (!resource || typeof message.requestId !== 'string' || !message.requestId || message.requestId.length > 100) throw new Error('Invalid PDF progress update.');
  if (message.revision !== pdfRevision(resource)) throw new Error('LEARN data changed. Reopen Spotlight.');
  const progress = reconcilePdfProgress(saved, index);
  const previous = progress.entries[resource.id];
  if (message.state === 'failed' && previous?.requestId !== message.requestId) return progress;
  if (!['pending', 'failed'].includes(message.state)) throw new Error('Invalid PDF progress state.');
  return { ...progress, entries: { ...progress.entries, [resource.id]: {
    revision: pdfRevision(resource), requestId: message.requestId, state: message.state, updatedAt: Date.now(),
    ...(message.state === 'failed' ? { error: String(message.error || 'PDF could not be read.').slice(0, 300) } : {})
  } } };
}
