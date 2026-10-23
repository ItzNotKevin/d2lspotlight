import React, { useEffect, useRef, useState } from 'react';
import { copyReport } from './copy-report.js';

export function DiagnosticsReport({ label, value }) {
  const textarea = useRef(null);
  const [status, setStatus] = useState('');
  useEffect(() => { setStatus(''); }, [value]);
  async function copy() {
    const result = await copyReport(value, { select: () => { textarea.current?.focus(); textarea.current?.select(); } });
    setStatus(result === 'copied' ? 'Copied.' : 'Report selected. Use your keyboard to copy it.');
  }
  return <div>
    <div className="ls-connection-actions"><button type="button" className="ls-chip" aria-label={`Copy ${label}`} onClick={copy}>Copy report</button></div>
    <p className="ls-settings-meta" role="status">{status}</p>
    <textarea ref={textarea} className="ls-diagnostics" aria-label={label} readOnly value={value} />
  </div>;
}
