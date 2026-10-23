import { subscribeStorageChanges } from './extension-context.js';
import React, { useEffect, useRef, useState } from 'react';
import { DiagnosticsReport } from './DiagnosticsReport.jsx';
import { Spotlight } from './Spotlight.jsx';
import { RememberedSection } from './settings/RememberedSection.jsx';
import { createLearnClient, LEARN_ORIGIN } from './learn/client.js';
import { CACHE_KEY, emptyIndex, indexMessage } from './learn/cache.js';
import { REFRESH_INTERVAL, refreshCourses } from './learn/sync.js';
import { usePiazzaIndex } from './piazza/usePiazzaIndex.jsx';
import { piazzaIndexMessage } from './piazza/cache.js';
import { associateCourses } from './search/associations.js';
import { usePdfIndex, pdfMessage } from './search/pdf/usePdfIndex.jsx';
import { DocumentProgress } from './search/pdf/DocumentProgress.jsx';
import { isSearchableDocument, documentDownloadUrl } from './search/documents.js';
import { handwritingProgress } from './search/ocr/progress.js';
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
  const semanticPreferenceTouched = useRef(false);
  const [verifiedGeneration, setVerifiedGeneration] = useState(null);
  const [accessibleCourses, setAccessibleCourses] = useState([]);
  const [pdfFilters, setPdfFilters] = useState({});
  const pdf = usePdfIndex({ index, isOpen: props.isOpen, verifiedGeneration: location.origin === LEARN_ORIGIN ? verifiedGeneration : null, filters: pdfFilters });
  const sites = useCourseSites({ index, isOpen: props.isOpen, verifiedGeneration });

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
    chrome.storage.local.get(['semanticSearchEnabled', 'localSemanticSearchEnabled', 'spotlightLaunchStatus']).then((saved) => {
      const preference = saved.semanticSearchEnabled ?? saved.localSemanticSearchEnabled;
      if (preference !== undefined) {
        if (active && !semanticPreferenceTouched.current) setSemanticEnabled(Boolean(preference));
      } else {
        // Installed models make meaning search available by default. Explicit opt-outs persist.
        chrome.runtime.sendMessage({ type: 'semantic-status' }).then(response => {
          if (active && !semanticPreferenceTouched.current) setSemanticEnabled(Boolean(response?.ok && response.available));
        }).catch(() => {});
      }
      if (active && saved.spotlightLaunchStatus?.ok === false) setDiagnostics(current => [...current, { stage: 'last overlay launch', ...saved.spotlightLaunchStatus }]);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function toggleSemanticSearch() {
    semanticPreferenceTouched.current = true;
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
      const pdfDestinationsReady = previous.resources.every(resource => !['PDF', 'DOC', 'SLIDES'].includes(resource.type) || resource.pdfUrl || resource.documentFormat || resource.legacyOffice);
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
    if (resource.source === 'LEARN' && isSearchableDocument(resource)) pdfMessage('touch', { resourceId: resource.resourceId || resource.id, accountId: index.accountId }).catch(() => {});
    const send = resource.source === 'Piazza' ? piazzaIndexMessage : indexMessage;
    send('opened', { id: resource.resourceId || resource.id }).catch(() => setMessage('Opened resource, but could not save recent history.'));
  }

  const connection = (
    <div className="ls-connection">
      <h3>LEARN and documents</h3>
      <p>Search PDF, PowerPoint (.pptx), and Word (.docx) text. Office matches open the LEARN document; use the slide or paragraph label to locate the passage. Older .ppt/.doc files remain searchable by title. Images, speaker notes, headers, comments, and embedded objects are not searched.</p>
      {onLearn && index.courses.length > 0 && <fieldset className="ls-pdf-courses">
        <legend>Courses to index</legend>
        <p>Select courses to index independently of search filters. Saved document text stays searchable when a course is unchecked.</p>
        <button className="ls-chip" onClick={() => pdf.selectCourses(null)}>All courses / follow search filters</button>
        {index.courses.map(course => {
          const documents = index.resources.filter(resource => isSearchableDocument(resource) && resource.courseId === course.id);
          if (!documents.length) return null;
          const indexed = documents.filter(resource => pdf.status?.documents.some(document => document.id === resource.id)).length;
          const failed = documents.filter(resource => pdf.failures[resource.id]);
          const partial = documents.some(resource => pdf.status?.documents.some(document => document.id === resource.id && (document.partial || document.emptyPages)));
          const replaced = documents.filter(resource => pdf.status?.progress?.[resource.id]?.state === 'evicted').length;
          return <div className="ls-pdf-course" key={course.id}>
            <label><input type="checkbox" aria-label={`Index documents for ${course.name}`} checked={pdf.selectedCourses === null || pdf.selectedCourses.includes(course.id)} onChange={event => {
              const selected = pdf.selectedCourses ?? index.courses.map(course => course.id);
              pdf.selectCourses(event.target.checked ? [...new Set([...selected, course.id])] : selected.filter(id => id !== course.id));
            }} /> {course.name}</label>
            <p>{indexed} indexed · {failed.length} failed · {Math.max(0, documents.length - indexed - failed.length - replaced)} pending{replaced ? ` · ${replaced} not cached` : ''}{documents.some(resource => resource.id === pdf.currentResource) ? ' · Reading now' : ''}</p>
            <p>{!pdf.status ? 'Checking coverage…' : indexed === documents.length && !partial ? 'All detected document contents searchable' : 'Partial document coverage'}{replaced ? ` · ${replaced} replaced to make space` : ''}</p>
            {documents.some(resource => !documentDownloadUrl(resource)) && <p>Some document links can’t be indexed automatically.</p>}
            <button className="ls-chip" aria-pressed={pdf.pinnedCourses.includes(course.id)} onClick={() => pdf.pinCourse(course.id)}>{pdf.pinnedCourses.includes(course.id) ? 'Unpin course' : 'Pin course'}</button>{' '}
            <button className="ls-chip" disabled={!verifiedGeneration || !pdf.enabled} onClick={() => pdf.prioritize(course.id)}>Index this course</button>
            {failed.map(resource => <div key={resource.id}><span>{resource.title}: {pdf.failures[resource.id]}</span> <button className="ls-chip" disabled={!verifiedGeneration || !pdf.enabled} onClick={() => pdf.retry(resource.id)}>Retry {resource.title}</button></div>)}
          </div>;
        })}
        <p>The cache holds up to 100 documents within its text-size limit. Older, less recently opened unpinned text is replaced as needed; document links remain available. Pinning protects existing text, but does not download a course automatically. Manual Clear document text still clears everything. Unfinished files resume when reopened; failures wait for retry.</p>
      </fieldset>}
      <div className="ls-connection-actions">
        <button className="ls-chip" aria-pressed={semanticEnabled} onClick={toggleSemanticSearch}>
          Meaning search: {semanticEnabled ? 'on' : 'off'}
        </button>
        {onLearn
          ? <button className="ls-chip" disabled={busy} onClick={() => refresh(true)}>{busy ? 'Refreshing…' : 'Refresh courses'}</button>
          : <><a className="ls-chip" href={LEARN_ORIGIN} target="_blank" rel="noreferrer">Open LEARN / sign in</a><button className="ls-chip" disabled={busy} onClick={checkSavedSession}>{busy ? 'Checking login…' : 'Check LEARN login'}</button></>}
        {index.accountId && <button className="ls-chip" onClick={clear}>Clear LEARN data</button>}
        <button className="ls-chip" aria-pressed={pdf.enabled} onClick={pdf.toggle}>Document indexing: {pdf.enabled ? 'on' : 'paused'}</button>
        {pdf.status?.ocrAvailable && <button className="ls-chip" aria-pressed={pdf.handwriting} onClick={pdf.toggleHandwriting}>Handwriting indexing: {pdf.handwriting ? 'on' : 'paused'} · experimental</button>}
        {onLearn && pdf.status?.ocrAvailable && <button className="ls-chip" disabled={!pdf.canContinueHandwriting} onClick={pdf.continueHandwriting}>Continue handwriting scan</button>}
        {onLearn && <button className="ls-chip" onClick={pdf.retry}>Retry document indexing</button>}
        {!!pdf.status?.documents.length && <button className="ls-chip" onClick={pdf.clear}>Clear document text</button>}
        {diagnostics.length > 0 && <button className="ls-chip" onClick={() => setShowDiagnostics((value) => !value)}>{showDiagnostics ? 'Hide' : 'Show'} diagnostics</button>}
      </div>
      <p role="status">{!index.accountId || !verifiedGeneration || verifiedGeneration !== index.generation ? 'LEARN and document search require a verified login.' : pdf.message || (onLearn ? 'Document text will be indexed after your LEARN session is checked.' : 'Saved document text is searchable. Open LEARN to index more documents.')}{pdf.status ? ` · ${pdf.status.documents.length} documents · ${(pdf.status.chars * 2 / (1024 * 1024)).toFixed(1)} MB text (approx.)` : ''}</p>
      {pdf.status && !pdf.status.ocrAvailable && <p>Handwriting models are not installed in this build. Printed PDF and Office text remain searchable.</p>}
      {pdf.status?.ocrAvailable && <p>Handwriting joins normal searches automatically. OCR can misread words and symbols; verify matches on the PDF page. Scanning processes up to 8 small region batches at a time, including handwritten additions on printed pages. Use Continue handwriting scan for another batch without reopening Spotlight. Regions are parts of a page; saved regions remain searchable while the rest is scanned.</p>}
      {pdf.status?.documents.filter(document => document.ocr).map(document => <p key={document.id}>{index.resources.find(resource => resource.id === document.id)?.title}: handwriting {handwritingProgress(document)}</p>)}
      {showDiagnostics && <DiagnosticsReport label="Connection diagnostics" value={JSON.stringify({ adapter: 'browser-session-v2', events: diagnostics }, null, 2)} />}
    </div>
  );
  const footer = index.updatedAt ? `Saved ${new Date(index.updatedAt).toLocaleString()}${index.failedCourses.length ? ' · partial refresh' : ''}` : index.resources.length ? 'Saved partial index · refresh on LEARN' : 'No saved resources yet';
  const learnSearchReady = Boolean(props.isOpen && index.accountId && verifiedGeneration === index.generation);
  const coveragePdfs = learnSearchReady && (!pdfFilters.source || pdfFilters.source === 'LEARN') ? index.resources.filter(resource => isSearchableDocument(resource) && accessibleCourses.includes(resource.courseId)
    && (!pdfFilters.documentId || resource.id === pdfFilters.documentId)
    && (!pdfFilters.courseId || resource.courseId === pdfFilters.courseId)
    && (!pdfFilters.notesSection || notesSection(resource) === pdfFilters.notesSection)
    && (!pdfFilters.instructor || index.pdfLabels?.[notesSection(resource)] === pdfFilters.instructor)) : [];
  const covered = coveragePdfs.filter(resource => pdf.status?.documents.some(document => document.id === resource.id));
  const handwritingDocuments = covered.filter(resource => resource.type === 'PDF').map(resource => pdf.status.documents.find(document => document.id === resource.id));
  const combined = React.useMemo(() => associateCourses(learnSearchReady ? index.courses.filter(course => accessibleCourses.includes(course.id)) : [], piazza.index.courses,
    [...(learnSearchReady ? index.resources.filter(resource => accessibleCourses.includes(resource.courseId)) : []).map((resource) => ({ ...resource, source: 'LEARN', notesSection: notesSection(resource), instructor: index.pdfLabels?.[notesSection(resource)] || '' })), ...(learnSearchReady ? (index.siteResources || []).filter(resource => accessibleCourses.includes(resource.courseId)) : []), ...piazza.index.resources], associations.key === associationKey ? associations.pairs : {}), [index, piazza.index, associations, associationKey, learnSearchReady, accessibleCourses]);
  const history = React.useMemo(() => ({ ...index.history, ...piazza.index.history }), [index.history, piazza.index.history]);

  return <Spotlight {...props} resources={combined.resources} courses={combined.courses} history={history}
    pdfRevision={pdf.revision} onFiltersChange={setPdfFilters} onLabelNotes={onLearn ? async (section, name) => {
      try { setIndex(await indexMessage('label-notes', { accountId: index.accountId, section, name })); }
      catch (error) { setMessage(error.message); }
    } : null}
    semanticEnabled={semanticEnabled && learnSearchReady} pdfSearchEnabled={learnSearchReady}
    demo={false} connection={<div className="ls-search-connection">
      <div className="ls-session-status"><p role="status">{message}</p>
        {!learnSearchReady && !onLearn && <div className="ls-connection-actions">
          <a className="ls-chip" href={LEARN_ORIGIN} target="_blank" rel="noreferrer">Open LEARN / sign in</a>
          <button className="ls-chip" disabled={busy} onClick={checkSavedSession}>{busy ? 'Checking login…' : 'Check LEARN login'}</button>
        </div>}
      </div>
      {sites.prompt}{sites.status}
      <DocumentProgress resources={coveragePdfs} pdf={pdf} canIndex={onLearn && learnSearchReady} />
      {pdf.status?.ocrAvailable && handwritingDocuments.length > 0 && <p className="ls-coverage" role="status">Handwriting search is experimental: {handwritingDocuments.reduce((sum, document) => sum + (document.ocr?.scannedPages || 0), 0)} of {handwritingDocuments.reduce((sum, document) => sum + document.totalPages, 0)} PDF pages scanned. Saved OCR text joins normal results; unscanned or misread handwriting may be missing.</p>}
      {learnSearchReady && (index.courseSites || []).some(site => site.enabled && site.partial && (!pdfFilters.courseId || site.courseId === pdfFilters.courseId)) && (!pdfFilters.source || pdfFilters.source === 'Website') && <p className="ls-coverage" role="status">Course website coverage is partial; some pages may be missing from search.</p>}
      <details className="ls-settings" aria-label="Search settings"><summary>Settings</summary>
      <div className="ls-settings-body">
      <RememberedSection sectionId="learn" label="LEARN & document indexing">{connection}</RememberedSection>
      <RememberedSection sectionId="websites" label="Course websites">{sites.settings}</RememberedSection>
      <RememberedSection sectionId="piazza" label="Piazza">{piazza.connection}</RememberedSection>
      {combined.choices.map((choice) => <label className="ls-search-context" key={choice.piazza.id}>
      Link Piazza {choice.piazza.name} ({choice.piazza.id}) to LEARN:
      <select aria-label={`Confirm course association for ${choice.piazza.name}`} value="" onChange={(event) => {
        const pairs = { ...(associations.key === associationKey ? associations.pairs : {}), [choice.piazza.id]: event.target.value };
        setAssociations({ key: associationKey, pairs });
        chrome.storage.local.set({ [associationKey]: pairs }).catch(() => setMessage('Course association could not be saved.'));
      }}><option value="">{choice.conflictingTerm ? 'Different terms — confirm association' : 'Multiple matches — choose a course'}</option>{choice.learn.map((course) => <option key={course.id} value={course.id}>{course.name} ({course.code || course.id})</option>)}</select>
    </label>)}<p className="ls-settings-meta">Version {version}{storageBytes === null ? '' : ` · ${(storageBytes / (1024 * 1024)).toFixed(2)} MB saved locally`}</p></div></details></div>} onResourceOpen={recordOpen}
    footer={footer} />;

}
