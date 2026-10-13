// Source-derived schedule adapters. Numbered lectures/modules never become weeks.
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const month = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const dateStart = new RegExp(`^(?:(?:[MTWRFS]|mon[a-z]*|tue[a-z]*|wed[a-z]*|thu?[a-z]*|fri[a-z]*)\\.?[,]?\\s+)?(?:${month}\\s*\\d|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[-\\s]+${month}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)`, 'i');
const excluded = /\b(?:reading week|reading break|lecture cancel(?:l)?ed|class cancel(?:l)?ed|no classes|no lectures|fall break)\b/i;
const event = /^(?:(?:assignment|quiz|midterm|exam|test|tutorial|lab)(?:\b|(?=\d))|.*\bdue\b)/i;
const isEvent = text => event.test(text) && !/\b(?:prep(?:aration)?|review|preview|discussion|strategies)\b/i.test(text);
const weekday = /^(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?)$/i;
const onlyDate = new RegExp(`^(?:(?:mon|tue|wed|thu|fri)[a-z]*,?\\s*)?${month}\\s*\\d[\\d\\s,./–—&-]*(?:${month}\\s*\\d[\\d\\s,./–—&-]*)?$`, 'i');
const referenceOnly = /^(?:chapters?|ch\.?|sections?|sec\.?|pages?|pp?\.)\s*\d[\d.,\s–—&-]*(?:(?:of|in)\s+.+)?$/i;

export function scheduleLabel(value, kind = 'week', allowBare = false) {
  let text = clean(value).replace(/^[•●▪◦‣*–-]\s*/, '');
  const spelled = ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen'];
  text = text.replace(/^(weeks?|lectures?|modules?|units?)\s+([a-z]+)\b/i, (whole, prefix, word) => spelled.includes(word.toLowerCase()) ? `${prefix} ${spelled.indexOf(word.toLowerCase()) + 1}` : whole);
  if (allowBare) {
    const words = ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen'];
    if (words.includes(text.toLowerCase())) text = String(words.indexOf(text.toLowerCase()) + 1);
    text = text.replace(/\s*\[\d+(?:[-–]\d+)?\]$/, '').replace(/^#\s*/, '').replace(/^(\d{1,2})\.\s*/, '$1 ');
    if (/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI)$/i.test(text)) {
      const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI'];
      text = String(roman.indexOf(text.toUpperCase()) + 1);
    }
  }
  const names = { week: 'weeks?|wks?|w|semaines?', lecture: 'lectures?|lec|l|class(?:es)?|sessions?', module: 'modules?', unit: 'units?', chapter: 'chapters?|ch\\.?' };
  const pattern = new RegExp(`^(${names[kind]})\\s*#?\\s*(\\d{1,2})(?:\\s*(?:[-–—&]|to|and|et)\\s*(\\d{1,2}))?(?:\\s*[:–—-]?\\s*(.*))?$`, 'i');
  let match = text.match(pattern);
  if (!match && allowBare) match = text.match(/^()(\d{1,2})(?:\s*[-–—&]\s*(\d{1,2}))?(?:\s*[:–—-]?\s*(.*))?$/);
  if (!match) return null;
  const start = Number(match[2]), end = Number(match[3] || match[2]);
  if (start < (['chapter','lecture'].includes(kind) ? 0 : 1) || end < start || end > (kind === 'week' ? 53 : 200) || end - start > 15) return null;
  const suffix = clean(match[4]).replace(/^\((.*)\)$/, '$1');
  const weekdayDate = suffix.match(/^(?:mon|tue|wed|thu|fri)[a-z]*\s*\(([^)]+)\)$/i)?.[1];
  return { numbers: Array.from({ length: end - start + 1 }, (_, i) => start + i), explicit: Boolean(match[1]),
    date: dateStart.test(suffix) ? suffix : weekdayDate && dateStart.test(weekdayDate) ? suffix : null, suffix };
}

