import { extractCourseCode } from '../search/courseCode.js';
export const courseCodeFromTitle = extractCourseCode;

export function isClassIdLabel(name, classId) {
  return !name?.trim() || name.trim() === classId || name.trim() === `Piazza · ${classId}`;
}

export function piazzaCourseName(classId, { title = '', pageClassId = '', savedName = '', enteredName = '' } = {}) {
  return (!isClassIdLabel(enteredName, classId) ? enteredName.trim() : '') || (pageClassId === classId ? courseCodeFromTitle(title) : '')
    || savedName || `Piazza · ${classId}`;
}

export function detectPiazzaCourse(doc, classId, pageClassId) {
  if (classId !== pageClassId) return '';
  const title = courseCodeFromTitle(doc.title);
  if (title) return title;
  const headers = doc.querySelectorAll('#network_name, #network_name_span, .network_name, #network-selector, #network-dropdown, header, nav, [role="navigation"]');
  for (const header of headers) {
    const code = courseCodeFromTitle(header.textContent);
    if (code) return code;
  }
  // Piazza's React header can have no semantic header/nav element. Look for
  // a short, visible course label near the top, rather than post body mentions.
  const codes = new Set();
  for (const node of [...doc.querySelectorAll('a,button,[role="button"],span')].slice(0, 200)) {
    const text = node.textContent.trim();
    if (text.length > 64 || !/^[A-Z]{2,8}\s*\d{2,4}[A-Z]?(?:\s|\(|$)/i.test(text)) continue;
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0 || rect.top < 0 || rect.top > 300 || node.closest('#learn-spotlight-root')) continue;
    const code = courseCodeFromTitle(text);
    if (code) codes.add(code);
  }
  return codes.size === 1 ? [...codes][0] : '';
}

export function courseNameFromProfile(profile, classId) {
  for (const field of ['networks', 'classes', 'my_networks']) {
    const value = profile?.[field];
    const records = Array.isArray(value) ? value : value && typeof value === 'object'
      ? Object.entries(value).map(([id, record]) => ({ ...record, id: record?.id || id })) : [];
    const record = records.find((item) => String(item?.id || item?.nid || item?.network_id || '') === classId);
    if (record) for (const key of ['course_number', 'name', 'course', 'title']) {
      const code = typeof record[key] === 'string' ? extractCourseCode(record[key]) : '';
      if (code) return code;
    }
  }
  return '';
}
