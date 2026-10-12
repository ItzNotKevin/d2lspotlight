import { normalizeSearchText } from '../services.js';

const prepared = new WeakMap();
const fillers = new Set(['find', 'show', 'me', 'please', 'where', 'is', 'the', 'my', 'open', 'for', 'can', 'you']);

export function normalizeQuery(value) {
  return normalizeSearchText(value)
    .replace(/_/g, ' ')
    .replace(/\bweek\s*0*(\d+)\b/g, 'week $1')
    .replace(/\b(?:a|assignment|assignments|assn|hw|homework)\s*[-#:]?\s*0*(\d+)\b/g, 'assignment $1')
    .replace(/\b([a-z]{2,8})[\s_-]+(\d{2,4}[a-z]?)\b/g, '$1$2')
    .replace(/[^a-z0-9+#]+/g, ' ').trim();
}
function tokens(value) { return normalizeQuery(value).split(/\s+/).filter(Boolean); }
function assignmentIds(value) {
  return [...normalizeSearchText(value).matchAll(/\b(?:a|assignment|assignments|assn|hw|homework)\s*[-#:]?\s*0*(\d+)\b/g)].map((match) => match[1]);
}

function prepare(resource) {
  if (prepared.has(resource)) return prepared.get(resource);
  const context = normalizeSearchText(`${resource.title} ${resource.path}`).replace(/[_-]/g, ' ');
  const studyAliases = [];
  if (/\b(?:annotated|lecture|lectures|lec|slides)\b/.test(context)) studyAliases.push('lecture notes');
  if (/\bslides\b/.test(context) || resource.type === 'SLIDES') studyAliases.push('lecture slides notes');
  const values = [resource.title, resource.service, resource.course, [...(resource.aliases || []), ...studyAliases].join(' '), resource.path, resource.type, resource.destinationHost, resource.source];
  const fields = values.map((value, i) => ({ text: normalizeQuery(value), words: tokens(value), weight: [12, 11, 10, 9, 6, 5, 4, 4][i] }));
  const titleAssignments = assignmentIds(resource.title);
  const data = { fields, assignments: titleAssignments.length ? titleAssignments : assignmentIds(resource.path) };
  prepared.set(resource, data);
  return data;
}

// Bounded Damerau-Levenshtein distance; adjacent swapped letters count once.
export function editDistance(a, b, maximum = 2) {
  if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let minimum = maximum + 1;
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      minimum = Math.min(minimum, rows[i][j]);
    }
    if (minimum > maximum) return maximum + 1;
  }
  return rows[a.length][b.length];
}

export function prepareQuery(query) {
  const text = normalizeQuery(query);
  return { text, words: text.split(/\s+/).filter((word) => word && !fillers.has(word)), assignments: assignmentIds(query) };
}

export function rankResource(resource, query) {
  const data = prepare(resource);
  if (query.assignments.length && data.assignments.length && !query.assignments.every((id) => data.assignments.includes(id))) return null;
  let score = 0;
  let fuzzy = false;
  for (const word of query.words) {
    let best = 0;
    let exact = false;
    const identifier = /\d|\+|#/.test(word);
    for (const field of data.fields) {
      if (field.words.includes(word)) { best = Math.max(best, field.weight); exact = true; }
      else if (!identifier && field.words.some((candidate) => candidate.startsWith(word))) { best = Math.max(best, field.weight * .8); exact = true; }
    }
    if (!best && !identifier && word.length >= 5 && word.length <= 40) {
      const maximum = word.length >= 9 ? 2 : 1;
      for (const field of data.fields) for (const candidate of field.words) {
        if (!/\d|\+|#/.test(candidate) && candidate.length <= 40 && editDistance(word, candidate, maximum) <= maximum) best = Math.max(best, field.weight * .5);
      }
    }
    if (!best) return null;
    if (!exact) fuzzy = true;
    score += best;
  }
  if (!query.words.length) return null;
  if (data.fields[0].text === query.text) score += 30;
  else if (data.fields[0].text.startsWith(query.text)) score += 12;
  return { score, fuzzy };
}
