import { courseQueryText, prepareQuery, semanticQueryText } from '../rank.js';

export function parseOutlineQuery(query) {
  const parsed = prepareQuery(query);
  const courses = parsed.words.filter((word) => /^[a-z]{2,8}\d{2,4}[a-z]?$/.test(word)
    && !/^(?:week|lecture|chapter|unit|module|section|topic|page|slide)s?\d/.test(word));
  const week = query.match(/\bweek[\s_-]*(\d{1,2})\b/i)?.[1];
  const topicQuery = query.replace(/\bweek[\s_-]*\d{1,2}\b/gi, ' ');
  const metadataOnly = Boolean(courses.length || week) && !courseQueryText(topicQuery);
  return { courses, week: week === undefined ? null : Number(week), assignments: parsed.assignments,
    text: metadataOnly ? '' : semanticQueryText(topicQuery), metadataOnly };
}
