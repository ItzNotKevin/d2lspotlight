import { normalizeSearchText } from '../services.js';
import { extractCourseCode } from './courseCode.js';

const cache = new WeakMap();
// Course-level evidence, not claims about a particular week's contents.
const subjects = { STAT230: 'probability', STAT231: 'statistics' };
const concepts = [
  ['enumeration', 'combinatorics', 'counting'],
  ['inheritance', 'subclass', 'subclasses', 'superclass'],
  ['recursion', 'recursive'],
  ['derivative', 'derivatives', 'differentiation'],
  ['integral', 'integrals', 'integration']
];

export function resourceContext(resource) {
  if (cache.has(resource)) return cache.get(resource);
  const title = normalizeSearchText(resource.title).replace(/[_-]/g, ' ');
  const path = normalizeSearchText(resource.path).replace(/[_-]/g, ' ');
  const text = `${title} ${path}`;
  const match = title.match(/\b(?:week|wk)\s*0*(\d+)\b/) || path.match(/\b(?:week|wk)\s*0*(\d+)\b/);
  const week = match ? Number(match[1]) : null;
  const annotated = /\bannotated\b/.test(title);
  const assessment = /\b(?:assignment|homework|quiz|exam|midterm|a\s*\d+)\b/.test(title);
  const notes = !assessment && (annotated || /\b(?:lecture|lectures|notes|slides|lec)\b/.test(text) || resource.type === 'SLIDES');
  const courseCode = extractCourseCode(resource.course);
  const subject = subjects[courseCode.replace(/ /g, '')] || '';
  const aliases = [];
  if (notes) aliases.push('lecture notes');
  if (notes && resource.type === 'SLIDES') aliases.push('lecture slides notes');
  if (annotated && notes) aliases.push('annotated notes');
  if (week !== null) aliases.push(`week ${week}`);
  if (subject) aliases.push(subject);
  const words = new Set(text.match(/[a-z]+/g) || []);
  const related = concepts.filter((group) => group.some((word) => words.has(word))).flat();
  const result = { week, annotated, notes, subject, aliases, related };
  cache.set(resource, result);
  return result;
}

export function queryIntent(value) {
  let text = normalizeSearchText(value).replace(/[’']/g, '').replace(/_/g, ' ');
  const latest = /\b(?:latest|newest|most recent)\b|\bthis weeks?\b/.test(text);
  const authorNotes = /\b(?:teacher|teachers|professor|professors|instructor|instructors|prof)\s+(?:personal\s+)?(?:lecture\s+)?notes\b/g;
  const annotated = /\b(?:annotated|annotations)\b/.test(text) || new RegExp(authorNotes.source).test(text);
  text = text.replace(/\b(?:latest|newest|most recent)\b|\bthis weeks?\b/g, ' ')
    .replace(authorNotes, 'annotated notes')
    .replace(/\bannotations\b/g, 'annotated')
    .replace(/\b(?:in|from|of)\b/g, ' ');
  // A bare "latest" query requests study notes, rather than arbitrary links.
  if (latest && !text.trim()) text = 'notes';
  return { text, latest, annotated };
}

export function contextualOrder(a, b, intent) {
  if (!intent.latest) return 0;
  const left = resourceContext(a), right = resourceContext(b);
  // Never compare different classes' week numbers or label the current calendar week.
  if (!a.courseId || a.courseId !== b.courseId || !left.notes || !right.notes) return 0;
  if (left.week !== null && right.week !== null) return right.week - left.week;
  if (left.week !== null || right.week !== null) return left.week !== null ? -1 : 1;
  const leftDate = Date.parse(a.modifiedAt), rightDate = Date.parse(b.modifiedAt);
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) return rightDate - leftDate;
  if (Number.isFinite(leftDate) !== Number.isFinite(rightDate)) return Number.isFinite(leftDate) ? -1 : 1;
  return 0;
}
