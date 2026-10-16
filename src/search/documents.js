// Shared metadata for the existing local document cache. Keep PDF revisions
// unchanged so upgrading does not discard previously indexed PDFs.
export function documentFormat(resource) {
  return resource.type === 'PDF' ? 'PDF' : ['PPTX', 'DOCX'].includes(resource.documentFormat) ? resource.documentFormat : null;
}
export const isSearchableDocument = resource => Boolean(documentFormat(resource));
export const documentDownloadUrl = resource => resource.type === 'PDF' ? resource.pdfUrl : resource.documentUrl;
export function documentLocation(resource) {
  if (!resource.pdfMatch) return '';
  if (resource.documentFormat === 'PPTX') return `Slide ${resource.pdfPage}`;
  if (resource.documentFormat === 'DOCX') return resource.documentLocation || `Passage ${resource.pdfPage}`;
  return `PDF page ${resource.pdfPage}`;
}
