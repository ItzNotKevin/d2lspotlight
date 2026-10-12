import React, { useEffect, useRef, useState } from 'react';
import { Spotlight } from './Spotlight.jsx';
import { createLearnClient, LEARN_ORIGIN } from './learn/client.js';
import { CACHE_KEY, emptyIndex, indexMessage } from './learn/cache.js';
import { REFRESH_INTERVAL, refreshCourses } from './learn/sync.js';
import { usePiazzaIndex } from './piazza/usePiazzaIndex.jsx';
import { piazzaIndexMessage } from './piazza/cache.js';
import { associateCourses } from './search/associations.js';

export function LearnSpotlight(props) {
  const piazza = usePiazzaIndex(props.isOpen);
  const [index, setIndex] = useState(emptyIndex);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading saved resources…');
  const [diagnostics, setDiagnostics] = useState([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [storageBytes, setStorageBytes] = useState(null);
  const [semanticEnabled, setSemanticEnabled] = useState(false);

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
    chrome.storage.onChanged.addListener(changed);
    return () => { active = false; chrome.storage.onChanged.removeListener(changed); };
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
      const sameCourses = session.courses.map((course) => course.id).sort().join(',') === previous.courses.map((course) => course.id).sort().join(',');
      if (!force && sameCourses && previous.updatedAt && !previous.failedCourses.length && Date.now() - previous.updatedAt < REFRESH_INTERVAL) {
        setMessage('Your resources are up to date.');
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
      if (!signal.aborted) setMessage(updated.failedCourses.length
        ? `${updated.failedCourses.length} courses could not refresh. Some results may be missing or older.`
        : `${updated.resources.length} resources across ${updated.courses.length} courses.`);
    } catch (error) {
      if (signal.aborted) return;
      if (['SESSION', 'NOT_JSON'].includes(error.code)) {
        await indexMessage('clear').catch(() => {});
        setIndex(emptyIndex());
      }
      setMessage(`${error.message} ${['SESSION', 'NOT_JSON'].includes(error.code) ? '' : 'Saved results remain available.'}`);
      setDiagnostics((current) => [...current, { stage: 'refresh', result: error.code || 'FAILED' }]);
    } finally { if (!signal.aborted) setBusy(false); }
  }

  useEffect(() => {
    if (!props.isOpen) return;
    let active = true;
    indexMessage('read').then((saved) => {
      if (!active) return;
      setIndex(saved);
      if (onLearn) refresh();
      else setMessage(saved.resources.length ? 'Searching saved resources. Open LEARN to refresh.' : 'Open Spotlight on LEARN to index your courses.');
    }).catch((error) => { if (active) setMessage(error.message); });
    const changed = (changes, area) => {
      if (active && area === 'local' && changes[CACHE_KEY]) setIndex(changes[CACHE_KEY].newValue || emptyIndex());
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { active = false; controller.current?.abort(); chrome.storage.onChanged.removeListener(changed); };
  }, [props.isOpen]);

  async function clear() {
    controller.current?.abort();
    setBusy(false);
    try {
      setIndex(await indexMessage('clear'));
      setMessage('Saved resources and recent history cleared. Refresh on LEARN to rebuild.');
    } catch (error) { setMessage(error.message); }
  }

  function recordOpen(resource) {
    const send = resource.source === 'Piazza' ? piazzaIndexMessage : indexMessage;
    send('opened', { id: resource.id }).catch(() => setMessage('Opened resource, but could not save recent history.'));
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
          : <a className="ls-chip" href={LEARN_ORIGIN} target="_blank" rel="noreferrer">Open LEARN</a>}
        {index.accountId && <button className="ls-chip" onClick={clear}>Clear LEARN data</button>}
        {diagnostics.length > 0 && <button className="ls-chip" onClick={() => setShowDiagnostics((value) => !value)}>{showDiagnostics ? 'Hide' : 'Show'} diagnostics</button>}
      </div>
      {showDiagnostics && <textarea className="ls-diagnostics" aria-label="Connection diagnostics — copy to share" readOnly value={JSON.stringify({ adapter: 'browser-session-v2', events: diagnostics }, null, 2)} />}
    </div>
  );
  const footer = index.updatedAt ? `Saved ${new Date(index.updatedAt).toLocaleString()}${index.failedCourses.length ? ' · partial refresh' : ''}` : index.resources.length ? 'Saved partial index · refresh on LEARN' : 'No saved resources yet';
  const combined = React.useMemo(() => associateCourses(index.courses, piazza.index.courses,
    [...index.resources.map((resource) => ({ ...resource, source: 'LEARN' })), ...piazza.index.resources], associations.key === associationKey ? associations.pairs : {}), [index, piazza.index, associations, associationKey]);
  const history = React.useMemo(() => ({ ...index.history, ...piazza.index.history }), [index.history, piazza.index.history]);

  return <Spotlight {...props} resources={combined.resources} courses={combined.courses} history={history}
    semanticEnabled={semanticEnabled}
    demo={false} connection={<>{connection}{piazza.connection}{combined.choices.map((choice) => <label className="ls-search-context" key={choice.piazza.id}>
      Link Piazza {choice.piazza.name} ({choice.piazza.id}) to LEARN:
      <select aria-label={`Confirm course association for ${choice.piazza.name}`} value="" onChange={(event) => {
        const pairs = { ...(associations.key === associationKey ? associations.pairs : {}), [choice.piazza.id]: event.target.value };
        setAssociations({ key: associationKey, pairs });
        chrome.storage.local.set({ [associationKey]: pairs }).catch(() => setMessage('Course association could not be saved.'));
      }}><option value="">{choice.conflictingTerm ? 'Different terms — confirm association' : 'Multiple matches — choose a course'}</option>{choice.learn.map((course) => <option key={course.id} value={course.id}>{course.name} ({course.code || course.id})</option>)}</select>
    </label>)}</>} onResourceOpen={recordOpen}
    footer={`v${chrome.runtime.getManifest().version} · LEARN + Piazza${storageBytes === null ? '' : ` · ${(storageBytes / (1024 * 1024)).toFixed(2)} MB saved`} · ${footer}`} />;

}
