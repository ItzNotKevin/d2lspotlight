import { normalizeOutline } from './extract.js';

export const OUTLINE_ENCODING_VERSION = 'outline-v1';
export const OUTLINE_MAX_TOKENS = 256;

const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

async function splitOversized(text, prefix, countTokens, maximum) {
  const words = text.split(/\s+/);
  const pieces = [];
  let position = 0;
  while (position < words.length) {
    let lower = 1;
    let upper = words.length - position;
    let length = 0;
    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (await countTokens(`${prefix} ${words.slice(position, position + middle).join(' ')}`) <= maximum) {
        length = middle;
        lower = middle + 1;
      } else upper = middle - 1;
    }
    if (!length) throw new Error('An outline contains a token sequence too long for a complete chunk. Shorten the heading or split the input text.');
    pieces.push(words.slice(position, position + length).join(' '));
    position += length;
  }
  return pieces;
}

export async function splitOutlineText(text, prefix, countTokens, maximum = OUTLINE_MAX_TOKENS) {
  if (!Number.isInteger(maximum) || maximum < 16 || maximum > 256) throw new Error('Outline token limits must be between 16 and 256.');
  if (await countTokens(prefix) >= maximum - 4) throw new Error('The course title and heading leave too little room for topic text.');
  const sentences = String(text).split(/(?<=[.!?])\s+|\n+/u).map(clean).filter(Boolean);
  const bodies = [];
  let current = '';
  for (const sentence of sentences) {
    const combined = clean(`${current} ${sentence}`);
    if (await countTokens(`${prefix} ${combined}`) <= maximum) {
      current = combined;
      continue;
    }
    if (current) bodies.push(current);
    current = '';
    if (await countTokens(`${prefix} ${sentence}`) <= maximum) current = sentence;
    else {
      const pieces = await splitOversized(sentence, prefix, countTokens, maximum);
      bodies.push(...pieces.slice(0, -1));
      current = pieces.at(-1);
    }
  }
  if (current) bodies.push(current);
  return bodies;
}

function outlineSegments(outline) {
  const segments = [];
  const add = (kind, heading, text, evidence, extra = {}) => {
    if (clean(text)) segments.push({ kind, heading, body: clean(text), evidence, ...extra });
  };
  const summary = [outline.description[0], ...outline.outcomes].filter(Boolean).join(' ')
    || [...outline.topics.map((topic) => topic.text), ...outline.weeks.map((week) => week.topics)].join('. ');
  add('course', 'Course overview', summary,
    { description: outline.evidence.description, outcomes: outline.evidence.outcomes,
      topics: outline.topics.map((topic) => topic.evidence), weeks: outline.weeks.map((week) => week.evidence) });
  outline.description.forEach((paragraph) => add('topic', 'Course description', paragraph, outline.evidence.description || { heading: 'Course description' }));
  outline.outcomes.forEach((paragraph) => add('topic', 'Learning outcomes', paragraph, outline.evidence.outcomes || { heading: 'Learning outcomes' }));
  outline.topics.forEach((topic) => add('topic', topic.heading, topic.text, topic.evidence));
  outline.weeks.forEach((week) => {
    const names = [...new Set(week.references.filter((reference) => reference.resolved).map((reference) => reference.name).filter(Boolean))];
    add('week', 'Weekly topics', `${week.topics}${names.length ? `. Reading: ${names.join('; ')}` : ''}`, week.evidence,
      { week: week.week, dateLabels: week.dateLabels, references: week.references });
    week.references.filter((reference) => !reference.resolved && /notes|supplement|slides|reading|chapter|textbook/i.test(reference.citation))
      .forEach((reference) => add('reading', 'Referenced material', reference.citation, week.evidence,
        { week: week.week, references: [reference] }));
  });
  outline.readings.forEach((reading) => add('reading', 'Course reading', [reading.name, reading.title, reading.label].filter(Boolean).join('. '),
    reading.evidence || { heading: 'Course readings' }, { references: [{ ...reading, resolved: true }] }));
  return segments;
}

export async function createOutlineChunks(value, { countTokens, maximum = OUTLINE_MAX_TOKENS, outlineKey }) {
  const outline = normalizeOutline(value);
  const chunks = [];
  const duplicates = new Set();
  const genericHeadings = new Set(['course overview', 'course description', 'learning outcomes', 'referenced material', 'course reading', 'topics', 'weekly topics']);
  for (const [index, segment] of outlineSegments(outline).entries()) {
    const prefix = `${outline.title}.${genericHeadings.has(segment.heading.toLowerCase()) ? '' : ` ${segment.heading}.`}`;
    const bodies = await splitOutlineText(segment.body, prefix, countTokens, maximum);
    for (const [part, body] of bodies.entries()) {
      const text = `${prefix} ${body}`;
      const duplicate = JSON.stringify([segment.kind, segment.week, text]);
      if (duplicates.has(duplicate)) continue;
      duplicates.add(duplicate);
      const { body: originalBody, ...metadata } = segment;
      chunks.push({ ...metadata, id: `${outlineKey || outline.id}:${segment.kind}:${index}:${part}`, outlineId: outline.id,
        outlineVersionKey: outlineKey || outline.id,
        course: outline.course, term: outline.term, sections: outline.sections, sourceUrl: outline.sourceUrl,
        text, tokens: await countTokens(text) });
    }
  }
  if (!chunks.length) throw new Error(`No embedding chunks were produced for ${outline.course}.`);
  return chunks;
}