export function expandScheduleTable(rows) {
  const grid = [], spans = [];
  rows.forEach((row, rowIndex) => {
    const cells = [];
    for (let col = 0; col < spans.length; col++) if (spans[col]?.remaining) {
      cells[col] = { ...spans[col].cell, inherited: true };
      spans[col].remaining--;
    }
    let col = 0;
    for (const cell of row.cells) {
      while (cells[col]) col++;
      const width = Math.min(100, Math.max(1, Number(cell.colspan) || 1));
      const height = Math.min(100, Math.max(1, Number(cell.rowspan) || 1));
      for (let offset = 0; offset < width; offset++) {
        const expanded = { text: cell.text, sourceRow: rowIndex, sourceColumn: col,
          ...(offset ? { covered: true } : {}) };
        cells[col + offset] = expanded;
        if (height > 1) spans[col + offset] = { cell: expanded, remaining: height - 1 };
      }
      col += width;
    }
    grid.push(cells);
  });
  return grid;
}

function parts(text) {
  const lines = String(text || '').split('\n').map(line => clean(line).replace(/^[•●▪◦‣·*–-]\s*/, '')).filter(Boolean);
  return { topics: lines.filter(line => !isEvent(line) && !referenceOnly.test(line) && !onlyDate.test(line) && !/^\d{1,2}\/\d{1,2}(?:[–—-]\d{1,2}\/\d{1,2})?$/.test(line) && !/^(?:labour day|thanksgiving|classes begin|holiday)$/i.test(line)).join(' '),
    references: lines.filter(line => referenceOnly.test(line)), events: lines.filter(line => isEvent(line)) };
}

