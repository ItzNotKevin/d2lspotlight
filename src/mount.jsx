import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppleSpotlight } from './AppleSpotlight.jsx';
import css from './spotlight.css?inline';

export function mountSpotlight(host, onExit = () => {}) {
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  const mount = document.createElement('div');
  shadow.append(style, mount);

  const root = createRoot(mount);
  let open = true;
  let disposed = false;

  function destroy() {
    if (disposed) return;
    disposed = true;
    // Let React finish the exit animation before unmounting its root.
    queueMicrotask(() => {
      root.unmount();
      host.remove();
      onExit();
    });
  }

  function close() {
    if (!open || disposed) return;
    open = false;
    root.render(<AppleSpotlight isOpen={false} handleClose={close} onExited={destroy} />);
  }

  host.closeSpotlight = close;
  root.render(<AppleSpotlight isOpen handleClose={close} onExited={destroy} />);
  return { close };
}
