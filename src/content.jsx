import { mountSpotlight } from './mount.jsx';
import { extensionContextAlive } from './extension-context.js';

const ROOT_ID = 'learn-spotlight-root';
const SHORTCUT_STATE = '__learnSpotlightShortcut';

function toggleOverlay() {
  const existing = document.getElementById(ROOT_ID);

  const reusable = existing && typeof existing.isSpotlightContextAlive === 'function'
    && typeof existing.toggleSpotlight === 'function' && existing.isSpotlightContextAlive();
  if (reusable) {
    existing.toggleSpotlight();
  } else {
    existing?.closeSpotlight?.();
    existing?.remove();
    const previousFocus = document.activeElement;
    const host = document.createElement('div');
    host.id = ROOT_ID;
    document.documentElement.appendChild(host);
    mountSpotlight(host, () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }, { live: true });
  }
}

// Keep a tab-local shortcut after React's exit animation disposes the overlay.
// Chrome commands remain responsible for the first opening on a new page.
const previousShortcut = globalThis[SHORTCUT_STATE];
if (previousShortcut) document.removeEventListener('keydown', previousShortcut.listener, true);
const state = { lastLocalToggle: previousShortcut?.lastLocalToggle ?? -Infinity, listener: null };
state.listener = event => {
  if (!extensionContextAlive()) {
    document.removeEventListener('keydown', state.listener, true);
    return;
  }
  if (event.repeat || !event.shiftKey || !(event.metaKey || event.ctrlKey) || event.altKey || event.code !== 'KeyK') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.lastLocalToggle = performance.now();
  toggleOverlay();
};
globalThis[SHORTCUT_STATE] = state;
document.addEventListener('keydown', state.listener, true);
// Some Chrome versions may deliver both the key event and the command.
if (performance.now() - state.lastLocalToggle >= 200) toggleOverlay();
