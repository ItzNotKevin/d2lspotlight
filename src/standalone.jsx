import { mountSpotlight } from './mount.jsx';

const host = document.createElement('div');
host.id = 'learn-spotlight-root';
document.body.append(host);
mountSpotlight(host, () => window.close(), { live: true });
const style = document.createElement('style');
style.textContent = '.ls-backdrop{--ls-top-space:0;--ls-bottom-space:0;padding:10px;background:#f8f6f0;backdrop-filter:none;align-items:stretch}.ls-launcher{width:100%;height:100%}.ls-panel{height:100%;max-height:none;border:0;box-shadow:none}';
host.shadowRoot.append(style);
