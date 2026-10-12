import { EMBEDDING_DIMENSIONS, MODEL_KEY } from './config.js';
import { courseText } from '../course.js';

export { courseDescription } from '../course.js';

function cleanText(value) {
  return String(value || '').replace(/[_\s]+/g, ' ').trim();
}

export function resourceText(resource, view = 'context') {
  if (view === 'course') return courseText(resource);
  const title = cleanText(resource.title).replace(/\.(?:pdf|docx?|pptx?|html?)$/i, '');
  if (view === 'title') return title || resourceText(resource);
  const values = [title, cleanText(resource.path).slice(0, 800), courseText(resource),
    cleanText(resource.service), ...(resource.aliases || []).map(cleanText)];
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value.toLocaleLowerCase())) return false;
    seen.add(value.toLocaleLowerCase());
    return true;
  }).join('. ');
}

export async function contentHash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function cacheKey(resource, view = 'context') {
  return JSON.stringify([MODEL_KEY, resource.source, String(resource.accountId), resource.id, view]);
}

export function validVector(vector, dimensions = EMBEDDING_DIMENSIONS) {
  return vector?.length === dimensions && Array.from(vector).every(Number.isFinite) && vector.some((value) => value !== 0);
}

export function cosineSimilarity(a, b) {
  if (!a?.length || a.length !== b?.length) return -1;
  let product = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return -1;
    product += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? Math.max(-1, Math.min(1, product / Math.sqrt(normA * normB))) : -1;
}

export async function embeddingFor(resource, { cache, embed, dimensions = EMBEDDING_DIMENSIONS, view = 'context' }) {
  const key = cacheKey(resource, view);
  const text = resourceText(resource, view);
  const hash = await contentHash(text);
  const saved = await cache.get(key);
  if (saved?.hash === hash && validVector(saved.vector, dimensions)) return saved.vector;
  const vector = await embed(text);
  if (!validVector(vector, dimensions)) throw new Error('Invalid embedding output.');
  await cache.put({ key, hash, vector: Array.from(vector) });
  return vector;
}
