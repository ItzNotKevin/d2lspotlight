import { mountSpotlight } from './mount.jsx';

const ROOT_ID = 'learn-spotlight-root';
const existing = document.getElementById(ROOT_ID);

const reusable = existing && typeof existing.isSpotlightContextAlive === 'function'
  && existing.isSpotlightContextAlive();
if (reusable) {
  existing.closeSpotlight();
} else {
  existing?.remove();
  const previousFocus = document.activeElement;
  const host = document.createElement('div');
  host.id = ROOT_ID;
  document.documentElement.appendChild(host);
  mountSpotlight(host, () => {
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }, { live: true });
}
