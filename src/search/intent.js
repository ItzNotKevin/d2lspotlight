import { normalizeSearchText } from '../services.js';

const subjectGroups = [
  ['statistics', 'stats', 'stat', 'statistical'],
  ['mathematics', 'math', 'maths'],
  ['biology', 'bio', 'biol', 'biological'],
  ['chemistry', 'chem', 'chemical'],
  ['physics', 'phys'],
  ['psychology', 'psych', 'psyc', 'psychological'],
  ['economics', 'econ', 'economic'],
  ['history', 'hist', 'historical'],
  ['philosophy', 'phil', 'philosophical'],
  ['sociology', 'soc', 'sociological'],
  ['anthropology', 'anth', 'anthro', 'anthropological'],
  ['geography', 'geog', 'geographical'],
  ['engineering', 'engg'],
  ['accounting', 'acct', 'acc'],
  ['business', 'bus'],
  ['literature', 'lit'],
  ['linguistics', 'ling', 'linguistic'],
  ['music', 'mus'],
  ['theatre', 'theater'],
  ['archaeology', 'archeology'],
  ['kinesiology', 'kin'],
  ['english', 'engl'],
  ['politics', 'poli', 'political']
];
const subjects = new Map(subjectGroups.flatMap(([canonical, ...aliases]) => [canonical, ...aliases].map((word) => [word, canonical])));
const departments = new Map([...subjects, ['cs', 'computer science'], ['compsci', 'computer science']]);

export function canonicalSubject(word) {
  return subjects.get(word) || word;
}

export function normalizedCourseScore(score) {
  return Number.isFinite(score) && score >= .4 && score <= 1 ? (score - .4) / .6 : 0;
}

export function courseSubjectAliases(resource) {
  const text = normalizeSearchText(`${resource.course || ''} ${resource.courseName || ''}`);
  return [...text.matchAll(/\b([a-z]{2,8})[\s_-]*\d{2,4}[a-z]?(?=$|[^a-z0-9])/g)]
    .map((match) => departments.get(match[1])).filter(Boolean).join(' ');
}

export function dateIntent(text) {
  const newest = /\b(?:latest|newest|recent|recently)\b/.test(text);
  const oldest = /\b(?:oldest|earliest)\b/.test(text);
  if (newest === oldest) return { text, dateOrder: null };
  return {
    text: text.replace(/\b(?:latest|newest|recent|recently|oldest|earliest)(?:\s+(?:updated|modified))?\b/g, ' ').replace(/\s+/g, ' ').trim(),
    dateOrder: newest ? 'desc' : 'asc'
  };
}

export function parseResourceDate(value) {
  if (typeof value === 'number' || typeof value === 'string' && /^\d{10,13}$/.test(value)) {
    const numeric = Number(value);
    const timestamp = numeric < 100000000000 ? numeric * 1000 : numeric;
    return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8640000000000000 ? timestamp : null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))?$/.test(value)) return null;
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function compareResourceDates(a, b, order) {
  if (!order) return 0;
  const first = parseResourceDate(a.modifiedAt);
  const second = parseResourceDate(b.modifiedAt);
  if (first === null || second === null) return Number(first === null) - Number(second === null);
  return order === 'desc' ? second - first : first - second;
}
