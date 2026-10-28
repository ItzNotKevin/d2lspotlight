import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { createServer } from 'vite';

// Exercise the actual hooks with deferred extension replies, including debounce
// and query changes. Vite loads their JSX module dependencies as in the app.
test('async search stays pending until the current query settles and ignores stale replies', async t => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  t.after(() => server.close());
  const { usePdfSearch } = await server.ssrLoadModule('/src/search/pdf/usePdfSearch.jsx');
  const { useSemanticSearch } = await server.ssrLoadModule('/src/search/semantic/useSemanticSearch.jsx');
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const originals = Object.fromEntries(['window', 'document', 'chrome', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  t.after(async () => {
    if (root) await act(() => root.unmount());
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const requests = [];
  globalThis.chrome = { runtime: { sendMessage(message) {
    if (message.type === 'semantic-cancel') return Promise.resolve();
    return new Promise((resolve, reject) => requests.push({ message, resolve, reject }));
  } } };
  const resources = [{ id: 'notes', source: 'LEARN' }], filters = {}, history = {};
  let observed;
  function Harness({ query, enabled = true }) {
    observed = {
      pdf: usePdfSearch({ isOpen: enabled, query, filters, resources, revision: 0, history }),
      semantic: useSemanticSearch({ isOpen: true, enabled, query, resources, history })
    };
    return null;
  }
  root = createRoot(document.getElementById('root'));
  const render = async props => { await act(() => root.render(React.createElement(Harness, props))); };
  const debounce = async () => { await act(() => new Promise(resolve => setTimeout(resolve, 160))); };
  const settle = async (query, fail = false) => {
    await act(async () => {
      for (const request of requests.filter(request => request.message.query === query)) {
        if (fail) request.reject(new Error('Offline'));
        else request.resolve({ ok: true, matches: [], passageMatches: [], total: 0, indexed: 0 });
      }
    });
  };
  await render({ query: 'permutation' });
  assert.equal(observed.pdf.pending, true);
  assert.equal(observed.semantic.pending, true);
  await debounce();
  await render({ query: 'probability' });
  await settle('permutation');
  assert.equal(observed.pdf.pending, true, 'an old response must not finish a newer search');
  assert.equal(observed.semantic.pending, true);
  await debounce();
  await act(async () => {
    requests.find(request => request.message.query === 'probability' && request.message.type === 'pdf-index').resolve({ ok: true, matches: [] });
  });
  assert.equal(observed.pdf.pending, false);
  assert.equal(observed.semantic.pending, true, 'meaning search can still be running after document search finishes');
  await settle('probability');
  assert.equal(observed.pdf.pending, false, 'an empty successful search is complete');
  assert.equal(observed.semantic.pending, false);
  await render({ query: 'offline' });
  await debounce();
  await settle('offline', true);
  assert.equal(observed.pdf.pending, false, 'errors must not leave the search loading forever');
  assert.equal(observed.semantic.pending, false);
  assert.match(observed.pdf.message, /Offline/);
  await render({ query: 'a' });
  assert.equal(observed.pdf.pending, false);
  assert.equal(observed.semantic.pending, false);
  await render({ query: 'disabled', enabled: false });
  assert.equal(observed.pdf.pending, false);
  assert.equal(observed.semantic.pending, false);
});
