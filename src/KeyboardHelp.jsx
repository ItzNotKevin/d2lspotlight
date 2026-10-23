import React, { useRef } from 'react';
import { Keyboard } from 'lucide-react';

export function KeyboardHelp() {
  const ref = useRef(null);
  return <details ref={ref} className="ls-keyboard-help" onKeyDown={event => {
    if (event.key === 'Escape' && ref.current?.open) {
      event.preventDefault();
      event.stopPropagation();
      ref.current.open = false;
      ref.current.querySelector('summary').focus();
    }
  }}>
    <summary aria-label="Keyboard shortcuts" title="Keyboard shortcuts"><Keyboard size={15} aria-hidden="true" /></summary>
    <div className="ls-keyboard-help-body">
      <strong>Keyboard shortcuts</strong>
      <dl>
        <div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move through results</dd></div>
        <div><dt><kbd>Enter</kbd></dt><dd>Open selected result</dd></div>
        <div><dt><kbd>Esc</kbd></dt><dd>Clear query, then close</dd></div>
        <div><dt><kbd>Tab</kbd></dt><dd>Move between controls</dd></div>
      </dl>
      <p>Default launch: <kbd>⌘⇧K</kbd> on Mac, <kbd>Ctrl+Shift+K</kbd> on Windows/Linux.</p>
      <p>Change the launch shortcut at <code>chrome://extensions/shortcuts</code>.</p>
    </div>
  </details>;
}
