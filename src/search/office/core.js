import { openOfficeZip } from './zip.js';
import { MAX_DOCUMENT_CHARS, MAX_PAGE_CHARS, MAX_PAGES, MAX_PDF_BYTES } from '../pdf/core.js';

const namespaces = {
  p: ['http://schemas.openxmlformats.org/presentationml/2006/main', 'http://purl.oclc.org/ooxml/presentationml/main'],
  a: ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'],
  w: ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main'],
  r: ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships']
};
const elements = (root, namespace, local) => [...root.getElementsByTagName('*')].filter(node => node.localName === local && namespaces[namespace].includes(node.namespaceURI));
function xml(text, Parser) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Unsupported Office XML declarations.');
  const document = new Parser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('Damaged Office XML.');
  return document;
}
function paragraphText(paragraph, namespace) {
  return [...paragraph.getElementsByTagName('*')].filter(node => namespaces[namespace].includes(node.namespaceURI))
    .map(node => node.localName === 't' ? node.textContent : ['tab', 'br', 'cr'].includes(node.localName) ? ' ' : '').join('').replace(/\s+/g, ' ').trim();
}

export async function extractOffice(bytes, format, { signal, Parser = DOMParser } = {}) {
  if (!['DOCX', 'PPTX'].includes(format) || bytes.length > MAX_PDF_BYTES) throw new Error('Unsupported Office document or download exceeds 12 MB.');
  const read = openOfficeZip(bytes, signal);
  const pages = [];
  let chars = 0, partial = false, totalPages = 0;
  function append(text, location) {
    const saved = text.slice(0, Math.min(MAX_PAGE_CHARS, MAX_DOCUMENT_CHARS - chars));
    partial ||= saved.length < text.length;
    pages.push({ page: pages.length + 1, text: saved, location });
    chars += saved.length;
  }
  if (format === 'PPTX') {
    const presentation = xml(await read('ppt/presentation.xml'), Parser);
    if (presentation.documentElement.localName !== 'presentation' || !namespaces.p.includes(presentation.documentElement.namespaceURI)) throw new Error('Invalid PowerPoint presentation XML.');
    const relationships = xml(await read('ppt/_rels/presentation.xml.rels'), Parser);
    const links = new Map([...relationships.getElementsByTagName('*')].filter(node => node.localName === 'Relationship'
      && node.namespaceURI === 'http://schemas.openxmlformats.org/package/2006/relationships'
      && /\/slide$/.test(node.getAttribute('Type')) && node.getAttribute('TargetMode') !== 'External')
      .map(node => [node.getAttribute('Id'), node.getAttribute('Target')]));
    const slides = elements(presentation, 'p', 'sldId');
    if (!slides.length) throw new Error('No PowerPoint slides found.');
    totalPages = slides.length;
    for (const slide of slides.slice(0, MAX_PAGES)) {
      signal?.throwIfAborted();
      const id = namespaces.r.map(ns => slide.getAttributeNS(ns, 'id')).find(Boolean);
      const target = links.get(id);
      // Only internal slide XML, never external relationships or embedded files.
      const path = target?.startsWith('/ppt/') ? target.slice(1) : `ppt/${target}`;
      if (!/^ppt\/slides\/[^/]+\.xml$/.test(path) || /[?#\\]/.test(path)) throw new Error('Unsupported PowerPoint slide relationship.');
      const document = xml(await read(path), Parser);
      if (document.documentElement.localName !== 'sld' || !namespaces.p.includes(document.documentElement.namespaceURI)) throw new Error('Invalid PowerPoint slide XML.');
      append(elements(document, 'a', 'p').map(p => paragraphText(p, 'a')).join('\n'), `Slide ${pages.length + 1}`);
      if (chars >= MAX_DOCUMENT_CHARS) break;
    }
    partial ||= pages.length < totalPages;
  } else {
    const document = xml(await read('word/document.xml'), Parser);
    if (document.documentElement.localName !== 'document' || !namespaces.w.includes(document.documentElement.namespaceURI)) throw new Error('Invalid Word document XML.');
    const paragraphs = elements(document, 'w', 'p');
    let buffer = '', first = 1, last = 1;
    function flush() { append(buffer, first === last ? `Paragraph ${first}` : `Paragraphs ${first}–${last}`); buffer = ''; }
    for (const [number, paragraph] of paragraphs.entries()) {
      signal?.throwIfAborted();
      const text = paragraphText(paragraph, 'w');
      if (buffer && buffer.length + text.length > 2000) flush();
      if (pages.length >= MAX_PAGES || chars >= MAX_DOCUMENT_CHARS) { partial = true; break; }
      if (!buffer) first = number + 1;
      last = number + 1;
      buffer += `${buffer ? '\n' : ''}${text}`;
    }
    if (buffer) flush();
    if (!pages.length) append('', 'Document body');
    totalPages = pages.length;
  }
  signal?.throwIfAborted();
  return { format, pages, chars, totalPages, partial, emptyPages: pages.filter(page => !page.text.trim()).length };
}
