import { parseScheduleSource } from './schedule.js';
const headingGroups = {
  description: ['course description', 'course overview', 'course summary', 'catalog description', 'catalogue description', 'aperçu du cours', 'description du cours'],
  outcomes: ['learning outcomes', 'learning objectives', 'course learning outcomes', 'course learning objectives', 'intended learning outcomes', 'objectives', "objectifs d'apprentissage", 'objectifs d’apprentissage'],
  topics: ['course topics', 'course content', 'topics covered', 'content overview'],
  weeks: ['tentative class plan', 'tentative course plan', 'weekly schedule', 'weekly topics', 'course schedule', 'schedule of topics', 'course plan', 'tentative schedule', 'plan du cours provisoire', 'calendrier du cours'],
  readings: ['readings', 'required readings', 'required texts', 'textbooks', 'course materials', 'texts and materials', 'lectures', 'lectures obligatoires'],
  excluded: ['class schedule', 'instructional team', 'teaching team', 'contact information', 'office hours', 'technology', 'required materials & technologies',
    'assessments & activities', 'assessments and activities', 'assessments', 'assessment', 'evaluation', 'grading', 'grading scheme',
    'tutorials', 'assignments', 'late / missed content', 'late policy', 'assignment screening', 'generative ai', 'academic integrity',
    'administrative policy', 'university policy', 'course policies', 'policies', 'accessibility', 'instructor information']
};
const headings = new Map(Object.entries(headingGroups).flatMap(([kind, names]) => names.map((name) => [name, kind])));
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const headingName = (value) => clean(value).replace(/^#{1,6}\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/:$/, '').toLowerCase();

export function normalizeOutlineCourseCode(value) {
  const match = clean(value).match(/^([a-z]{2,8})\s*[-_]?\s*(\d{1,4}[a-z]{0,3})$/i);
  if (!match || /^(?:fall|winter|spring|summer|autumn|week|chapter|module|unit)$/i.test(match[1])) throw new Error('A course code such as MATH 239 is required.');
  return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
}

function parseSections(value) {
  return [...new Set(clean(value).replace(/^sections?\s*/i, '').split(/[,;]\s*/).flatMap((part) => {
    const range = part.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
    if (!range) return /^\d{1,3}$/.test(part) ? [part.padStart(3, '0')] : [];
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (end < start || end - start > 50) return [];
    return Array.from({ length: end - start + 1 }, (_, index) => String(start + index).padStart(3, '0'));
  }))];
}

function publishedDate(value) {
  const text = clean(value).replace(/^published\s*/i, '').replace(/\s*\(latest\)$/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),? (\d{4})$/i);
  if (!match) return null;
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const month = months.indexOf(match[1].toLowerCase()) + 1;
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function paragraphs(lines) {
  return lines.join('\n').split(/\n\s*\n/).map((paragraph) => clean(paragraph
    .replace(/^\s*(?:calendar|catalogue?) description(?: for .+)?\s*$/gim, '')
    .replace(/^\s*view requirements for .+\s*$/gim, ''))).filter(Boolean);
}

function sourceSections(lines) {
  const last = new Map();
  const positions = [];
  let activeKind;
  let weeklyStarted = false;
  lines.forEach((line, index) => {
    if (activeKind === 'weeks' && weekNumber(line.split('\t')[0])) weeklyStarted = true;
    const kind = headings.get(headingName(line)) || (/^##\s+/.test(line) ? 'excluded' : null);
    if (!kind) return;
    if (activeKind === 'weeks' && !weeklyStarted && ['readings', 'assignments'].includes(headingName(line))) return;
    activeKind = kind;
    if (kind === 'weeks') weeklyStarted = false;
    const section = { kind, heading: clean(line), start: index, end: lines.length };
    positions.push(section);
    last.set(headingName(line), section);
  });
  positions.forEach((section, index) => { section.end = positions[index + 1]?.start ?? lines.length; });
  return [...last.values()].filter((section) => section.kind !== 'excluded').sort((a, b) => a.start - b.start)
    .map((section) => ({ ...section, lines: lines.slice(section.start + 1, section.end),
      evidence: { heading: section.heading, startLine: section.start + 1, endLine: section.end } }));
}

function readingDefinitions(sections) {
  const definitions = new Map();
  for (const section of sections) {
    if (!['weeks', 'readings'].includes(section.kind)) continue;
    for (const match of section.lines.join('\n').matchAll(/\b([A-Z][A-Z0-9_-]{0,11})\s*=\s*([^,;\n.]+)/g)) {
      definitions.set(match[1], { alias: match[1], name: clean(match[2]), evidence: section.evidence });
    }
  }
  for (const section of sections.filter((section) => section.kind === 'readings')) {
    for (const line of section.lines) {
      const match = line.match(/^\s*\(([A-Z][A-Z0-9_-]{0,11})\)\s*(.+)$/);
      if (!match) {
        const cells = line.includes('\t') ? line.split('\t').map(clean)
          : /^\s*\|/.test(line) ? line.trim().replace(/^\||\|$/g, '').split('|').map(clean)
            : /^\s*[-*]\s+\S/.test(line) ? [clean(line.replace(/^\s*[-*]\s+/, ''))] : [];
        const name = cells[0];
        if (name && !/^(?:title(?:\s*\/\s*name)?|name|textbook|book|[-:]+)$/i.test(name)) {
          definitions.set(`name:${name.toLowerCase()}`, { name, ...(cells[1] ? { label: cells[1] } : {}), evidence: section.evidence });
        }
        continue;
      }
      const cells = match[2].split('\t').map(clean);
      const previous = definitions.get(match[1]);
      definitions.set(match[1], { alias: match[1], name: previous?.name || cells[0], title: cells[0],
        ...(cells[1] ? { label: cells[1].replace(/\s*\(available.+\)$/i, '') } : {}), evidence: section.evidence });
    }
  }
  return [...definitions.values()];
}

function referencesFor(text, definitions) {
  const references = [];
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9_-]{0,11})\s*:\s*([^\n]+)/g)) {
    const definition = definitions.find((item) => item.alias === match[1]);
    references.push({ alias: match[1], citation: clean(match[2]), resolved: Boolean(definition),
      ...(definition ? { name: definition.name, ...(definition.label ? { label: definition.label } : {}) } : {}) });
  }
  for (const line of text.split('\n')) {
    if (line.trim() && !/\b[A-Z][A-Z0-9_-]{0,11}\s*:/.test(line)) {
      const definition = definitions.find((item) => item.name.length >= 4 && new RegExp(`(?:^|\\W)${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\W)`, 'i').test(line));
      references.push({ citation: clean(line), resolved: Boolean(definition), ...(definition ? { name: definition.name, ...(definition.label ? { label: definition.label } : {}) } : {}) });
    }
  }
  return references;
}

