import { useEffect, useRef, useState } from 'react';
import { subscribeStorageChanges } from '../../extension-context.js';
import { indexMessage } from '../../learn/cache.js';
import { downloadDocument, encodePdf, MAX_DOCUMENTS, pdfRevision } from './core.js';
import { indexingCandidates } from './scope.js';
import { handwritingProgress, hasPendingHandwriting } from '../ocr/progress.js';
import { shouldIndexPdf } from './retention.js';
import { OCR_BATCHES_PER_SESSION, OCR_VERSION } from '../ocr/config.js';

export async function pdfMessage(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type: 'pdf-index', action, ...payload });
  if (!response?.ok) throw new Error(response?.error || 'Document content search unavailable. Reload the extension and webpage.');
  return response;
}

export function usePdfIndex({ index, isOpen, verifiedGeneration, filters }) {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const [handwriting, setHandwriting] = useState(true);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [revision, setRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const controller = useRef(null);
  const [selectedCourses, setSelectedCourses] = useState(null);
  const [pinnedCourses, setPinnedCourses] = useState([]);
  const [preferencesReady, setPreferencesReady] = useState(null);
  const failures = Object.fromEntries(Object.entries(status?.progress || {}).filter(([, entry]) => entry.state === 'failed').map(([id, entry]) => [id, entry.error]));
  const [scanning, setScanning] = useState(false);
  const [currentResource, setCurrentResource] = useState(null);
  const retryTarget = useRef(null);
  const preferenceKey = `pdfIndexCourses:${index.accountId}`;
  const pinsKey = `pdfPinnedCourses:${index.accountId}`;
  useEffect(() => {
    let active = true;
    setPinnedCourses([]);
    chrome.storage.local.get(pinsKey).then(saved => { if (active) setPinnedCourses(Array.isArray(saved[pinsKey]) ? saved[pinsKey] : []); }).catch(() => {});
    const unsubscribe = subscribeStorageChanges((changes, area) => {
      if (active && area === 'local' && changes[pinsKey]) setPinnedCourses(Array.isArray(changes[pinsKey].newValue) ? changes[pinsKey].newValue : []);
    });
    return () => { active = false; unsubscribe(); };
  }, [pinsKey]);
  async function pinCourse(courseId) {
    const next = pinnedCourses.includes(courseId) ? pinnedCourses.filter(id => id !== courseId) : [...pinnedCourses, courseId];
    try { await chrome.storage.local.set({ [pinsKey]: next }); setPinnedCourses(next); }
    catch (error) { setMessage(error.message); }
  }
  useEffect(() => {
    let active = true;
    setPreferencesReady(null);
    chrome.storage.local.get(preferenceKey).then(saved => {
      if (active) { setSelectedCourses(saved[preferenceKey] ?? null); setPreferencesReady(preferenceKey); }
    }).catch(() => { if (active) { setSelectedCourses(null); setPreferencesReady(preferenceKey); } });
    const unsubscribe = subscribeStorageChanges((changes, area) => {
      if (active && area === 'local' && changes[preferenceKey]) {
        const next = changes[preferenceKey].newValue ?? null;
        setSelectedCourses(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [preferenceKey]);
  function selectCourses(ids) {
    controller.current?.abort();
    retryTarget.current = '@selection';
    setSelectedCourses(ids);
    setRetry(value => value + 1);
    chrome.storage.local.set({ [preferenceKey]: ids }).catch(error => setMessage(error.message));
  }
  useEffect(() => {
    let active = true;
    chrome.storage.local.get(['pdfContentSearchEnabled', 'handwritingIndexingEnabled']).then(saved => {
      if (active) { setEnabled(saved.pdfContentSearchEnabled !== false); setHandwriting(saved.handwritingIndexingEnabled !== false); setReady(true); }
    }).catch(() => { if (active) setReady(true); });
    const unsubscribe = subscribeStorageChanges((changes, area) => {
      if (area === 'local' && (changes.pdfCacheRevision || changes.pdfProgressRevision)) setRevision(value => value + 1);
      if (area === 'local' && changes.pdfContentSearchEnabled) setEnabled(changes.pdfContentSearchEnabled.newValue !== false);
      if (area === 'local' && changes.handwritingIndexingEnabled) setHandwriting(changes.handwritingIndexingEnabled.newValue !== false);
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
    setScanning(true);
    let requestId = null;
    (async () => {
      const existing = await pdfMessage('status');
      abort.signal.throwIfAborted();
      setStatus(existing);
      const cached = new Map(existing.documents.map(document => [document.id, document.revision]));
      const target = retryTarget.current;
      retryTarget.current = null;
      const candidates = indexingCandidates(index, filters, selectedCourses, target);
      const pending = target === '@handwriting' ? [] : candidates.filter(resource => shouldIndexPdf(resource, cached.get(resource.id), existing.progress?.[resource.id], target));
      let done = 0;
      let failed = 0;
      let warning = '';
      for (const resource of pending.slice(0, MAX_DOCUMENTS)) {
        abort.signal.throwIfAborted();
        setCurrentResource(resource.id);
        setMessage(`Reading document ${done + failed + 1} of ${Math.min(pending.length, MAX_DOCUMENTS)}: ${resource.title}`);
        requestId = crypto.randomUUID();
        try {
          await pdfMessage('progress', { state: 'pending', requestId, resourceId: resource.id, revision: pdfRevision(resource), accountId: index.accountId, generation: index.generation });
          abort.signal.throwIfAborted();
          const bytes = await downloadDocument(resource, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) });
          abort.signal.throwIfAborted();
          const result = await pdfMessage('extract', { requestId, resourceId: resource.id, accountId: index.accountId,
            generation: index.generation, revision: pdfRevision(resource), bytes: encodePdf(bytes) });
          abort.signal.throwIfAborted();
          done++;
          if (result.document.partial || result.document.emptyPages) warning = 'Some documents have truncated or unreadable text; images and handwriting need OCR.';
          setRevision(value => value + 1);
        } catch (error) {
          abort.signal.throwIfAborted();
          warning = error.message;
          if (!error.stop && !/cache is full|data changed|another tab/.test(error.message)) {
            failed++;
            const saved = await pdfMessage('progress', { state: 'failed', requestId, resourceId: resource.id, revision: pdfRevision(resource), accountId: index.accountId, generation: index.generation, error: error.message });
            abort.signal.throwIfAborted();
            setStatus(saved);
          }
          if (error.code === 'SESSION') await indexMessage('clear');
          if (error.stop || /cache is full|data changed|another tab/.test(error.message)) break;
        } finally { requestId = null; }
      }
      abort.signal.throwIfAborted();
      let final = await pdfMessage('status');
      let scanned = 0;
      if (handwriting && final.ocrAvailable) {
        for (const resource of candidates.filter(resource => resource.type === 'PDF')) {
          let saved = final.documents.find(document => document.id === resource.id);
          if (!saved || saved.revision !== pdfRevision(resource) || (saved.ocr?.error && target !== '*' && target !== resource.id)) continue;
          let bytes;
          while (scanned < OCR_BATCHES_PER_SESSION && !(saved.ocr?.version === OCR_VERSION && saved.ocr.complete)) {
            abort.signal.throwIfAborted();
            requestId = crypto.randomUUID();
            setCurrentResource(resource.id);
            setMessage(`Scanning handwriting · ${resource.title} · ${handwritingProgress(saved)}. Saved text stays searchable.`);
            try {
              bytes ||= encodePdf(await downloadDocument(resource, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) }));
              const result = await pdfMessage('ocr', { requestId, resourceId: resource.id, revision: pdfRevision(resource), accountId: index.accountId, generation: index.generation, bytes });
              abort.signal.throwIfAborted();
              saved = result.document; scanned++;
              setRevision(value => value + 1);
            } catch (error) {
              abort.signal.throwIfAborted();
              warning = error.message;
              await pdfMessage('ocr-error', { resourceId: resource.id, revision: pdfRevision(resource), accountId: index.accountId, generation: index.generation, error: error.message });
              break;
            } finally { requestId = null; }
          }
          if (scanned >= OCR_BATCHES_PER_SESSION) break;
        }
        final = await pdfMessage('status');
        abort.signal.throwIfAborted();
      }
      abort.signal.throwIfAborted();
      setStatus(final);
      const indexed = final.documents.filter(document => candidates.some(resource => resource.id === document.id)).length;
      const savedFailures = candidates.filter(resource => final.progress?.[resource.id]?.state === 'failed').length;
      const partial = final.documents.some(document => document.partial || document.emptyPages);
      setMessage(`${indexed} of ${candidates.length} documents in this scope indexed.${savedFailures ? ` ${savedFailures} could not be read. Use Retry to try again.` : ''} ${warning || (partial ? 'Some pages have no readable text or exceed extraction limits.' : '')}`.trim());
    })().catch(error => { if (!abort.signal.aborted) setMessage(error.message); }).finally(() => { if (controller.current === abort) { controller.current = null; setCurrentResource(null); setScanning(false); } });
    return () => {
      abort.abort();
      if (requestId) {
        try { pdfMessage('cancel', { requestId }).catch(() => {}); } catch {}
      }
    };
  }, [ready, enabled, handwriting, isOpen, index, verifiedGeneration, scope, retry, selectedCourses, preferencesReady, preferenceKey]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (!next) setMessage('Document indexing paused. Saved page matches remain searchable.');
    chrome.storage.local.set({ pdfContentSearchEnabled: next }).catch(() => {});
  }
  async function clear() {
    controller.current?.abort();
    setEnabled(false);
    await chrome.storage.local.set({ pdfContentSearchEnabled: false });
    try {
      await indexMessage('clear-pdf');
      setRevision(value => value + 1);
      setMessage('Document text cleared. Select a course or notes section, then enable document indexing to rebuild.');
    } catch (error) { setMessage(error.message); }
  }
  async function prioritize(courseId) {
    controller.current?.abort();
    try {
      await pdfMessage('prioritize-course', { courseId, accountId: index.accountId, generation: index.generation });
      selectCourses([courseId]);
      setRetry(value => value + 1);
      setMessage('Indexing the selected course. Pinned document text will be kept when making space.');
    } catch (error) { setMessage(error.message); }
  }
  const canContinueHandwriting = ready && preferencesReady === preferenceKey && enabled && handwriting && !scanning && isOpen && Boolean(index.accountId && index.generation && verifiedGeneration === index.generation && status?.ocrAvailable)
    && indexingCandidates(index, filters, selectedCourses).some(resource => resource.type === 'PDF' && hasPendingHandwriting(status.documents.find(document => document.id === resource.id), pdfRevision(resource)));
  function continueHandwriting() {
    if (!canContinueHandwriting || controller.current) return;
    retryTarget.current = '@handwriting';
    setRetry(value => value + 1);
  }
  return { enabled, toggle, clear, handwriting, canContinueHandwriting, continueHandwriting, toggleHandwriting: () => { const next = !handwriting; setHandwriting(next); chrome.storage.local.set({ handwritingIndexingEnabled: next }).catch(() => {}); }, retry: id => { retryTarget.current = typeof id === 'string' ? id : '*'; setRetry(value => value + 1); }, message, status, revision,
    selectedCourses, selectCourses, pinnedCourses, pinCourse, failures, currentResource, prioritize };
}
