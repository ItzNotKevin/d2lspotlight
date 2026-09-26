import { mountSpotlight } from './mount.jsx';

const ROOT_ID = 'learn-spotlight-root';
const existing = document.getElementById(ROOT_ID);

if (existing) {
  if (typeof existing.closeSpotlight === 'function') existing.closeSpotlight();
  else existing.remove();
} else {
  const previousFocus = document.activeElement;
  const host = document.createElement('div');
  host.id = ROOT_ID;
  document.documentElement.appendChild(host);
  mountSpotlight(host, () => {
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  });
}
