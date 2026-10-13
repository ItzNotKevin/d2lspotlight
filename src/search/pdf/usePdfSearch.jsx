import { useEffect, useState } from 'react';
import { pdfMessage } from './usePdfIndex.jsx';

const EMPTY = [];
export function usePdfSearch({ isOpen, query, filters, resources, revision, history }) {
  const [state, setState] = useState(null);
  const key = JSON.stringify([query, filters, revision]);
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) { setState(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      pdfMessage('search', { query, filters }).then(response => {
        if (active) setState({ key, resources, history, matches: response.matches, message: '' });
      }, error => { if (active) setState({ key, resources, history, matches: EMPTY, message: error.message }); });
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [isOpen, key, resources, history]);
  const current = isOpen && state?.key === key && state.resources === resources && state.history === history;
  return { matches: current ? state.matches : EMPTY, message: current ? state.message : '' };
}

