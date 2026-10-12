import { normalizeSearchText } from '../services.js';
import { canonicalSubject, compareResourceDates, dateIntent } from './intent.js';
import { courseText } from './course.js';

const prepared = new WeakMap();
const corpora = new WeakMap();
const fillers = new Set(['find', 'show', 'me', 'please', 'where', 'is', 'the', 'my', 'open', 'for', 'can', 'you', 'on', 'about', 'in', 'of', 'a', 'an', 'to', 'and']);
const resourceTerms = new Set(['note', 'notes', 'lecture', 'lectures', 'slide', 'slides', 'textbook', 'textbooks', 'document', 'documents', 'pdf', 'file', 'files', 'material', 'materials', 'resource', 'resources', 'course']);

export function normalizeQuery(value) {
  return normalizeSearchText(value)
    .replace(/_/g, ' ')
    .replace(/\bweek\s*0*(\d+)\b/g, 'week $1')
    .replace(/\b(?:a|assignment|assignments|assn|hw|homework)\s*[-#:]?\s*0*(\d+)\b/g, 'assignment $1')
    .replace(/\b([a-z]{2,8})[\s_-]+(\d{2,4}[a-z]?)\b/g, '$1$2')
    .replace(/[^a-z0-9+#]+/g, ' ').trim();
}
function tokens(value) { return normalizeQuery(value).split(/\s+/).filter(Boolean).map(canonicalSubject); }
function assignmentIds(value) {
  return [...normalizeSearchText(value).matchAll(/\b(?:a|assignment|assignments|assn|hw|homework)\s*[-#:]?\s*0*(\d+)\b/g)].map((match) => match[1]);
}

function prepare(resource) {
  if (prepared.has(resource)) return prepared.get(resource);
  const context = normalizeSearchText(`${resource.title} ${resource.path}`).replace(/[_-]/g, ' ');
  const studyAliases = [];
  if (/\b(?:annotated|lecture|lectures|lec|slides)\b/.test(context)) studyAliases.push('lecture notes');
  if (/\bslides\b/.test(context) || resource.type === 'SLIDES') studyAliases.push('lecture slides notes');
  const values = [resource.title, resource.service, `${resource.course || ''} ${courseText(resource)}`, [...(resource.aliases || []), ...studyAliases].join(' '), resource.path, resource.type, resource.destinationHost, resource.source];
  const fields = values.map((value, i) => ({ text: normalizeQuery(value), words: tokens(value), weight: [12, 11, 10, 9, 6, 5, 4, 4][i] }));
  const titleAssignments = assignmentIds(resource.title);
  const data = { fields, courseWords: tokens(courseText(resource)), assignments: titleAssignments.length ? titleAssignments : assignmentIds(resource.path) };
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
  const { text, dateOrder } = dateIntent(normalizeQuery(query));
  const words = [...new Set(tokens(text).filter((word) => !fillers.has(word)))];
  const topics = words.filter((word) => !resourceTerms.has(word));
  const assignments = assignmentIds(query);
  const hasTopic = topics.some((word) => !/\d|\+|#/.test(word) && !(assignments.length && word === 'assignment'));
  const preferences = hasTopic ? words.filter((word) => resourceTerms.has(word)) : [];
  return { text, words, topics: preferences.length ? topics : words, preferences, assignments, dateOrder };
}

export function prepareSearchQuery(resources, query) {
  let corpus = corpora.get(resources);
  if (!corpus) {
    const frequencies = new Map();
    for (const resource of resources) {
      const words = new Set(prepare(resource).fields.flatMap((field) => field.words));
      for (const word of words) frequencies.set(word, (frequencies.get(word) || 0) + 1);
    }
    corpus = { size: resources.length, frequencies };
    corpora.set(resources, corpus);
  }
  const parsed = prepareQuery(query);
  parsed.weights = new Map(parsed.words.map((word) => [word, 1 + Math.log((corpus.size + 1) / ((corpus.frequencies.get(word) || 0) + 1))]));
  return parsed;
}

export function semanticQueryText(query) {
  const parsed = prepareQuery(query);
  const topics = parsed.topics.filter((word) => !/\d|\+|#/.test(word) && !(parsed.assignments.length && word === 'assignment'));
  return topics.length ? topics.join(' ') : parsed.words.join(' ');
}

export function courseQueryText(query) {
  const parsed = prepareQuery(query);
  return parsed.topics.filter((word) => !resourceTerms.has(word) && !/\d|\+|#/.test(word) && !(parsed.assignments.length && word === 'assignment')).join(' ');
}

export function courseRelevance(resource, query) {
  const words = query.topics.filter((word) => !resourceTerms.has(word) && !/\d|\+|#/.test(word) && !(query.assignments.length && word === 'assignment'));
  if (!words.length) return 0;
  const courseWords = prepare(resource).courseWords;
  let total = 0;
  let maximum = 0;
  for (const word of words) {
    const weight = query.weights?.get(word) || 1;
    let match = courseWords.includes(word) ? 1 : courseWords.some((candidate) => candidate.startsWith(word)) ? .8 : 0;
    if (!match && word.length >= 5) match = courseWords.some((candidate) => candidate.length >= 5 && editDistance(word, candidate, 1) <= 1) ? .5 : 0;
    total += match * weight;
    maximum += weight;
  }
  return total / maximum;
}

export function compareDateIntent(a, b, query) {
  if (!query.dateOrder) return 0;
  return Number(b.courseRelevance >= .5) - Number(a.courseRelevance >= .5)
    || compareResourceDates(a.resource, b.resource, query.dateOrder);
}

export function matchesQueryConstraints(resource, query) {
  const data = prepare(resource);
  if (!query.assignments.every((id) => data.assignments.includes(id))) return false;
  return query.words.filter((word) => /\d|\+|#/.test(word)).every((word) => {
    if (/^[a-z]{2,8}\d{2,4}[a-z]?$/.test(word) && !/^(?:week|lecture|lec|chapter|unit|module|section|topic|page|slide)s?\d/.test(word)) return data.fields[2].words.includes(word);
    return data.fields.some((field) => field.words.includes(word));
  });
}

export function rankResource(resource, query) {
  const data = prepare(resource);
  if (!matchesQueryConstraints(resource, query)) return null;
  let score = 0;
  let fuzzy = false;
  let topicScore = 0;
  let topicMaximum = 0;
  let preferenceScore = 0;
  for (const word of query.words) {
    const preference = query.preferences?.includes(word);
    const weight = query.weights?.get(word) || 1;
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
    if (!best && !preference) return null;
    if (preference) {
      preferenceScore += best / 12;
      score += best * .15;
      continue;
    }
    if (!exact) fuzzy = true;
    topicScore += best * weight;
    topicMaximum += 12 * weight;
    score += best * weight;
  }
  if (!query.words.length && !query.dateOrder) return null;
  const course = courseRelevance(resource, query);
  score += 12 * course;
  const exactTitle = Boolean(query.text) && data.fields[0].text === query.text;
  if (exactTitle) score += 30;
  else if (query.text && data.fields[0].text.startsWith(query.text)) score += 12;
  const exactIdentifier = exactIdentifierMatch(resource, query);
  return { score, fuzzy, relevance: topicMaximum ? topicScore / topicMaximum : 0,
    preference: query.preferences?.length ? preferenceScore / query.preferences.length : 0, exactTitle, exactIdentifier, courseRelevance: course };
}

export function exactIdentifierMatch(resource, query) {
  const titleAssignments = assignmentIds(resource.title);
  return query.assignments.length > 0 && query.assignments.every((id) => titleAssignments.includes(id));
}

export function resourcePreference(resource, query) {
  if (!query.preferences.length) return 0;
  const fields = prepare(resource).fields;
  return query.preferences.reduce((score, word) => score + (fields.some((field) => field.words.some((candidate) => candidate === word || candidate.startsWith(word))) ? 1 : 0), 0) / query.preferences.length;
}
