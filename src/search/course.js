import catalog from './catalog/waterloo.json' with { type: 'json' };
import { courseSubjectAliases } from './intent.js';

export function courseDescription(value) {
  const course = String(value || '').trim();
  if (/^[a-z0-9]{10,}$/i.test(course) && /\d/.test(course)) return '';
  return course
    .replace(/\b[a-z]{2,8}\s*\d{1,4}[a-z]{0,3}(?:_[a-z0-9]+)+\b/gi, '')
    .replace(/^\s*[a-z]{2,8}\s*\d{1,4}[a-z]{0,3}\b\s*[-:–—]?\s*/i, '')
    .replace(/[_\s]+/g, ' ').trim();
}

export function courseCatalogTitle(resource) {
  if (resource.source !== 'LEARN' && !String(resource.id || '').startsWith('https://learn.uwaterloo.ca:')) return '';
  const match = String(resource.course || '').match(/^([a-z]{2,8})[\s_-]*(\d{1,4}[a-z]{0,3})(?=$|[\s_:/-])/i);
  return match ? catalog.courses[`${match[1]}${match[2]}`.toUpperCase()] || '' : '';
}

export function courseText(resource) {
  const values = [courseDescription(resource.courseName), courseDescription(resource.course), courseCatalogTitle(resource), courseSubjectAliases(resource)];
  return [...new Set(values.filter(Boolean))].join('. ');
}

export function courseEmbeddingResource(resource) {
  return { ...resource, id: String(resource.courseId || resource.course || resource.courseName || '') };
}
