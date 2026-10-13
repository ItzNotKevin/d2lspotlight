import { loadCatalogBundle, catalogResourceCode, catalogCourseScore } from '../catalog/live.js';
import { cosineSimilarity } from '../semantic/model.js';
import { OUTLINE_ENCODING_VERSION } from './chunks.js';
import { resourceContext } from '../context.js';

export async function loadOutlineBundle(fetchAsset = fetch, url = path => chrome.runtime.getURL(path)) {
  const bundle = await loadCatalogBundle(fetchAsset, path => url(path.replace('dist/catalog/', 'dist/outlines/')), OUTLINE_ENCODING_VERSION);
  if (!bundle) return null;
  for (const course of Object.values(bundle.courses)) {
    if (!Array.isArray(course.outlines) || course.outlines.some(outline => !/^(Fall|Winter|Spring) 20\d{2}$/.test(outline.term)
      || !Array.isArray(outline.sections) || outline.sections.some(section => !/^\d{3}$/.test(section))
      || !Array.isArray(outline.vectorIndices) || !outline.vectorIndices.length
      || outline.vectorIndices.some(index => !Number.isInteger(index) || index < 0 || index >= bundle.vectors.length)
      || (outline.weeks !== undefined && (!outline.weeks || typeof outline.weeks !== 'object' || Array.isArray(outline.weeks)
        || Object.entries(outline.weeks).some(([week, indices]) => !/^(?:[1-9]|[1-4]\d|5[0-3])$/.test(week)
          || !Array.isArray(indices) || !indices.length || indices.some(index => !outline.vectorIndices.includes(index))))))) {
      throw new Error('Invalid outline course reference.');
    }
  }
  return bundle;
}

// A teaching-week association is evidence about likely topics, not PDF contents.
export function resourceWeekEvidence(resource, queryVectors, bundle) {
  const context = resourceContext(resource);
  if (!context.notes || context.week === null) return null;
  const outline = matchingOutline(resource, bundle);
  const indices = outline?.weeks?.[context.week];
  if (!indices?.length) return null;
  let score = 0;
  for (const index of indices) for (const query of queryVectors) score = Math.max(score, cosineSimilarity(query, bundle.vectors[index]));
  return { score: score * .9, week: context.week, sourceUrl: outline.sourceUrl };
}

export function matchingOutline(resource, bundle) {
  const code = catalogResourceCode(resource);
  const entries = bundle?.courses[code]?.outlines;
  if (!entries) return null;
  const identity = `${resource.outlineCourseCode || resource.course || ''} ${resource.outlineCourseName || resource.courseName || ''}`.replace(/[_-]/g, ' ');
  const short = identity.match(/\b([FWS])(\d{2})\b/i);
  const long = identity.match(/\b(Fall|Winter|Spring)\s+(20\d{2})\b/i);
  const term = short ? `${{ F: 'Fall', W: 'Winter', S: 'Spring' }[short[1].toUpperCase()]} 20${short[2]}`
    : long ? `${long[1][0].toUpperCase()}${long[1].slice(1).toLowerCase()} ${long[2]}` : null;
  if (!term) return null;
  const section = identity.replace(/\b[A-Z]{2,8}\s*\d{1,4}[A-Z]{0,3}\b/gi, '').match(/\b\d{3}\b/)?.[0];
  const matches = entries.filter(outline => outline.term === term && (!section || outline.sections.includes(section)));
  return matches.length === 1 ? matches[0] : null;
}

// Use one source of course context: a verified outline, otherwise the calendar.
export function courseEvidenceScore(resource, queryVectors, outlines, catalog) {
  const outline = matchingOutline(resource, outlines);
  if (!outline) return catalogCourseScore(resource, queryVectors, catalog);
  let score = 0;
  for (const index of outline.vectorIndices) for (const query of queryVectors) score = Math.max(score, cosineSimilarity(query, outlines.vectors[index]));
  return score;
}