export function parseScheduleSource(source, definitions = []) {
  if (!source?.blocks) return null;
  const entries = [], unparsed = [], references = [], events = [];
  const evidence = (block, row) => ({ heading: source.heading || 'Tentative class plan', block, ...(row !== undefined ? { row: row + 1 } : {}) });
  const readings = text => {
    if (!text) return [];
    const citation = clean(text);
    const definition = definitions.find(item => item.alias && citation.startsWith(`${item.alias}:`) || item.name?.length >= 4 && citation.includes(item.name));
    return [{ citation, resolved: Boolean(definition), ...(definition ? { name: definition.name, ...(definition.alias ? { alias: definition.alias } : {}) } : {}) }];
  };
  const add = (kind, numbers, topic, dates, refs, proof, context = '') => {
    const split = parts(topic);
    split.events.forEach(text => events.push({ text, kind: 'assessment-or-activity', evidence: proof }));
    let topicText = clean([context, split.topics].filter(Boolean).join('. '));
    if (!/[\p{L}\p{N}]/u.test(topicText)) topicText = '';
    if (!topicText && !refs.length && !split.references.length) return;
    for (const number of numbers.length ? numbers : [null]) entries.push({ kind, ...(number !== null ? { number } : {}),
      topics: topicText, dateLabels: dates.filter(Boolean).map(clean),
      references: [...refs, ...split.references.flatMap(readings)], evidence: proof });
  };
  const topicIntroduction = source.blocks.findIndex(block => block.type === 'text' && /\b(?:tentative (?:order|list)|following topics|topics.{0,60}(?:cover|discuss)|cover.{0,60}topics|organized.{0,40}units)\b/i.test(block.text));
  const topicList = source.blocks.filter(block => block.listItem).length >= 2 && source.blocks.some(block => block.type === 'text' && /\b(?:topics|cover|units|content|material)\b/i.test(block.text));
  const proseTopicList = topicIntroduction >= 0 && source.blocks.slice(topicIntroduction + 1).filter(block => block.type === 'text' && clean(block.text).length < 600).length >= 3;
  source.blocks.forEach((block, blockIndex) => {
    if (block.type === 'table') {
      const grid = expandScheduleTable(block.rows);
      let layout, active, context = '', calendar;
      const singleWeekTable = grid.every(row => row.filter(cell => cell && !cell.covered).length <= 1) && grid.some(row => /^week[.\s]+topics?$/i.test(clean(row[0]?.text)));
      const singleTopicTable = grid.length >= 3 && grid.every(row => row.filter(cell => cell && !cell.covered).length === 1) && grid.filter(row => /^(?:chapter|lecture|module|unit)|^[A-Za-z].{12,}/i.test(clean(row[0]?.text)) && !isEvent(clean(row[0]?.text))).length >= 3;
      // Headerless inference requires repeated explicit labels AND evidence for other columns.
      const explicitRows = grid.filter(row => scheduleLabel(row[0]?.text)?.explicit && row[1]?.text);
      const referenceLayout = grid.filter(row => scheduleLabel(row[0]?.text)?.explicit && row.length === 3 && /\b(?:chap(?:ter)?s?\.?|readings?|pp?\.)\s*\d/i.test(clean(row[2]?.text))).length >= 2;
      if (grid.every(row => row.length <= 3) && grid.filter(row => dateStart.test(clean(row[0]?.text)) && row[1]?.text && /\b(?:read|watch|chap(?:ter)?)/i.test(clean(row[2]?.text))).length >= 2) layout = { kind: 'dated', number: 0, topics: [1], reading: [2], dates: [0] };
      const headerless = new Set(explicitRows.map(row => scheduleLabel(row[0].text).numbers[0])).size >= 2
        && (grid.every(row => row.length <= 2) || referenceLayout || grid.some(row => /tutorial/i.test(row.slice(2).map(cell => cell?.text).join(' '))));
      if (!headerless && grid.every(row => row.length <= 2)) {
        if (grid.filter(row => dateStart.test(clean(row[0]?.text)) && row[1]?.text).length >= 2) layout = { kind: 'dated', number: 0, topics: [1], reading: [], dates: [0] };
        for (const kind of ['lecture','module','unit']) {
          if (new Set(grid.flatMap(row => scheduleLabel(row[0]?.text, kind)?.explicit ? scheduleLabel(row[0].text, kind).numbers : [])).size >= 2) { layout = { kind, number: 0, topics: [1], reading: [], dates: [] }; break; }
        }
      }
      if (!headerless && grid.filter(row => scheduleLabel(row[0]?.text)?.explicit && row.length === 3 && dateStart.test(clean(row[1]?.text))).length >= 2) layout = { kind: 'week', number: 0, topics: [2], reading: [], dates: [1] };
      if (headerless) layout = { kind: 'week', number: 0, topics: [1], reading: referenceLayout ? [2] : [], dates: [] };
      grid.forEach((row, rowIndex) => {
        const texts = row.map(cell => clean(cell?.text));
        const headerTexts = texts.map(text => text.replace(/([a-z])-\s+([a-z])/gi, '$1$2').replace(/\s*\(20\d{2}\)/, '').replace(/\[lecture\]/i, '').replace(/^weeks?\s*\([^)]*\)$/i, 'Week').replace(/^weeks?.*(?:date)$/i, 'Week Date').replace(/^semaines?$/i, 'Week').replace(/^(?:leçon|matière.*|thème)$/i, 'Topics').replace(/^(?:term )?weeks?[^0-9]*$/i, 'Week').replace(/^w#$/i, 'Week').replace(/^wks?\.?$/i, 'Week').replace(/^module(?: and dates| summary| from course notes)$/i, 'Module').replace(/^(?:class|session)\s*[&/]\s*date$/i, 'Class').replace(/^class #$/i, 'Class').replace(/^date\(s\)$/i, 'Date').replace(/^(?:topics?(?:\/strategies| and (?:readings|deliverables)|\(s\))?|(?:high level|class|lecture|course|lesson) topics?(?:\(s\))?(?: coverage)?|theme and core concepts|module coverage|lectures and notes|topic \/ activities|readings \/ topics|topic & in-class activities|class theme|class and topic)$/i, 'Topics'));
        if (!texts.some(Boolean)) return;
        const proof = evidence(blockIndex, rowIndex);
        const monthHeading = texts.find(text => /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}$/i.test(text));
        if (monthHeading) { calendar = monthHeading; return; }
        if (calendar && texts.filter(text => /^(mon|tue|wed|thu|fri)(?:day|sday|nesday|rsday)?$/i.test(text)).length >= 3) return;
        if (calendar) {
          let found = false;
          row.forEach((cell, column) => {
            if (cell?.covered || cell?.inherited) return;
            const match = clean(cell?.text).match(/^(\d{1,2})(?:\s+|(?=[A-Za-z]))([\s\S]*)$/);
            if (!match || +match[1] < 1 || +match[1] > 31) return;
            found = true;
            if (match[2]) add('dated', [], match[2], [`${calendar.replace(/\s+(20\d{2})$/, ` ${match[1]}, $1`)}`], [], { ...proof, column: column + 1 });
          });
          if (found) return;
        }
        const numberColumn = headerTexts.findIndex((text, col) => /^(?:w|wks?\.?|weeks?(?:\s*(?:number|no\.?|#|\/\s*dates?|dates?))?|lectures?(?:\s*(?:number|no\.?|#))?|class(?:es)?(?:\s*#)?|modules?(?:\s*#)?|units?|chapters?)$/i.test(text) && (/^w/i.test(text) || grid.slice(rowIndex + 1).some(next => scheduleLabel(next[col]?.text, /^module/i.test(text) ? 'module' : /^unit/i.test(text) ? 'unit' : /^chapter/i.test(text) ? 'chapter' : 'lecture', true))));
        if (numberColumn >= 0 && !row[numberColumn]?.inherited) {
          const name = headerTexts[numberColumn].toLowerCase();
          const kind = /^(?:lecture|class)/.test(name) ? 'lecture' : name.startsWith('module') ? 'module' : name.startsWith('unit') ? 'unit' : name.startsWith('chapter') ? 'chapter' : 'week';
          let topics = headerTexts.flatMap((text, i) => i !== numberColumn && /topic|content|subject|material|lecture|^lec\b|^module(?: coverage)?$|^lessons?$|^hour\s*\d|^session\s*\d|^key points$|^description$|focus|^activities?$|class details|class session|(?:monday|tuesday|wednesday|thursday|friday) class/i.test(text) && !/tutorial|due|reading|textbook/i.test(text) ? [i] : []);
          if (!topics.length && texts.filter(text => weekday.test(text)).length >= 3) topics = texts.flatMap((text, i) => weekday.test(text) ? [i] : []);
          if (!topics.length && ['week', 'module', 'unit', 'chapter'].includes(kind) && grid.slice(rowIndex + 1).some(next => scheduleLabel(next[numberColumn]?.text, kind, true)?.suffix)) topics = [numberColumn];
          if (!topics.length && !texts[numberColumn + 1] && grid.filter(next => scheduleLabel(next[numberColumn]?.text, kind, true) && next[numberColumn + 1]?.text).length >= 2) topics = [numberColumn + 1];
          const readingColumns = texts.flatMap((text, i) => i !== numberColumn && !topics.includes(i) && /reading|text|chapter|sections?|^notes$/i.test(text) ? [i] : []);
          layout = topics.length || readingColumns.length ? { kind, number: numberColumn, topics,
            dates: texts.flatMap((text, i) => i !== numberColumn && (/date/i.test(text) && !/due/i.test(text) || row[i]?.covered && grid.slice(rowIndex + 1).some(next => dateStart.test(clean(next[i]?.text)))) ? [i] : []),
            reading: readingColumns } : null;
          active = null; return;
        }
        const dateHeader = texts.findIndex(text => /^(?:days?|dates?|lecture dates?|class dates?|meeting dates?|(?:the )?week (?:of|beginning)(?: \(monday\))?)$/i.test(text));
        let dateTopics = headerTexts.findIndex(text => /^(?:(?:main |key |class |lecture |lesson )?topics?(?: and readings| & readings| title| to be covered)?|content(?: thread)?|subject|key points|lessons?|focus|thematic focus|class details|class session|(?:monday|tuesday|wednesday|thursday|friday) class|lectures?(?: \(tentative\))?(?: .*)?|topics to be covered|topic title|skill|class|activities?|class plan|experiments?)$/i.test(text));
        if (dateTopics < 0 && dateHeader >= 0 && texts.filter(text => weekday.test(text)).length >= 3) dateTopics = texts.findIndex(text => weekday.test(text));
        if (numberColumn < 0 && dateHeader >= 0 && dateTopics >= 0) {
          layout = { kind: 'dated', number: dateHeader, topics: texts.filter(text => weekday.test(text)).length >= 3 ? texts.flatMap((text,i) => weekday.test(text) ? [i] : []) : [dateTopics], dates: [dateHeader], reading: texts.flatMap((text, i) => /reading|chapter|^text$/i.test(text) ? [i] : []) };
          active = null; return;
        }
        if (numberColumn < 0 && dateHeader < 0 && !layout && dateTopics >= 0 && !texts.some(text => /^(?:week|module|unit|lecture)/i.test(text))) { layout = { kind: 'topic', number: -1, topics: [dateTopics], dates: [], reading: texts.flatMap((text,i) => i !== dateTopics && !/days|time|sets|assessment/i.test(text) ? [i] : []) }; return; }
        if (!layout && row.filter(cell => cell && !cell.covered).length === 1) {
          const lines = String(row.find(cell => cell && !cell.covered)?.text || '').split('\n').map(clean).filter(Boolean);
          let parsedSingle = false;
          for (const kind of ['lecture','module','unit','chapter']) {
            const label = scheduleLabel(lines[0], kind);
            if (label?.suffix && !label.date) { add(kind, label.numbers, label.suffix, [], [], proof); parsedSingle = true; break; }
          }
          if (!parsedSingle && singleWeekTable) {
            const label = scheduleLabel(lines[0], 'week', true);
            if (label?.suffix && !label.date) { add('week', label.numbers, label.suffix, [], [], proof); parsedSingle = true; }
          }
          if (!parsedSingle && lines.some(text => /^week$/i.test(text))) {
            for (let i = 0; i < lines.length; i++) {
              const label = scheduleLabel(lines[i], 'week', true);
              const date = lines[i + 1]?.replace(/^\((.*)\)$/, '$1');
              if (!label || !dateStart.test(date)) continue;
              let end = i + 2;
              while (end < lines.length && !(scheduleLabel(lines[end], 'week', true) && dateStart.test(lines[end + 1]?.replace(/^\((.*)\)$/, '$1')))) end++;
              const topic = lines.slice(i + 2, end).join('\n');
              if (!excluded.test(topic)) add('week', label.numbers, topic, [date], [], proof);
              parsedSingle = true; i = end - 1;
            }
          }
          if (!parsedSingle && singleTopicTable && !singleWeekTable && !excluded.test(lines.join(' ')) && !/\b(?:please|must|attendance|learn|schedule|grading|policy|subject to change)\b/i.test(lines.join(' '))) { add('topic', [], lines.join('\n'), [], [], proof); parsedSingle = true; }
          if (parsedSingle) return;
        }
        if (!layout) { unparsed.push(texts.join(' | ')); return; }
        if (layout.kind === 'topic') {
          add('topic', [], layout.topics.map(i => row[i]?.text).join('\n'), [], layout.reading.flatMap(i => readings(texts[i])), proof); return;
        }
        if (row[layout.number]?.covered) {
          // Spanning chapter/topic headings are context, never week identifiers.
          active = null; unparsed.push(texts.join(' | ')); return;
        }
        const dateText = texts[layout.number]?.replace(/^week of\s*/i, '');
        let label = layout.kind === 'dated' ? (dateStart.test(dateText) || /^\d{1,2}[- /](?:[A-Za-z]{3,}|\d{1,2})/.test(dateText) ? { numbers: [], date: texts[layout.number], suffix: '' } : null) : scheduleLabel(texts[layout.number], layout.kind, true);
        if (layout.kind === 'dated') {
          const suffixWeek = texts[layout.number]?.match(/^(.+?)\s*\((weeks?\s+\d{1,2}(?:[-–]\d{1,2})?)\)$/i);
          if (suffixWeek) { const named = scheduleLabel(suffixWeek[2]); if (named) label = { ...named, date: suffixWeek[1], entryKind: 'week' }; }
          for (const kind of ['week','lecture','module','unit']) {
            const named = scheduleLabel(texts[layout.number], kind);
            if (named?.explicit) { label = { ...named, entryKind: kind }; break; }
          }
        }
        if (!label && layout.kind === 'week') {
          for (const kind of ['module','unit','lecture']) {
            const named = scheduleLabel(texts[layout.number], kind);
            if (named?.explicit) { label = { ...named, entryKind: kind }; break; }
          }
        }
        if ((!label || !label.explicit && !label.date) && dateStart.test(texts[layout.number])) { label = { numbers: [], date: texts[layout.number], suffix: '', dated: true }; }
        if (excluded.test([texts[layout.number], ...layout.topics.map(i => texts[i])].join(' '))) { active = null; unparsed.push(texts.join(' | ')); return; }
        const topicCells = layout.topics.filter(i => !row[i]?.covered && !row[i]?.inherited);
        let topic = topicCells.map(i => row[i]?.text).filter(Boolean).join('\n');
        if (label && (!label.suffix || label.date || layout.kind !== 'week' || layout.topics.includes(layout.number))) {
          if (layout.topics.includes(layout.number)) topic = label.date ? '' : label.suffix;
          const dates = [...new Set([label.date, ...layout.dates.filter(i => i !== layout.number || !label.numbers.length).map(i => texts[i]), ...topic.split('\n').filter(text => onlyDate.test(text))])];
          const refs = layout.reading.flatMap(i => readings(texts[i]));
          const before = entries.length;
          add(label.entryKind || (label.dated ? 'dated' : layout.kind), label.numbers, topic, dates, refs, proof, context);
          active = entries.length > before ? entries.slice(before) : null;
        } else if (!texts[layout.number] && active && topic && !isEvent(clean(topic))) {
          const split = parts(topic);
          active.forEach(entry => { entry.topics = clean(`${entry.topics} ${split.topics}`); });
        } else {
          active = null;
          if (/^chapter\b/i.test(texts[0]) && row[1]?.covered) context = texts[0];
          unparsed.push(texts.join(' | '));
        }
      });
    } else {
      const text = clean(block.text).replace(/^[•●▪◦‣*–-]\s*/, '');
      if (!text) return;
      const proof = evidence(blockIndex);
      if (/\b(?:schedule|weekly plan|weekly topics|course calendar)\b/i.test(text) && /\b(?:learn|website|posted|available|refer|consult|found|see)\b/i.test(text)) references.push({ text, links: block.links || [], evidence: proof });
      let matched = false;
      for (const kind of ['week', 'lecture', 'module', 'unit', 'chapter']) {
        const match = text.match(new RegExp(`^(${kind}s?\\s+\\d{1,2}(?:\\s*[-–—&]\\s*\\d{1,2})?)\\s*[:–—-]\\s*(.+)$`, 'i'));
        const suffix = text.match(new RegExp(`^(.+?)\\s*\\((${kind}s?\\s+\\d{1,2}(?:\\s*[-–—&]\\s*\\d{1,2})?)\\)\\s*$`, 'i'));
        const label = scheduleLabel(match?.[1] || suffix?.[2], kind);
        if (!label) continue;
        add(kind, label.numbers, match?.[2] || suffix[1], [], [], proof); matched = true; break;
      }
      if (!matched && (block.listItem && topicList || proseTopicList && blockIndex > topicIntroduction && text.length < 600) && !isEvent(text) && !excluded.test(text) && !/\b(?:learn|schedule|attendance|office hours|subject to change|please|must|responsible|grading|posted)\b/i.test(text)) { add('topic', [], text, [], [], proof); matched = true; }
      if (!matched) unparsed.push(text);
    }
  });
  const unique = new Map();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.number ?? (entry.dateLabels.length ? entry.dateLabels.join(',') : `${entry.evidence.block}:${entry.evidence.row ?? ''}`)}`;
    const previous = unique.get(key);
    if (!previous) unique.set(key, entry);
    else { previous.topics = previous.topics === entry.topics ? previous.topics : clean(`${previous.topics} ${entry.topics}`); previous.references.push(...entry.references); previous.dateLabels = [...new Set([...previous.dateLabels, ...entry.dateLabels])]; }
  }
  const scheduleEntries = [...unique.values()];
  const weeks = scheduleEntries.filter(entry => entry.kind === 'week').map(({ number, ...entry }) => ({ ...entry, week: number }));
  return { weeks, scheduleEntries, unparsed, scheduleReferences: references, scheduleEvents: events,
    scheduleStatus: weeks.length ? 'explicit-weeks' : scheduleEntries.length ? 'other-structured-plan' : references.length ? 'external-schedule' : source.blocks.length ? 'unsupported-or-prose' : 'no-plan' };
}
