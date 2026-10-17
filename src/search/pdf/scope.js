import { notesSection } from './core.js';
import { documentDownloadUrl, isSearchableDocument } from '../documents.js';

export function indexingCandidates(index, filters, selectedCourses, target = null) {
  const individual = target && !['*', '@selection', '@handwriting'].includes(target);
  return index.resources.filter(resource => isSearchableDocument(resource) && documentDownloadUrl(resource)
        && (!individual || resource.id === target)
        && (individual || selectedCourses === null || selectedCourses.includes(resource.courseId))
        && (individual || selectedCourses !== null || !filters.courseId || resource.courseId === filters.courseId)
        && (individual || selectedCourses !== null || !filters.source || filters.source === 'LEARN')
        && (individual || selectedCourses !== null || !filters.notesSection || notesSection(resource) === filters.notesSection)
        && (individual || selectedCourses !== null || !filters.instructor || index.pdfLabels?.[notesSection(resource)] === filters.instructor));
}