const isDateLine = (line) => /^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d|\d{4}-\d{2}-\d{2})/i.test(line);
function weekLabel(value) {
  const match = clean(value).match(/^(?:(week|wk|w)\s*)?(\d{1,2})(?:\s*\(([^)]+)\)|\s*[:–—-]\s*(.+)|\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec).+))?$/i);
  const date = match?.[3] || match?.[4] || match?.[5];
  if (!match || date && !isDateLine(date) || Number(match[2]) < 1 || Number(match[2]) > 53) return null;
  return { week: Number(match[2]), date, explicit: Boolean(match[1]) };
}
const weekNumber = value => weekLabel(value)?.week;

function tableWeeks(section, definitions) {
  const rows = section.lines.map((line) => ({ line, cells: line.includes('\t') ? line.split('\t').map(clean)
    : /^\s*\|/.test(line) ? line.trim().replace(/^\||\|$/g, '').split('|').map(clean) : [] }));
  const isWeekHeader = cell => /^weeks?(?:\s*(?:\/|-)?\s*dates?)?$/i.test(cell);
  const header = rows.find((row) => row.cells.some(isWeekHeader) && row.cells.some((cell) => /topic|content|subject/i.test(cell)));
  // Infer only an unambiguous two-column layout with repeated explicit week labels.
  const labeledRows = rows.filter(({ cells }) => cells.length === 2 && weekLabel(cells[0])?.explicit);
  if (!header && (new Set(labeledRows.map(row => weekLabel(row.cells[0]).week)).size < 2
    || rows.some(row => row.cells.length && row.cells.length !== 2))) return null;
  const weekColumn = header ? header.cells.findIndex(isWeekHeader) : 0;
  const topicColumn = header ? header.cells.findIndex(cell => /topic|content|subject/i.test(cell)) : 1;
  const readingColumn = header ? header.cells.findIndex(cell => /reading|text|chapter|^sections?$/i.test(cell)) : -1;
  const dateColumn = header ? header.cells.findIndex(cell => /date/i.test(cell)) : -1;
  const weeks = [], unparsed = [];
  let active;
  for (const row of rows) {
    const { cells, line } = row;
    if (!cells.length) {
      if (clean(line)) { unparsed.push(line); active = null; }
      continue;
    }
    if (row === header || cells.every(cell => !cell || /^[-:]+$/.test(cell))) continue;
    const label = weekLabel(cells[weekColumn]);
    const topics = cells[topicColumn] || '';
    if (label && !/\b(?:reading week|lecture cancel(?:l)?ed|class cancel(?:l)?ed|no classes)\b/i.test(`${cells[weekColumn]} ${topics}`)) {
      active = { week: label.week, topics, dateLabels: dateColumn >= 0 && dateColumn !== weekColumn && cells[dateColumn] ? [cells[dateColumn]] : label.date ? [label.date] : [],
        references: referencesFor(readingColumn >= 0 ? cells[readingColumn] || '' : '', definitions), evidence: section.evidence };
      weeks.push(active);
    } else if (!cells[weekColumn] && active && topics && !/^(?:reading week|makeup|no classes|cancel(?:l)?ed)\b/i.test(topics)) {
      active.topics = clean(`${active.topics} ${topics}`);
      active.references.push(...referencesFor(readingColumn >= 0 ? cells[readingColumn] || '' : '', definitions));
    } else {
      active = null;
      unparsed.push(line);
    }
  }
  return { weeks: weeks.filter(week => week.topics), unparsed };
}

