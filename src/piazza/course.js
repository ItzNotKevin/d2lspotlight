export function courseCodeFromTitle(title = '') {
  const match = title.match(/\b([A-Z]{2,8})[\s_-]*(\d{2,4}[A-Z]?)\b/i);
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : '';
}

export function piazzaCourseName(classId, { title = '', pageClassId = '', savedName = '', enteredName = '' } = {}) {
  return enteredName.trim() || (pageClassId === classId ? courseCodeFromTitle(title) : '')
    || savedName || `Piazza · ${classId}`;
}

export function detectPiazzaCourse(doc, classId, pageClassId) {
  if (classId !== pageClassId) return '';
  const header = doc.querySelector('#network_name, #network_name_span, .network_name, header, nav');
  return courseCodeFromTitle(doc.title) || courseCodeFromTitle(header?.textContent || '');
}
