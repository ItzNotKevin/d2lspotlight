import React, { useEffect, useRef, useState } from 'react';
import { subscribeStorageChanges } from '../extension-context.js';

// Store each disclosure independently so changing one cannot overwrite another.
export function RememberedSection({ sectionId, label, children }) {
  const key = `spotlightSettingsSection:${sectionId}`;
  const [open, setOpen] = useState(false);
  const state = useRef({ open: false, touched: false });
  useEffect(() => {
    let active = true;
    function restore(value) {
      state.current.open = value === true;
      setOpen(state.current.open);
    }
    chrome.storage.local.get(key).then(saved => {
      if (active && !state.current.touched) restore(saved[key]);
    }).catch(() => {});
    const unsubscribe = subscribeStorageChanges((changes, area) => {
      if (active && area === 'local' && changes[key]) {
        state.current.touched = true;
        restore(changes[key].newValue);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [key]);

  return <details className="ls-settings-group" open={open} onToggle={event => {
    if (event.target !== event.currentTarget) return;
    const next = event.currentTarget.open;
    if (next === state.current.open) return;
    state.current = { open: next, touched: true };
    setOpen(next);
    chrome.storage.local.set({ [key]: next }).catch(() => {});
  }}>
    <summary onClick={() => { state.current.touched = true; }}>{label}</summary>
    <div className="ls-settings-group-body">{children}</div>
  </details>;
}
