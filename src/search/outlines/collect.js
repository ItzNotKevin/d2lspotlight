import { parseHTML } from 'linkedom';
import { extractOutline } from './extract.js';

export function normalizeSearchRows(data, expectedTerm) {
  if (!Array.isArray(data)) throw new Error('Viewer search did not return a course array.');
  return data.map(row => {
    if (typeof row?.term !== 'string' || typeof row.courses !== 'string' || typeof row.title !== 'string') throw new Error('Unsupported viewer course record.');
    if (row.term !== expectedTerm) throw new Error('Viewer search returned another term.');
    const codes = [...row.courses.matchAll(/\b([A-Z]{2,8})\s+(\d{1,4}[A-Z]{0,3})\b/g)].map(match => `${match[1]} ${match[2]}`);
    if (!codes.length) throw new Error('Viewer course code is missing.');
    if (!row.url) return { course: codes[0], courseCodes: codes, title: row.title, sections: row.sections || '', term: row.term, unavailable: true };
    const url = new URL(row.url, 'https://outline.uwaterloo.ca');
    if (url.origin !== 'https://outline.uwaterloo.ca' || !/^\/viewer\/view\/[a-z0-9_-]+\/?$/i.test(url.pathname) || url.search || url.hash) throw new Error('Untrusted outline destination.');
    return { id: url.pathname.split('/').filter(Boolean).at(-1), course: codes[0], courseCodes: codes, title: row.title,
      sections: row.sections || '', term: row.term, sourceUrl: url.href };
  });
}

export function termName(term) {
  if (!/^1\d{2}[159]$/.test(term)) throw new Error('Unsupported Waterloo term.');
  return `${{ 1: 'Winter', 5: 'Spring', 9: 'Fall' }[term.at(-1)]} 20${term.slice(1, 3)}`;
}

export function sectionsFromLabel(label) {
  return [...new Set(String(label).split(',').flatMap(part => {
    const range = part.trim().match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
    if (!range) return [];
    const start = Number(range[1]), end = Number(range[2] || range[1]);
    if (end < start || end - start > 100) return [];
    return Array.from({ length: end - start + 1 }, (_, i) => String(start + i).padStart(3, '0'));
  }))];
}

export function captureOutlineHTML(html, record) {
  const { document } = parseHTML(html);
  if (/\b(?:sign|log)\s*in\b/i.test(document.title)) throw new Error('Outline session expired.');
  if (!document.querySelector('h1') || !document.querySelector('h2')) throw new Error('Unsupported outline document structure.');
  document.querySelectorAll('script,style,nav,footer,input,button,svg,aside,.navbar').forEach(node => node.remove());
  const publication = document.body.textContent.match(/\bPublished\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2})\b/i)?.[1];
  const lines = [];
  const scheduleSource = { version: 1, heading: 'Tentative class plan', blocks: [] };
  let inSchedule = false;
  const blockText = node => {
    if (node.nodeType === 3) return node.textContent;
    const copy = node.cloneNode(true);
    copy.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    copy.querySelectorAll('p,li,div').forEach(el => el.append('\n'));
    return copy.textContent.split('\n').map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  };
  const links = node => [...node.querySelectorAll('a[href]')].map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') })).slice(0, 100);
  const clean = value => value.replace(/\s+/g, ' ').trim();
  function walk(node) {
    if (node.nodeType === 3) { const value = clean(blockText(node));
      if (inSchedule && ['P', 'LI', 'H3', 'H4'].includes(node.tagName) && value) scheduleSource.blocks.push({ type: 'text', text: blockText(node), listItem: node.tagName === 'LI', links: links(node) });
      if (value) lines.push(value); return; }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'H2') {
      inSchedule = node.id === 'tentative_class_plan' || /tentative (?:class|course) plan|weekly schedule|schedule of topics|course plan|tentative schedule|plan du cours provisoire|calendrier du cours/i.test(node.textContent);
      if (inSchedule) scheduleSource.heading = clean(node.textContent);
    }
    if (node.tagName === 'TABLE') {
      if (inSchedule) scheduleSource.blocks.push({ type: 'table', rows: [...node.querySelectorAll('tr')].filter(row => row.closest('table') === node).map(row => ({ cells: [...row.children].filter(cell => ['TH', 'TD'].includes(cell.tagName)).map(cell => ({ text: blockText(cell), colspan: Number(cell.getAttribute('colspan')) || 1, rowspan: Number(cell.getAttribute('rowspan')) || 1 })) })) });
      for (const row of node.querySelectorAll('tr')) {
        // Preserve columns, including dates/assessments, rather than flattening into topics.
        const cells = [...row.children].filter(cell => ['TH', 'TD'].includes(cell.tagName));
        if (cells.length) lines.push(cells.map(cell => clean(blockText(cell))).join('\t'));
      }
      lines.push(''); return;
    }
    if ((node.tagName === 'P' || node.tagName === 'LI') && node.querySelector('table')) {
      for (const child of node.childNodes) walk(child);
      return;
    }
    if (/^H[1-6]$/.test(node.tagName) || ['P', 'LI'].includes(node.tagName)) {
      const value = clean(blockText(node));
      if (inSchedule && ['P', 'LI', 'H3', 'H4'].includes(node.tagName) && value) scheduleSource.blocks.push({ type: 'text', text: blockText(node), listItem: node.tagName === 'LI', links: links(node) });
      if (value) lines.push(node.tagName === 'H2' ? `## ${value}` : value); lines.push(''); return;
    }
    for (const child of node.childNodes) walk(child);
  }
  walk(document.querySelector('main') || document.body);
  if (publication) lines.push(`Published ${publication}`);
  const text = lines.join('\n');
  const outline = extractOutline(text, { id: record.id, course: record.course, title: record.title, term: termName(record.term),
    sections: sectionsFromLabel(record.sections), sourceUrl: record.sourceUrl, scheduleSource });
  return { outline: { ...outline, courseCodes: record.courseCodes, capturedAt: new Date().toISOString() }, text };
}
