import React, { useEffect, useRef, useState } from 'react';

export function useCourseSites({ index, isOpen, verifiedGeneration }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const request = useRef(null);
  const consentButton = useRef(null);
  const [deferred, setDeferred] = useState(() => new Set());
  useEffect(() => {
    const progress = message => {
      if (message?.type === 'course-site-progress' && message.requestId === request.current) {
        setMessage(`Reading course website page ${message.page} of up to 12…`);
      }
    };
    chrome.runtime.onMessage.addListener(progress);
    return () => chrome.runtime.onMessage.removeListener(progress);
  }, []);
  const onLearn = location.origin === 'https://learn.uwaterloo.ca';
  const homeId = onLearn ? location.pathname.match(/^\/d2l\/home\/(\d+)\/?$/)?.[1] : null;
  const verified = Boolean(index.accountId && index.generation && verifiedGeneration === index.generation);
  const identity = { accountId: index.accountId, generation: index.generation };
  function previouslyDeferred(key) {
    try { return Boolean(sessionStorage.getItem(`learnSpotlightSiteConsent:${key}`)); }
    catch { return false; }
  }
  // Treat the two supported host aliases as one consent choice for this course.
  const consentKey = site => JSON.stringify([index.accountId, site.courseId, new URL(site.root).pathname]);
  const promptSite = isOpen && onLearn && homeId && verified && !busy
    ? (index.courseSites || []).find(site => site.courseId === homeId && !site.enabled && !deferred.has(consentKey(site))
      && !previouslyDeferred(consentKey(site))) : null;
  const promptKey = promptSite ? consentKey(promptSite) : null;
  useEffect(() => {
    if (promptKey) consentButton.current?.focus();
  }, [promptKey]);
  function deferSite(site) {
    const key = consentKey(site);
    try { sessionStorage.setItem(`learnSpotlightSiteConsent:${key}`, 'later'); } catch {}
    setDeferred(previous => new Set([...previous, key]));
  }

  async function send(action, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type: 'course-site', action, ...identity, ...payload });
    if (!response?.ok) throw new Error(response?.error || 'Course website unavailable.');
    return response;
  }
  useEffect(() => {
    if (!isOpen || !homeId || !verified) return;
    let active = true;
    const discover = () => send('discover').catch(error => { if (active) setMessage(error.message); });
    discover();
    // D2L widgets can finish loading after course metadata has arrived.
    const retry = setTimeout(discover, 2000);
    return () => { active = false; clearTimeout(retry); };
  }, [isOpen, homeId, index.accountId, index.generation, verifiedGeneration]);
  useEffect(() => {
    setBusy(false);
    return () => {
    if (request.current) {
      try { chrome.runtime.sendMessage({ type: 'course-site', action: 'cancel', requestId: request.current }).catch(() => {}); } catch {}
      request.current = null;
    }
    };
  }, [isOpen, index.accountId, index.generation]);

  async function run(action, site) {
    const id = crypto.randomUUID();
    request.current = id;
    setBusy(true);
    setMessage(action === 'remove' ? 'Removing saved website pages…' : 'Waiting for website access; check Chrome for a permission prompt…');
    try {
      const result = await send(action, { requestId: id, courseId: site.courseId, code: site.code, url: site.url });
      if (request.current !== id) return;
      const saved = result.index.courseSites?.find(candidate => candidate.root === site.root && candidate.courseId === site.courseId);
      setMessage(action === 'remove' ? 'Website pages removed.' : `${saved?.pageCount || 0} website pages indexed.${saved?.partial ? ' Partial coverage; some pages failed or reached a limit.' : ''}`);
    } catch (error) { if (request.current === id) setMessage(error.message); }
    finally { if (request.current === id) { request.current = null; setBusy(false); } }
  }

  async function add() {
    try { await send('add', { url: manualUrl }); setManualUrl(''); setMessage('Course website added. Click Include website to index its pages.'); }
    catch (error) { setMessage(error.message); }
  }

  const prompt = promptSite && <section className="ls-site-consent" role="region" aria-label="Course website access" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); deferSite(promptSite); }
    }}>
      <strong>Include {promptSite.code}’s course website?</strong>
      <p>Search its public pages for information such as office hours, schedules and course policies.</p>
      <p className="ls-site-consent-url">{promptSite.url}</p>
      <div className="ls-connection-actions">
        <button ref={consentButton} className="ls-chip is-active" onClick={() => {
          // Send the request during this click so Chrome can show its permission dialog.
          run('include', promptSite);
          deferSite(promptSite);
        }}>Allow and index</button>
        <button className="ls-chip" onClick={() => deferSite(promptSite)}>Not now</button>
      </div>
    </section>;
  const status = <div className="ls-site-status">
    {message && <p role="status">{message}</p>}
    {busy && <button className="ls-chip" onClick={() => {
      const id = request.current;
      if (!id) return;
      chrome.runtime.sendMessage({ type: 'course-site', action: 'cancel', requestId: id }).catch(() => {});
      setMessage('Cancelling website indexing…');
    }}>Cancel website indexing</button>}
  </div>;
  const settings = <div className="ls-connection">
    {(index.courseSites || []).map(site => <div className="ls-connection-actions" key={`${site.courseId}:${site.root}`}>
      <span>{site.code} · Course website{site.enabled ? ` · ${site.pageCount || 0} pages${site.partial ? ' · partial' : ''}` : ' detected'}</span>
      <a className="ls-chip" href={site.url} target="_blank" rel="noreferrer">Open website</a>
      {onLearn && <button className="ls-chip" disabled={busy || !verified} onClick={() => run('include', site)}>{site.enabled ? 'Allow / refresh website' : 'Include website'}</button>}
      {onLearn && <button className="ls-chip" disabled={busy || !verified} onClick={() => run('remove', site)}>{site.enabled ? 'Remove website data' : 'Dismiss website'}</button>}
    </div>)}
    {homeId && <div className="ls-connection-actions">
      <input className="ls-course-filter" aria-label="External course website URL" type="url" placeholder="Course website URL (if not detected)" value={manualUrl} onChange={event => setManualUrl(event.target.value)} />
      <button className="ls-chip" disabled={!manualUrl.trim() || !verified || busy} onClick={add}>Add course website</button>
    </div>}
  </div>;
  return { prompt, status, settings };
}