function verticalWeeks(section, definitions) {
  const lines = section.lines.map(clean).filter(Boolean);
  const starts = lines.flatMap((line, index) => weekNumber(line) ? [{ index, week: Number(weekNumber(line)) }] : []);
  return starts.flatMap(({ index, week }, offset) => {
    const row = lines.slice(index + 1, starts[offset + 1]?.index ?? lines.length);
    const dateLabels = [];
    let position = 0;
    while (position < row.length && (isDateLine(row[position]) || dateLabels.length && /^\d{1,2}(?:,\s*\d{1,2})*$/.test(row[position]))) dateLabels.push(row[position++]);
    if (!dateLabels.length) return [];
    const topicLines = [];
    while (position < row.length && !/^[A-Z][A-Z0-9_-]{0,11}\s*:|^(?:readings?\b|tutorial\b|quiz\b|midterm\b|final\b|A\d+\b|no assignment|reading week)/i.test(row[position])) topicLines.push(row[position++]);
    const readingLines = [];
    while (position < row.length && !/^(?:tutorial\b|quiz\b|midterm\b|final\b|A\d+\b|no assignment|reading week)/i.test(row[position])) readingLines.push(row[position++]);
    return topicLines.length ? [{ week, topics: topicLines.join(' '), dateLabels,
      references: referencesFor(readingLines.join('\n'), definitions), evidence: section.evidence }] : [];
  });
}

