import { documentLocation } from './documents.js';
import { normalizeQuery, prepareQuery } from './rank.js';

const administrative = /\b(?:advising|advisors?|bios?|biographies|resumes?|careers?|office hours|schedules?|polic(?:y|ies)|syllabus|outlines?|late|deadlines?|enrollment|co op)\b/;
export function studyWeight(resource, query) {
  // Only a modest preference, based on document labels, never passage contents.
  if (administrative.test(normalizeQuery(query))) return 1;
  const context = normalizeQuery(`${resource.title} ${resource.path || ''}`);
  if (administrative.test(context)) return .9;
  if (/\b(?:lectures?|slides?|notes|labs?|practice|exercises?|textbooks?|tutorials?)\b/.test(context) || resource.type === 'SLIDES') return 1.1;
  return 1;
}

export function matchExplanation(resource, query) {
  if (!query.trim()) return '';
  if (resource.pdfMatch) return resource.documentFormat ? `${resource.documentFormat} text · ${documentLocation(resource).toLowerCase()} · opens document` : `PDF text · page ${resource.pdfPage}`;
  if (resource.websiteReference) return 'Linked reference · destination contents not searched';
  if (resource.semanticMatch || resource.outlineWeek) return resource.outlineWeek ? 'Suggested by the course outline' : 'Related meaning';
  const words = prepareQuery(query).topics.filter(word => !/\d/.test(word));
  const title = normalizeQuery(resource.title).split(' ');
  if (words.length && words.every(word => title.some(candidate => candidate.startsWith(word)))) return 'Title match';
  if (resource.source === 'Website' && resource.contentText) {
    const body = normalizeQuery(resource.contentText).split(' ');
    if (words.some(word => body.some(candidate => candidate.startsWith(word)))) return 'Website text match';
  }
  return 'Course or document details match';
}
