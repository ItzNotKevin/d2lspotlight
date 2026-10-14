import { createLearnClient, LEARN_ORIGIN } from './client.js';
import { isSearchSender } from '../message-sender.js';

// The extension's host permission allows the session check from any tab.
// Never send session cookies to the page on which Spotlight was opened.
export async function verifyLearnSession({ fetchImpl = fetch, signal } = {}) {
  const client = createLearnClient({ signal, fetchImpl: (path, options) =>
    fetchImpl(new URL(path, LEARN_ORIGIN).href, { ...options, credentials: 'include' }) });
  const session = await client.connect();
  return { accountId: session.accountId, courseIds: session.courses.map(course => course.id) };
}

export function registerLearnSession(store, api = chrome, verify = verifyLearnSession) {
  api.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'learn-session' || !isSearchSender(sender, api.runtime.id)) return;
    (async () => {
      const session = await verify();
      const saved = await store('read');
      // Checking another tab must not invalidate a same-account refresh in progress.
      const index = saved.accountId === session.accountId ? saved : await store('begin', { accountId: session.accountId });
      return { ok: true, index, courseIds: session.courseIds };
    })().then(reply, error => reply({ ok: false, error: error.message || 'Could not verify your LEARN session. Open LEARN and sign in, then retry.' }));
    return true;
  });
}
