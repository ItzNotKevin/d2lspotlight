import { useEffect, useMemo, useRef, useState } from 'react';
import { embeddingText, semanticCandidates, mergeSemantic } from './retrieval.js';

export function useSemanticSearch(resources, lexical, options, enabled, scope) {
  const [state, setState] = useState(null);
  const ticket = useRef(0);
  const key = JSON.stringify([options.query, options.courseId, options.source, options.documents, options.recent, scope]);
  const candidates = useMemo(() => semanticCandidates(resources, options), [resources, key, options.history]);
  useEffect(() => {
    const current = ++ticket.current;
    if (!enabled || options.query.trim().length < 3 || !candidates.length) { setState(null); return; }
    const timer = setTimeout(async () => {
      setState({ key, resources, status: 'Finding related matches locally…', hits: [] });
      try {
        const response = await chrome.runtime.sendMessage({ type: 'semantic-search', scope,
          query: options.query.slice(0, 500), documents: candidates.map((resource) => ({ id: resource.id, text: embeddingText(resource) })) });
        if (ticket.current !== current) return;
        if (!response?.ok) throw new Error(response?.error || 'Local model is unavailable.');
        setState({ key, resources, hits: response.hits || [], status: 'Local semantic search ready.' });
      } catch (error) {
        if (ticket.current === current) setState({ key, resources, hits: [], status: `${error.message} Keyword search remains available.` });
      }
    }, 120);
    return () => { clearTimeout(timer); ticket.current++; };
  }, [candidates, key, enabled]);
  const active = enabled && state?.key === key && state.resources === resources ? state : null;
  return { results: active ? mergeSemantic(lexical, candidates, active.hits) : lexical, status: active?.status || '' };
}
