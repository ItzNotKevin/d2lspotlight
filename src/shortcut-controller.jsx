import { mountSpotlight } from './mount.jsx';
import { extensionContextAlive } from './extension-context.js';

const ROOT_ID = 'learn-spotlight-root';
const SHORTCUT_STATE = '__learnSpotlightShortcut';

function toggleOverlay() {
  const existing = document.getElementById(ROOT_ID);

  const stalled = existing?.isSpotlightOpen?.() && performance.now() - (existing.spotlightMountedAt || 0) > 1000
    && !existing.shadowRoot?.querySelector('[role="dialog"]');
  const reusable = !stalled && existing && typeof existing.isSpotlightContextAlive === 'function'
    && typeof existing.toggleSpotlight === 'function' && existing.isSpotlightContextAlive();
  if (reusable) {
    existing.toggleSpotlight();
  } else {
    // Invalidated extension callbacks can throw; they must not prevent replacement.
    try { existing?.closeSpotlight?.(); } catch {}
    existing?.remove();
    const previousFocus = document.activeElement;
    const host = document.createElement('div');
    host.id = ROOT_ID;
    host.spotlightMountedAt = performance.now();
    document.documentElement.appendChild(host);
    mountSpotlight(host, () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }, { live: true });
  }
}

export function installShortcut() {
  const previous = globalThis[SHORTCUT_STATE];
  if (previous?.invoke && previous.alive?.()) return previous;
  if (previous?.listener) document.removeEventListener('keydown', previous.listener, true);
  const state = { pendingLocalUntil: 0, listener: null, alive: extensionContextAlive };
  state.invoke = (source = 'command') => {
    if (!extensionContextAlive()) return false;
    if (source === 'command' && performance.now() < state.pendingLocalUntil) {
      state.pendingLocalUntil = 0;
      return true;
    }
    toggleOverlay();
    return true;
  };
  state.listener = event => {
    if (!extensionContextAlive()) {
      document.removeEventListener('keydown', state.listener, true);
      return;
    }
    if (event.repeat || !event.shiftKey || !(event.metaKey || event.ctrlKey) || event.altKey || event.code !== 'KeyK') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.pendingLocalUntil = performance.now() + 2000;
    toggleOverlay();
  };
  globalThis[SHORTCUT_STATE] = state;
  document.addEventListener('keydown', state.listener, true);
  return state;
}
