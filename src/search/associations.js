import { extractCourseCode } from './courseCode.js';

function termOf(course) {
  const text = `${course.code || ''} ${course.name || ''}`.toLowerCase().replace(/[_-]/g, ' ');
  const short = text.match(/\b([fws])\s*(\d{2}|20\d{2})\b/);
  const long = text.match(/\b(fall|winter|spring|summer)\s*(20\d{2})\b/);
  if (short) return `${short[1]}${short[2].slice(-2)}`;
  if (long) return `${long[1][0]}${long[2].slice(-2)}`;
  return '';
}

export function associateCourses(learn, piazza, resources, confirmed = {}) {
  const groups = new Map();
  for (const [source, courses] of [['LEARN', learn], ['Piazza', piazza]]) for (const course of courses) {
    const code = extractCourseCode(course.code || course.name);
    if (!code) continue;
    if (!groups.has(code)) groups.set(code, { LEARN: [], Piazza: [] });
    groups.get(code)[source].push(course);
  }
  const mapping = new Map();
  const ambiguous = [];
  const choices = [];
  for (const [code, group] of groups) {
    for (const course of group.Piazza) {
      if (group.LEARN.some((candidate) => candidate.id === confirmed[course.id])) mapping.set(course.id, confirmed[course.id]);
    }
    const conflictingTerm = group.LEARN.length === 1 && group.Piazza.length === 1
      && termOf(group.LEARN[0]) && termOf(group.Piazza[0]) && termOf(group.LEARN[0]) !== termOf(group.Piazza[0]);
    if (group.LEARN.length === 1 && group.Piazza.length === 1 && !conflictingTerm) {
      mapping.set(group.Piazza[0].id, group.LEARN[0].id);
    } else if (group.LEARN.length && group.Piazza.length) {
      for (const course of group.Piazza) if (!mapping.has(course.id)) choices.push({ code, piazza: course, learn: group.LEARN, conflictingTerm: Boolean(conflictingTerm) });
      if (group.Piazza.some((course) => !mapping.has(course.id))) ambiguous.push(code);
    }
  }
  return {
    resources: resources.map((resource) => mapping.has(resource.courseId)
      ? { ...resource, sourceCourseId: resource.courseId, courseId: mapping.get(resource.courseId) } : resource),
    courses: [...learn, ...piazza.filter((course) => !mapping.has(course.id))], ambiguous, choices
  };
}
