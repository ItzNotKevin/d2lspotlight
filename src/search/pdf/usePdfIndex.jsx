import { useEffect, useRef, useState } from 'react';
import { subscribeStorageChanges } from '../../extension-context.js';
import { indexMessage } from '../../learn/cache.js';
import { downloadPdf, encodePdf, MAX_DOCUMENTS, pdfRevision, notesSection } from './core.js';

export async function pdfMessage(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type: 'pdf-index', action, ...payload });
  if (!response?.ok) throw new Error(response?.error || 'PDF content search unavailable. Reload the extension and webpage.');
  return response;
}

export function usePdfIndex({ index, isOpen, verifiedGeneration, filters }) {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [revision, setRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const controller = useRef(null);
  const [selectedCourses, setSelectedCourses] = useState(null);
  const [preferencesReady, setPreferencesReady] = useState(null);
  const [failures, setFailures] = useState({});
  const [currentResource, setCurrentResource] = useState(null);
  const retryTarget = useRef(null);
  const preferenceKey = `pdfIndexCourses:${index.accountId}`;
  useEffect(() => {
    let active = true;
    setPreferencesReady(null);
    setFailures({});
    chrome.storage.local.get(preferenceKey).then(saved => {
      if (active) { setSelectedCourses(saved[preferenceKey] ?? null); setPreferencesReady(preferenceKey); }
    }).catch(() => { if (active) { setSelectedCourses(null); setPreferencesReady(preferenceKey); } });
    const unsubscribe = subscribeStorageChanges((changes, area) => {
      if (active && area === 'local' && changes[preferenceKey]) {
        controller.current?.abort();
        setSelectedCourses(changes[preferenceKey].newValue ?? null);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [preferenceKey]);
  function selectCourses(ids) {
    controller.current?.abort();
    setSelectedCourses(ids);
    chrome.storage.local.set({ [preferenceKey]: ids }).catch(error => setMessage(error.message));
  }
  useEffect(() => {
    let active = true;
    chrome.storage.local.get('pdfContentSearchEnabled').then(saved => {
      if (active) { setEnabled(saved.pdfContentSearchEnabled !== false); setReady(true); }
    }).catch(() => { if (active) setReady(true); });
    const unsubscribe = subscribeStorageChanges((changes, area) => {
      if (area === 'local' && changes.pdfCacheRevision) setRevision(value => value + 1);
      if (area === 'local' && changes.pdfContentSearchEnabled) setEnabled(changes.pdfContentSearchEnabled.newValue !== false);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    pdfMessage('status').then(result => { if (active) setStatus(result); })
      .catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [isOpen, index, revision]);

  const scope = JSON.stringify(filters);
  useEffect(() => {
    if (!ready || preferencesReady !== preferenceKey || !enabled || !isOpen || !index.accountId || !index.generation || verifiedGeneration !== index.generation) return;
    const abort = new AbortController();
    controller.current = abort;
    let requestId = null;
    (async () => {
      const existing = await pdfMessage('status');
      abort.signal.throwIfAborted();
      const cached = new Map(existing.documents.map(document => [document.id, document.revision]));
      const target = retryTarget.current;
      retryTarget.current = null;
      const candidates = index.resources.filter(resource => resource.type === 'PDF' && resource.pdfUrl
        && (target || selectedCourses === null || selectedCourses.includes(resource.courseId))
        && (target || selectedCourses !== null || !filters.courseId || resource.courseId === filters.courseId)
        && (target || selectedCourses !== null || !filters.source || filters.source === 'LEARN')
        && (target || selectedCourses !== null || !filters.notesSection || notesSection(resource) === filters.notesSection)
        && (target || selectedCourses !== null || !filters.instructor || index.pdfLabels?.[notesSection(resource)] === filters.instructor));
      const pending = candidates.filter(resource => cached.get(resource.id) !== pdfRevision(resource) && (!target || resource.id === target));
      let done = 0;
      let failed = 0;
      let warning = '';
      for (const resource of pending.slice(0, MAX_DOCUMENTS)) {
        abort.signal.throwIfAborted();
        setCurrentResource(resource.id);
        setMessage(`Reading PDF ${done + failed + 1} of ${Math.min(pending.length, MAX_DOCUMENTS)}: ${resource.title}`);
        requestId = crypto.randomUUID();
        try {
          const bytes = await downloadPdf(resource.pdfUrl, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) });
          abort.signal.throwIfAborted();
          const result = await pdfMessage('extract', { requestId, resourceId: resource.id, accountId: index.accountId,
            generation: index.generation, bytes: encodePdf(bytes) });
          abort.signal.throwIfAborted();
          done++;
          setFailures(previous => { const next = { ...previous }; delete next[resource.id]; return next; });
          if (result.document.partial || result.document.emptyPages) warning = 'Some PDFs have truncated or unreadable pages; scans and handwriting need OCR.';
          setRevision(value => value + 1);
        } catch (error) {
          abort.signal.throwIfAborted();
          warning = error.message;
          if (!error.stop && !/cache is full|data changed|another tab/.test(error.message)) {
            failed++;
            setFailures(previous => ({ ...previous, [resource.id]: error.message }));
          }
          if (error.code === 'SESSION') await indexMessage('clear');
          if (error.stop || /cache is full|data changed|another tab/.test(error.message)) break;
        } finally { requestId = null; }
      }
      abort.signal.throwIfAborted();
      const final = await pdfMessage('status');
      abort.signal.throwIfAborted();
      setStatus(final);
      const indexed = final.documents.filter(document => candidates.some(resource => resource.id === document.id)).length;
      const partial = final.documents.some(document => document.partial || document.emptyPages);
      setMessage(`${indexed} of ${candidates.length} PDFs in this scope indexed.${failed ? ` ${failed} could not be read.` : ''} ${warning || (partial ? 'Some pages have no readable text or exceed extraction limits.' : '')}`.trim());
    })().catch(error => { if (!abort.signal.aborted) setMessage(error.message); }).finally(() => { if (controller.current === abort) setCurrentResource(null); });
    return () => {
      abort.abort();
      if (requestId) {
        try { pdfMessage('cancel', { requestId }).catch(() => {}); } catch {}
      }
    };
  }, [ready, enabled, isOpen, index, verifiedGeneration, scope, retry, selectedCourses, preferencesReady, preferenceKey]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (!next) setMessage('PDF indexing paused. Saved page matches remain searchable.');
    chrome.storage.local.set({ pdfContentSearchEnabled: next }).catch(() => {});
  }
  async function clear() {
    controller.current?.abort();
    setEnabled(false);
    await chrome.storage.local.set({ pdfContentSearchEnabled: false });
    try {
      await indexMessage('clear-pdf');
      setRevision(value => value + 1);
      setMessage('PDF text cleared. Select a course or notes section, then enable PDF indexing to rebuild.');
    } catch (error) { setMessage(error.message); }
  }
  async function prioritize(courseId) {
    controller.current?.abort();
    try {
      await pdfMessage('prioritize-course', { courseId, accountId: index.accountId, generation: index.generation });
      selectCourses([courseId]);
      setRetry(value => value + 1);
      setMessage('Other courses’ cached PDF text removed. Indexing the selected course.');
    } catch (error) { setMessage(error.message); }
  }
  return { enabled, toggle, clear, retry: id => { retryTarget.current = typeof id === 'string' ? id : null; setRetry(value => value + 1); }, message, status, revision,
    selectedCourses, selectCourses, failures, currentResource, prioritize };
}
