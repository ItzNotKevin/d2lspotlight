import { mountSpotlight } from './mount.jsx';

let openInstance = null;

function openPreview() {
  if (openInstance) return;
  const host = document.createElement('div');
  document.body.appendChild(host);
  openInstance = mountSpotlight(host, () => { openInstance = null; });
}

document.getElementById('reopen').addEventListener('click', openPreview);
openPreview();
