import React, { useEffect, useRef, useState } from 'react';
import { emptyIndex } from '../learn/cache.js';
import { PIAZZA_CACHE_KEY, piazzaIndexMessage } from './cache.js';
import { classFromUrl, loadPiazzaFeed, normalizePosts, piazzaRequest } from './client.js';
import { piazzaCourseName, detectPiazzaCourse, courseNameFromProfile, isClassIdLabel } from './course.js';

export function usePiazzaIndex(isOpen) {
  const [index, setIndex] = useState(emptyIndex);
  const [classId, setClassId] = useState(() => classFromUrl(location.href));
  const [courseName, setCourseName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading saved Piazza posts…');
  const [diagnostics, setDiagnostics] = useState([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const controller = useRef(null);
  const onPiazza = location.origin === 'https://piazza.com';

  async function refresh() {
    if (!/^[a-zA-Z0-9]+$/.test(classId)) {
      setMessage('Open a Piazza class or enter its class ID.');
      return;
    }
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    const { signal } = next;
    setBusy(true);
    setDiagnostics([]);
    setMessage('Checking Piazza account…');
    const request = (options) => piazzaRequest({ ...options, signal, onDiagnostic: (entry) => {
      if (!signal.aborted) setDiagnostics((entries) => [...entries.slice(-24), entry]);
    } });
    try {
      const profile = await request({ method: 'user_profile.get_profile', params: {} });
      signal.throwIfAborted();
      if (typeof profile?.user_id !== 'string' || !profile.user_id) {
        throw Object.assign(new Error('Could not verify Piazza account identity. Saved Piazza posts cleared.'), { code: 'IDENTITY' });
      }
      const previous = await piazzaIndexMessage('begin', { accountId: profile.user_id });
      signal.throwIfAborted();
      setIndex(previous);
      const feed = await loadPiazzaFeed({ classId, signal, request,
        onPage: (count) => { if (!signal.aborted) setMessage(`Loading Piazza posts: ${count}…`); } });
      signal.throwIfAborted();
      const courseId = `piazza:${classId}`;
      const savedName = previous.courses.find((item) => item.id === courseId)?.name;
      const detectedName = courseNameFromProfile(profile, classId) || detectPiazzaCourse(document, classId, classFromUrl(location.href));
      const course = { id: courseId, name: piazzaCourseName(classId, {
        title: document.title, pageClassId: classFromUrl(location.href),
        enteredName: !isClassIdLabel(courseName, classId) ? courseName : !isClassIdLabel(savedName, classId) ? savedName : detectedName,
        savedName
      }) };
      const resources = normalizePosts(feed.posts, classId).map((post) => ({ ...post, courseId, course: course.name, source: 'Piazza' }));
      setCourseName(course.name);
      setDiagnostics((entries) => [...entries, { stage: 'course-index', courseName: course.name, postCount: feed.posts.length,
        assignment2Titles: resources.filter((post) => /\b(?:a\s*2|assignment\s*0?2)\b/i.test(post.title)).length }]);
      const updated = { ...previous,
        courses: [...previous.courses.filter((item) => item.id !== courseId), course],
        resources: [...previous.resources.filter((item) => item.courseId !== courseId), ...resources],
        failedCourses: [...previous.failedCourses.filter((id) => id !== courseId), ...(feed.partial ? [courseId] : [])],
        updatedAt: Date.now() };
      setIndex(await piazzaIndexMessage('commit', updated));
      if (!signal.aborted) setMessage(`${feed.posts.length} Piazza posts indexed under ${course.name}${feed.partial ? ' · partial feed' : ''}.${isClassIdLabel(course.name, classId) ? ' Course name was not detected. Enter the course code (e.g. CS 246) in Course name and click Save course name.' : ' Search updates instantly.'}`);
    } catch (error) {
      if (signal.aborted) return;
      if (['AUTH', 'IDENTITY', 'CSRF_UNAVAILABLE', 'NOT_JSON'].includes(error.code) || error.apiCategory === 'AUTH') {
        await piazzaIndexMessage('clear').catch(() => {});
        if (signal.aborted) return;
        setIndex(emptyIndex());
      }
      setMessage(`${error.message}${error.code === 'API_ERROR' && error.apiCategory !== 'AUTH' ? ' Previously saved posts remain available.' : ''}`);
    } finally { if (!signal.aborted) setBusy(false); }
  }

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    piazzaIndexMessage('read').then((saved) => {
      if (!active) return;
      setIndex(saved);
      if (onPiazza) refresh();
      else setMessage(saved.resources.length ? `${saved.resources.length} saved Piazza posts. Refresh on Piazza for updates.` : 'Open Spotlight in a Piazza class to add its posts.');
    }).catch((error) => { if (active) setMessage(error.message); });
    const changed = (changes, area) => {
      if (active && area === 'local' && changes[PIAZZA_CACHE_KEY]) setIndex(changes[PIAZZA_CACHE_KEY].newValue || emptyIndex());
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { active = false; controller.current?.abort(); chrome.storage.onChanged.removeListener(changed); };
  }, [isOpen]);

  async function clear() {
    controller.current?.abort();
    setBusy(false);
    try { setIndex(await piazzaIndexMessage('clear')); setMessage('Saved Piazza posts cleared.'); }
    catch (error) { setMessage(error.message); }
  }

  async function saveName() {
    controller.current?.abort();
    setBusy(false);
    try {
      setIndex(await piazzaIndexMessage('rename-course', { courseId: `piazza:${classId}`, name: courseName }));
      setMessage(`Saved ${courseName.trim()}. Existing posts are searchable with this course name now.`);
    } catch (error) { setMessage(error.message); }
  }

  const connection = <div className="ls-connection">
    <p role="status">{message}</p>
    <div className="ls-connection-actions">
      {onPiazza ? <>
        <label>Class ID <input aria-label="Piazza class ID" value={classId} onChange={(event) => {
          controller.current?.abort(); setBusy(false); setClassId(event.target.value.trim()); setCourseName('');
        }} /></label>
        <label>Course name <input aria-label="Piazza course name" placeholder="Auto-detect, e.g. CS 246" value={courseName} onChange={(event) => setCourseName(event.target.value)} disabled={busy} /></label>
        <button className="ls-chip" disabled={busy || !courseName.trim() || !index.courses.some((course) => course.id === `piazza:${classId}`)} onClick={saveName}>Save course name</button>
        <button className="ls-chip" disabled={busy} onClick={refresh}>{busy ? 'Refreshing Piazza…' : 'Refresh Piazza posts'}</button>
      </> : <a className="ls-chip" href="https://piazza.com" target="_blank" rel="noreferrer">Open Piazza</a>}
      {index.accountId && <button className="ls-chip" onClick={clear}>Clear Piazza data</button>}
      {!!diagnostics.length && <button className="ls-chip" onClick={() => setShowDiagnostics((value) => !value)}>{showDiagnostics ? 'Hide' : 'Show'} Piazza diagnostics</button>}
    </div>
    {showDiagnostics && <textarea className="ls-diagnostics" aria-label="Piazza diagnostics" readOnly value={JSON.stringify(diagnostics, null, 2)} />}
  </div>;
  return { index, connection };
}
