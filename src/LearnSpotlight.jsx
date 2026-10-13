import { subscribeStorageChanges } from './extension-context.js';
import React, { useEffect, useRef, useState } from 'react';
import { Spotlight } from './Spotlight.jsx';
import { createLearnClient, LEARN_ORIGIN } from './learn/client.js';
import { CACHE_KEY, emptyIndex, indexMessage } from './learn/cache.js';
import { REFRESH_INTERVAL, refreshCourses } from './learn/sync.js';
import { usePiazzaIndex } from './piazza/usePiazzaIndex.jsx';
import { piazzaIndexMessage } from './piazza/cache.js';
import { associateCourses } from './search/associations.js';
import { usePdfIndex } from './search/pdf/usePdfIndex.jsx';
import { notesSection } from './search/pdf/core.js';
import { useCourseSites } from './sites/useCourseSites.jsx';

export function LearnSpotlight(props) {
  const piazza = usePiazzaIndex(props.isOpen);
  const [version] = useState(() => chrome.runtime.getManifest().version);
  const [index, setIndex] = useState(emptyIndex);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Checking your LEARN login before searching…');
  const [diagnostics, setDiagnostics] = useState([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [storageBytes, setStorageBytes] = useState(null);
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [verifiedGeneration, setVerifiedGeneration] = useState(null);
  const [accessibleCourses, setAccessibleCourses] = useState([]);
  const [pdfFilters, setPdfFilters] = useState({});
  const pdf = usePdfIndex({ index, isOpen: props.isOpen, verifiedGeneration: location.origin === LEARN_ORIGIN ? verifiedGeneration : null, filters: pdfFilters });
  const sitesConnection = useCourseSites({ index, isOpen: props.isOpen, verifiedGeneration });

  const [associations, setAssociations] = useState({ key: '', pairs: {} });
  const associationKey = `courseAssociations:${JSON.stringify([index.accountId, piazza.index.accountId])}`;
  useEffect(() => {
    let active = true;
    chrome.storage.local.get(associationKey).then((saved) => {
      if (active) setAssociations({ key: associationKey, pairs: saved[associationKey] || {} });
    }).catch(() => { if (active) setMessage('Saved course associations could not be loaded.'); });
    const changed = (changes, area) => {
      if (active && area === 'local' && changes[associationKey]) setAssociations({ key: associationKey, pairs: changes[associationKey].newValue || {} });
    };
    const unsubscribe = subscribeStorageChanges(changed);
    return () => { active = false; unsubscribe(); };
  }, [associationKey]);

  const controller = useRef(null);
  const onLearn = location.origin === LEARN_ORIGIN;

  useEffect(() => {
    let active = true;
    chrome.storage.local.get(['semanticSearchEnabled', 'localSemanticSearchEnabled']).then((saved) => {
      if (active) setSemanticEnabled(Boolean(saved.semanticSearchEnabled ?? saved.localSemanticSearchEnabled));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function toggleSemanticSearch() {
    const enabled = !semanticEnabled;
    setSemanticEnabled(enabled);
    chrome.storage.local.set({ semanticSearchEnabled: enabled }).catch(() => {});
  }

  useEffect(() => {
    if (!props.isOpen) return;
    let active = true;
    chrome.storage.local.getBytesInUse(null).then((bytes) => {
      if (active) setStorageBytes(bytes);
    }).catch(() => {});
    return () => { active = false; };
  }, [props.isOpen, index, piazza.index]);

  async function refresh(force = false) {
    setVerifiedGeneration(null);
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    const { signal } = next;
    setBusy(true);
    setDiagnostics([]);
    setMessage('Checking LEARN for updates…');
    let previous;
    const client = createLearnClient({ signal, onIdentity: async (accountId) => {
      signal.throwIfAborted();
      previous = await indexMessage('begin', { accountId });
      signal.throwIfAborted();
      setIndex(previous);
    }, onDiagnostic: (entry) => {
      if (!signal.aborted) setDiagnostics((current) => [...current.slice(-99), entry]);
    } });
    try {
      const session = await client.connect();
      signal.throwIfAborted();
      setAccessibleCourses(session.courses.map(course => course.id));
      setVerifiedGeneration(previous.generation);
      const sameCourses = session.courses.map((course) => course.id).sort().join(',') === previous.courses.map((course) => course.id).sort().join(',');
      const pdfDestinationsReady = previous.resources.every(resource => resource.type !== 'PDF' || resource.pdfUrl);
      if (!force && sameCourses && pdfDestinationsReady && previous.updatedAt && !previous.failedCourses.length && Date.now() - previous.updatedAt < REFRESH_INTERVAL) {
        setMessage('Your resources are up to date.');
        setVerifiedGeneration(previous.generation);
        return;
      }
      const updated = await refreshCourses({ client, session, previous, signal,
        onDiagnostic: (entry) => { if (!signal.aborted) setDiagnostics((current) => [...current.slice(-99), entry]); },
        onSnapshot: async (snapshot) => {
          signal.throwIfAborted();
          await indexMessage('commit', snapshot);
        },
        onProgress: (done, total) => setMessage(`Refreshing courses ${done} of ${total}…`) });
      signal.throwIfAborted();
      setIndex(await indexMessage('commit', updated));
      setVerifiedGeneration(updated.generation);
      if (!signal.aborted) setMessage(updated.failedCourses.length
        ? `${updated.failedCourses.length} courses could not refresh. Some results may be missing or older.`
        : `${updated.resources.length} resources across ${updated.courses.length} courses.`);
    } catch (error) {
      if (signal.aborted) return;
      if (['SESSION', 'NOT_JSON'].includes(error.code)) {
        await indexMessage('clear').catch(() => {});
        setIndex(emptyIndex());
      }
      setVerifiedGeneration(null);
      setMessage(`${error.message} LEARN search is paused until your session can be verified.`);
      setDiagnostics((current) => [...current, { stage: 'refresh', result: error.code || 'FAILED' }]);
    } finally { if (!signal.aborted) setBusy(false); }
  }

  async function checkSavedSession() {
    setVerifiedGeneration(null);
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setBusy(true);
    setMessage('Checking your LEARN login before searching…');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'learn-session' });
      if (next.signal.aborted) return;
      if (!result?.ok) throw new Error(result?.error || 'Could not verify your LEARN login.');
      setIndex(result.index);
      setAccessibleCourses(result.courseIds);
      setVerifiedGeneration(result.index.generation);
      setMessage('LEARN login confirmed. Searching your saved resources.');
    } catch (error) {
      if (!next.signal.aborted) setMessage(`${error.message} Open LEARN to sign in, then check your login again.`);
    } finally { if (!next.signal.aborted) setBusy(false); }
  }

  useEffect(() => {
    setVerifiedGeneration(null);
    if (!props.isOpen) return;
    let active = true;
    indexMessage('read').then((saved) => {
      if (!active) return;
      setIndex(saved);
      if (onLearn) refresh();
      else checkSavedSession();
    }).catch((error) => { if (active) setMessage(error.message); });
    const changed = (changes, area) => {
      if (active && area === 'local' && changes[CACHE_KEY]) {
        const saved = changes[CACHE_KEY].newValue || emptyIndex();
        setIndex(current => {
          if (current.accountId !== saved.accountId || current.generation !== saved.generation) setVerifiedGeneration(null);
          return saved;
        });
      }
    };
    const recheck = () => {
      if (!active || document.visibilityState === 'hidden') return;
      if (onLearn) refresh(); else checkSavedSession();
    };
    const hide = () => {
      setVerifiedGeneration(null);
      controller.current?.abort();
    };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); else recheck(); };
    window.addEventListener('focus', recheck);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', visibility);
    const unsubscribe = subscribeStorageChanges(changed);
    return () => {
      active = false; controller.current?.abort(); unsubscribe();
      window.removeEventListener('focus', recheck);
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [props.isOpen]);

  async function clear() {
    setVerifiedGeneration(null);
    controller.current?.abort();
    setBusy(false);
    try {
      setIndex(await indexMessage('clear'));
      setMessage('Saved resources and recent history cleared. Refresh on LEARN to rebuild.');
    } catch (error) { setMessage(error.message); }
  }

  function recordOpen(resource) {
    const send = resource.source === 'Piazza' ? piazzaIndexMessage : indexMessage;
    send('opened', { id: resource.resourceId || resource.id }).catch(() => setMessage('Opened resource, but could not save recent history.'));
  }

  const connection = (
    <div className="ls-connection">
      <p role="status">{message}</p>
      <div className="ls-connection-actions">
        <button className="ls-chip" aria-pressed={semanticEnabled} onClick={toggleSemanticSearch}>
          Meaning search: {semanticEnabled ? 'on' : 'off'}
        </button>
        {onLearn
          ? <button className="ls-chip" disabled={busy} onClick={() => refresh(true)}>{busy ? 'Refreshing…' : 'Refresh courses'}</button>
          : <><a className="ls-chip" href={LEARN_ORIGIN} target="_blank" rel="noreferrer">Open LEARN / sign in</a><button className="ls-chip" disabled={busy} onClick={checkSavedSession}>{busy ? 'Checking login…' : 'Check LEARN login'}</button></>}
        {index.accountId && <button className="ls-chip" onClick={clear}>Clear LEARN data</button>}
        <button className="ls-chip" aria-pressed={pdf.enabled} onClick={pdf.toggle}>PDF indexing: {pdf.enabled ? 'on' : 'paused'}</button>
        {onLearn && <button className="ls-chip" onClick={pdf.retry}>Retry PDF indexing</button>}
        {!!pdf.status?.documents.length && <button className="ls-chip" onClick={pdf.clear}>Clear PDF text</button>}
        {diagnostics.length > 0 && <button className="ls-chip" onClick={() => setShowDiagnostics((value) => !value)}>{showDiagnostics ? 'Hide' : 'Show'} diagnostics</button>}
      </div>
      <p role="status">{!index.accountId || !verifiedGeneration || verifiedGeneration !== index.generation ? 'LEARN and PDF search require a verified login.' : pdf.message || (onLearn ? 'PDF text will be indexed after your LEARN session is checked.' : 'Saved PDF text is searchable. Open LEARN to index more PDFs.')}{pdf.status ? ` · ${pdf.status.documents.length} PDFs · ${(pdf.status.chars * 2 / (1024 * 1024)).toFixed(1)} MB text (approx.)` : ''}</p>
      {showDiagnostics && <textarea className="ls-diagnostics" aria-label="Connection diagnostics — copy to share" readOnly value={JSON.stringify({ adapter: 'browser-session-v2', events: diagnostics }, null, 2)} />}
    </div>
  );
  const footer = index.updatedAt ? `Saved ${new Date(index.updatedAt).toLocaleString()}${index.failedCourses.length ? ' · partial refresh' : ''}` : index.resources.length ? 'Saved partial index · refresh on LEARN' : 'No saved resources yet';
  const learnSearchReady = Boolean(props.isOpen && index.accountId && verifiedGeneration === index.generation);
  const combined = React.useMemo(() => associateCourses(learnSearchReady ? index.courses.filter(course => accessibleCourses.includes(course.id)) : [], piazza.index.courses,
    [...(learnSearchReady ? index.resources.filter(resource => accessibleCourses.includes(resource.courseId)) : []).map((resource) => ({ ...resource, source: 'LEARN', notesSection: notesSection(resource), instructor: index.pdfLabels?.[notesSection(resource)] || '' })), ...(learnSearchReady ? (index.siteResources || []).filter(resource => accessibleCourses.includes(resource.courseId)) : []), ...piazza.index.resources], associations.key === associationKey ? associations.pairs : {}), [index, piazza.index, associations, associationKey, learnSearchReady, accessibleCourses]);
  const history = React.useMemo(() => ({ ...index.history, ...piazza.index.history }), [index.history, piazza.index.history]);

  return <Spotlight {...props} resources={combined.resources} courses={combined.courses} history={history}
    pdfRevision={pdf.revision} onFiltersChange={setPdfFilters} onLabelNotes={onLearn ? async (section, name) => {
      try { setIndex(await indexMessage('label-notes', { accountId: index.accountId, section, name })); }
      catch (error) { setMessage(error.message); }
    } : null}
    semanticEnabled={semanticEnabled && learnSearchReady} pdfSearchEnabled={learnSearchReady}
    demo={false} connection={<>{connection}{sitesConnection}{piazza.connection}{combined.choices.map((choice) => <label className="ls-search-context" key={choice.piazza.id}>
      Link Piazza {choice.piazza.name} ({choice.piazza.id}) to LEARN:
      <select aria-label={`Confirm course association for ${choice.piazza.name}`} value="" onChange={(event) => {
        const pairs = { ...(associations.key === associationKey ? associations.pairs : {}), [choice.piazza.id]: event.target.value };
        setAssociations({ key: associationKey, pairs });
        chrome.storage.local.set({ [associationKey]: pairs }).catch(() => setMessage('Course association could not be saved.'));
      }}><option value="">{choice.conflictingTerm ? 'Different terms — confirm association' : 'Multiple matches — choose a course'}</option>{choice.learn.map((course) => <option key={course.id} value={course.id}>{course.name} ({course.code || course.id})</option>)}</select>
    </label>)}</>} onResourceOpen={recordOpen}
    footer={`v${version} · LEARN + Piazza + Websites${storageBytes === null ? '' : ` · ${(storageBytes / (1024 * 1024)).toFixed(2)} MB saved`} · ${footer}`} />;

}
