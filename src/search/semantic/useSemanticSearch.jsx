import { useEffect, useState } from 'react';
import { DEBOUNCE_MS } from './config.js';
import { prepareQuery } from '../rank.js';

const EMPTY_MATCHES = [];

export function useSemanticSearch({ enabled, isOpen, resources, query, courseId, source, documents, recent, history }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!enabled || !isOpen || query.trim().length < 3 || !prepareQuery(query).words.length) {
      setState(null);
      return;
    }
    let active = true;
    let sent = false;
    const requestId = crypto.randomUUID();
    const identity = { resources, query, courseId, source, documents, recent, history };
    setState({ ...identity, matches: EMPTY_MATCHES, message: 'Preparing meaning matches…' });
    const timer = setTimeout(async () => {
      try {
        sent = true;
        const result = await chrome.runtime.sendMessage({ type: 'semantic-search', requestId, query,
          filters: { courseId, source, documents, recent } });
        if (!active) return;
        const message = result?.ok
          ? result.total > result.indexed ? `Meaning search covers ${result.indexed} of ${result.total} saved resources.`
            : result.matches?.length ? 'Meaning search ready.' : 'No related meaning matches in your saved resources.'
          : result?.error || 'Meaning search unavailable. Keyword search still works.';
        setState({ ...identity, matches: result?.ok ? result.matches : EMPTY_MATCHES, message });
      } catch {
        if (active) setState({ ...identity, matches: EMPTY_MATCHES, message: 'Meaning search unavailable. Reload the extension and webpage.' });
      }
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
      if (sent) {
        try { chrome.runtime.sendMessage({ type: 'semantic-cancel', requestId }).catch(() => {}); }
        catch { /* Extension was reloaded while this search was pending. */ }
      }
    };
  }, [enabled, isOpen, resources, query, courseId, source, documents, recent, history]);
  const current = enabled && isOpen && state?.resources === resources && state?.query === query
    && state?.courseId === courseId && state?.source === source && state?.documents === documents
    && state?.recent === recent && state?.history === history;
  return { matches: current ? state.matches || EMPTY_MATCHES : EMPTY_MATCHES, message: current ? state.message : '' };
}