function inlineWeeks(section, definitions) {
  return section.lines.flatMap((line) => {
    const match = clean(line).replace(/^[•●▪◦‣*-]\s*/, '').match(/^week\s+(\d{1,2})\s*[:–—-]\s*(.+)$/i);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 53) return [];
    const parts = match[2].split(/\s+(?:readings?|chapters?)\s*:\s*/i);
    return [{ week: Number(match[1]), topics: parts[0], dateLabels: [],
      references: referencesFor(parts.slice(1).join(' '), definitions), evidence: section.evidence }];
  });
}

export function normalizeOutline(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('An outline must be an object.');
  const course = normalizeOutlineCourseCode(value.course);
  const title = clean(value.title);
  if (!title) throw new Error(`Missing course title for ${course}.`);
  const strings = (items) => {
    if (Array.isArray(items) && items.some((item) => typeof item !== 'string')) throw new Error('Outline text fields must contain strings.');
    return Array.isArray(items) ? items.map(clean).filter(Boolean) : typeof items === 'string' ? [clean(items)].filter(Boolean) : [];
  };
  const evidence = (item, heading) => item && typeof item === 'object' ? item : { heading };
  const topics = (Array.isArray(value.topics) ? value.topics : []).map((item) => {
    if (!item || typeof item !== 'string' && typeof item !== 'object') throw new Error('Outline topics must be strings or objects with text.');
    return {
    heading: clean(typeof item === 'string' ? 'Topics' : item.heading || 'Topics'),
    text: clean(typeof item === 'string' ? item : item.text),
    evidence: evidence(item.evidence, 'Topics')
    };
  }).filter((item) => item.text);
  const weeks = (Array.isArray(value.weeks) ? value.weeks : []).map((item) => {
    if (!item || !Number.isInteger(item.week) || item.week < 1 || item.week > 53 || !clean(item.topics) && !item.references?.length) throw new Error('Weekly topics need a week number between 1 and 53 and topic text.');
    return { week: item.week, topics: clean(item.topics), dateLabels: strings(item.dateLabels), references: Array.isArray(item.references) ? item.references : [],
      evidence: evidence(item.evidence, 'Weekly schedule') };
  });
  const term = clean(value.term) || null;
  const warnings = [...strings(value.warnings), ...(!term ? ['No term identified; weekly resource associations require a verified term.'] : []),
    ...(!weeks.length ? ['No structured weekly topics were extracted.'] : [])];
  const source = value.sourceUrl ? new URL(value.sourceUrl) : null;
  if (source && (source.protocol !== 'https:' || source.username || source.password)) throw new Error('Outline source URLs must use HTTPS without embedded credentials.');
  const sourceUrl = source?.href || null;
  const outline = { version: 1, id: clean(value.id) || sourceUrl || `${course}:${term || 'unknown-term'}:${strings(value.sections).sort().join(',') || 'unspecified-sections'}`,
    sourceUrl, course, courseCodes: [...new Set([course, ...strings(value.courseCodes).map(normalizeOutlineCourseCode)])],
    title, term, sections: strings(value.sections), publishedAt: value.publishedAt || null,
    ...(value.capturedAt ? { capturedAt: clean(value.capturedAt) } : {}),
    description: strings(value.description), outcomes: strings(value.outcomes), topics, weeks,
    unparsedSchedule: strings(value.unparsedSchedule),
    ...(value.scheduleSource ? { scheduleSource: value.scheduleSource } : {}),
    scheduleEntries: Array.isArray(value.scheduleEntries) ? value.scheduleEntries : [],
    scheduleReferences: Array.isArray(value.scheduleReferences) ? value.scheduleReferences : [],
    scheduleEvents: Array.isArray(value.scheduleEvents) ? value.scheduleEvents : [],
    scheduleStatus: value.scheduleStatus || (weeks.length ? 'explicit-weeks' : value.unparsedSchedule?.length ? 'unsupported-or-prose' : 'no-plan'),
    readings: Array.isArray(value.readings) ? value.readings : [], evidence: value.evidence || {}, warnings: [...new Set(warnings)] };
  if (!outline.description.length && !outline.outcomes.length && !topics.length && !weeks.length) throw new Error(`${course} has no usable description, outcomes, topics, or weekly plan.`);
  return outline;
}

