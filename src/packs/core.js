export const PACK_SECTIONS = ['Instructions', 'Notes', 'Clarifications', 'Submit'];

export function packStorageKey(learnAccount, piazzaAccount) {
  return `assignmentPacks:v1:${JSON.stringify([learnAccount || null, piazzaAccount || null])}`;
}

// Keep references only. Titles, snippets and launch URLs come from the current index.
export function resourceReference(resource) {
  return { source: resource.source, id: resource.resourceId || resource.id };
}

export function resolvePackItem(item, resources) {
  return resources.find(resource => resource.source === item.source
    && (resource.resourceId || resource.id) === item.id);
}

export function updatePacks(packs, action) {
  if (action.type === 'create') {
    const name = String(action.name || '').trim().slice(0, 100);
    if (!name || !action.courseId || !action.id || packs.some(pack => pack.id === action.id)) throw new Error('Enter a pack name and choose a course.');
    return [...packs, { id: action.id, name, courseId: action.courseId, items: [] }];
  }
  if (action.type === 'delete') return packs.filter(pack => pack.id !== action.packId);
  return packs.map(pack => {
    if (pack.id !== action.packId) return pack;
    if (action.type === 'rename') {
      const name = String(action.name || '').trim().slice(0, 100);
      if (!name) throw new Error('Enter a pack name.');
      return { ...pack, name };
    }
    if (action.type === 'remove') return { ...pack, items: pack.items.filter(item => !(item.source === action.item.source && item.id === action.item.id)) };
    if (action.type === 'move') {
      if (!PACK_SECTIONS.includes(action.section)) throw new Error('Choose a section.');
      return { ...pack, items: pack.items.map(item => item.source === action.item.source && item.id === action.item.id
        ? { ...item, section: action.section } : item) };
    }
    if (action.type === 'save') {
      if (!PACK_SECTIONS.includes(action.section)) throw new Error('Choose a section.');
      if (action.resource.courseId !== pack.courseId) throw new Error('Choose a pack for this course.');
      const ref = resourceReference(action.resource);
      if (!ref.id || !ref.source) throw new Error('This resource cannot be saved.');
      return { ...pack, items: [...pack.items.filter(item => !(item.source === ref.source && item.id === ref.id)), { ...ref, section: action.section }] };
    }
    return pack;
  });
}

export function matchingPacks(packs, query, courses, courseId = '') {
  const normalize = value => String(value).toLowerCase()
    .replace(/\b(?:assignment|assign|assn|hw|homework|a)[\s_-]*(\d+)\b/g, 'a$1')
    .replace(/\b([a-z]{2,8})[\s_-]+(\d{2,4}[a-z]?)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const words = normalize(query);
  return packs.filter(pack => (!courseId || pack.courseId === courseId)
    && courses.some(course => course.id === pack.courseId)
    && words.every(word => normalize(`${pack.name} ${courses.find(course => course.id === pack.courseId)?.name || ''}`)
      .some(token => /\d/.test(word) ? token === word : token.includes(word))));
}
