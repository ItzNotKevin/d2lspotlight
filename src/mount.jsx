import React from 'react';
import { createRoot } from 'react-dom/client';
import { LearnSpotlight } from './LearnSpotlight.jsx';
import { Spotlight } from './Spotlight.jsx';
import css from './spotlight.css?inline';
import { extensionContextAlive } from './extension-context.js';

export function mountSpotlight(host, onExit = () => {}, { live = false } = {}) {
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  const mount = document.createElement('div');
  shadow.append(style, mount);

  const root = createRoot(mount);
  const Component = live ? LearnSpotlight : Spotlight;
  let open = true;
  let disposed = false;
  const contextCheck = live ? setInterval(() => {
    if (!extensionContextAlive()) destroy();
  }, 500) : null;

  function destroy() {
    if (disposed) return;
    disposed = true;
    clearInterval(contextCheck);
    // Let React finish the exit animation before unmounting its root.
    queueMicrotask(() => {
      root.unmount();
      host.remove();
      onExit();
    });
  }

  function close() {
    if (!open || disposed) return;
    if (live && !extensionContextAlive()) { destroy(); return; }
    open = false;
    root.render(<Component isOpen={false} handleClose={close} onExited={destroy} />);
  }

  host.closeSpotlight = close;
  host.isSpotlightContextAlive = () => !disposed && (!live || extensionContextAlive());
  root.render(<Component isOpen handleClose={close} onExited={destroy} />);
  return { close };
}