export function extractOutline(text, overrides = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const standalone = lines.findIndex((line) => /^[a-z]{2,8}\s*\d{2,4}[a-z]?$/i.test(line.trim())
    && !/^(?:fall|winter|spring|summer|autumn)\s+20\d{2}$/i.test(line.trim()));
  const combined = lines.map((line) => clean(line).match(/^([a-z]{2,8}\s*\d{2,4}[a-z]?)\s*[:–—-]\s*(.+)$/i)).find(Boolean);
  const course = overrides.course || (standalone >= 0 ? clean(lines[standalone]) : combined?.[1]);
  if (!course) throw new Error('Could not identify a course code. Supply structured JSON with course metadata.');
  const termLine = lines.find((line) => /^(?:fall|winter|spring|summer|autumn)\s+20\d{2}$/i.test(clean(line)));
  const titleLine = standalone >= 0 ? lines.slice(standalone + 1, standalone + 10).map(clean).find((line) => line
    && !/^(?:fall|winter|spring|summer|autumn)\s+20\d{2}$|^sections?\b|^published\b|^save a local copy$/i.test(line) && !headings.has(headingName(line))) : combined?.[2];
  const sections = sourceSections(lines);
  const definitions = readingDefinitions(sections);
  const weekly = sections.find((section) => section.kind === 'weeks');
  const table = weekly ? tableWeeks(weekly, definitions) : null;
  const structured = parseScheduleSource(overrides.scheduleSource, definitions);
  const weeks = (structured?.weeks.length ? structured.weeks : weekly ? table?.weeks ?? [...verticalWeeks(weekly, definitions), ...inlineWeeks(weekly, definitions)] : []).filter(week => /[\p{L}\p{N}]/u.test(week.topics) || week.references?.length);
  const warnings = [];
  if (weekly && !weeks.length && !structured?.scheduleEntries.length && !structured?.scheduleReferences.length) warnings.push('A schedule section was found but its layout could not be parsed; no weekly associations were inferred.');
  if (weeks.length && table?.unparsed.length) warnings.push('Additional schedule rows were retained without teaching-week associations.');
  return normalizeOutline({
    course, title: titleLine, term: clean(termLine), sections: parseSections(lines.find((line) => /^sections?\s+\d/i.test(clean(line)))),
    publishedAt: publishedDate(lines.find((line) => /^published\s+/i.test(clean(line)))),
    description: sections.filter((section) => section.kind === 'description').flatMap((section) => paragraphs(section.lines)),
    outcomes: sections.filter((section) => section.kind === 'outcomes').flatMap((section) => paragraphs(section.lines)),
    topics: sections.filter((section) => section.kind === 'topics').flatMap((section) => paragraphs(section.lines).map((text) => ({ text, heading: section.heading, evidence: section.evidence }))),
    ...(structured ? { scheduleEntries: structured.scheduleEntries, scheduleReferences: structured.scheduleReferences, scheduleEvents: structured.scheduleEvents, scheduleStatus: weeks.length ? 'explicit-weeks' : structured.scheduleStatus } : {}),
    weeks, unparsedSchedule: structured?.scheduleEntries.length ? structured.unparsed : weekly && !weeks.length ? paragraphs(weekly.lines) : table?.unparsed || [], readings: definitions,
    evidence: Object.fromEntries(sections.map((section) => [section.kind, section.evidence])), warnings, ...overrides
  });
}
