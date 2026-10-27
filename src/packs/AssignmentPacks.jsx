import React, { useEffect, useState } from 'react';
import { subscribeStorageChanges } from '../extension-context.js';
import { PACK_SECTIONS, matchingPacks, resolvePackItem, updatePacks } from './core.js';

export function AssignmentPacks({ storageKey, resources, courses, query, courseId, selected, onOpen }) {
  const [packs, setPacks] = useState([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [newCourse, setNewCourse] = useState(courseId || selected?.courseId || '');
  const [packId, setPackId] = useState('');
  const [section, setSection] = useState('Instructions');

  useEffect(() => {
    let active = true;
    const load = () => chrome.storage.local.get(storageKey).then(saved => {
      if (active) { setPacks(saved[storageKey] || []); setReady(true); }
    }).catch(() => { if (active) setMessage('Could not load assignment packs. Reopen Spotlight to try again.'); });
    const unsubscribe = subscribeStorageChanges((changes, area) => {
      if (active && area === 'local' && changes[storageKey]) setPacks(changes[storageKey].newValue || []);
    });
    load();
    return () => { active = false; unsubscribe(); };
  }, [storageKey]);

  async function change(action) {
    setBusy(true);
    try {
      const saved = await chrome.storage.local.get(storageKey);
      const next = updatePacks(saved[storageKey] || [], action);
      await chrome.storage.local.set({ [storageKey]: next });
      setPacks(next);
      setMessage(action.type === 'save' ? 'Saved to assignment.' : action.type === 'create' ? 'Assignment pack created.' : 'Assignment pack updated.');
      if (action.type === 'create') { setPackId(action.id); setName(''); }
    } catch (error) { setMessage(error.message || 'Could not save assignment packs. Try again.'); }
    finally { setBusy(false); }
  }

  const available = packs.filter(pack => pack.courseId === selected?.courseId);
  const target = available.some(pack => pack.id === packId) ? packId : available[0]?.id || '';
  const visible = matchingPacks(packs, query, courses, courseId);
  return <details className="ls-packs" open={query.trim() && visible.length ? true : undefined}>
    <summary>Assignment packs{visible.length ? ` · ${visible.length}` : ''}</summary>
    <div className="ls-packs-body">
      <p>Keep an assignment’s instructions, notes, clarifications, and submission link together.</p>
      <form className="ls-pack-controls" onSubmit={event => {
        event.preventDefault();
        change({ type: 'create', id: crypto.randomUUID(), name, courseId: newCourse });
      }}>
        <input aria-label="Assignment pack name" placeholder="Assignment name, e.g. A2" maxLength={100} required value={name} onChange={event => setName(event.target.value)} />
        <select aria-label="Assignment pack course" required value={newCourse} onChange={event => setNewCourse(event.target.value)}>
          <option value="">Choose course</option>
          {courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
        <button className="ls-chip" disabled={!ready || busy}>Create pack</button>
      </form>
      {selected && <div className="ls-pack-controls" role="group" aria-label="Save selected resource to assignment">
        <span>Selected: {selected.title}</span>
        {available.length ? <>
          <select aria-label="Save to assignment pack" value={target} onChange={event => setPackId(event.target.value)}>
            {available.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
          </select>
          <select aria-label="Assignment section" value={section} onChange={event => setSection(event.target.value)}>
            {PACK_SECTIONS.map(label => <option key={label}>{label}</option>)}
          </select>
          <button className="ls-chip" disabled={!ready || busy} onClick={() => change({ type: 'save', packId: target, section, resource: selected })}>Save to assignment</button>
        </> : <span>Create a pack for this course to save the selected resource.</span>}
      </div>}
      {visible.map(pack => <details key={pack.id} className="ls-pack">
        <summary>{courses.find(course => course.id === pack.courseId)?.name} · {pack.name} · {pack.items.length} saved</summary>
        <form className="ls-pack-controls" onSubmit={event => {
          event.preventDefault();
          change({ type: 'rename', packId: pack.id, name: new FormData(event.currentTarget).get('name') });
        }}>
          <input key={pack.name} name="name" aria-label={`Rename ${pack.name}`} defaultValue={pack.name} maxLength={100} required />
          <button className="ls-chip" disabled={busy}>Rename pack</button>
        </form>
        {PACK_SECTIONS.map(label => <div key={label}>
          <strong>{label}</strong>
          {pack.items.filter(item => item.section === label).map(item => {
            const resource = resolvePackItem(item, resources);
            return <div className="ls-pack-controls" key={`${item.source}:${item.id}`}>
              {resource ? <button className="ls-chip" onClick={() => onOpen(resource)}>{resource.title}</button> : <span>Resource unavailable. Check your login or refresh the course.</span>}
              <select aria-label={`Section for ${resource?.title || 'unavailable resource'} in ${pack.name}`} value={item.section} disabled={busy}
                onChange={event => change({ type: 'move', packId: pack.id, item, section: event.target.value })}>
                {PACK_SECTIONS.map(section => <option key={section}>{section}</option>)}
              </select>
              <button className="ls-chip" disabled={busy} aria-label={`Remove ${resource?.title || 'unavailable resource'} from ${pack.name}`} onClick={() => change({ type: 'remove', packId: pack.id, item })}>Remove</button>
            </div>;
          })}
        </div>)}
        {!pack.items.length && <p>Search for a resource, select it, then save it to this assignment.</p>}
        {!pack.items.length && <button className="ls-chip" disabled={busy} onClick={() => change({ type: 'delete', packId: pack.id })}>Delete empty pack</button>}
      </details>)}
      {!visible.length && <p>{query.trim() ? 'No assignment packs match this search.' : 'Create your first assignment pack above.'}</p>}
      <p role="status">{message || (!ready ? 'Loading assignment packs…' : '')}</p>
    </div>
  </details>;
}
