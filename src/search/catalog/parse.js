import { parseHTML } from 'linkedom';

export function parseCourseOfferings(html) {
  const { document } = parseHTML(html);
  if (!document.querySelector('h1')?.textContent.includes('Course Selection Offerings List')) throw new Error('Unexpected Waterloo course offerings page.');
  const term = document.querySelector('h2')?.textContent.trim();
  if (!term) throw new Error('Missing offerings term.');
  const courses = {};
  for (const row of document.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim());
    if (cells.length < 3 || !/^[A-Z]{2,8}$/.test(cells[0]) || !/^\d{2,4}[A-Z]?$/.test(cells[1]) || !cells[2]) continue;
    const code = `${cells[0]}${cells[1]}`;
    if (!Object.hasOwn(courses, code)) courses[code] = cells[2];
  }
  return { term, courses };
}
