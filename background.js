import { createIndexStore } from './src/learn/cache.js';
import { readPiazzaSession } from './src/piazza/session.js';
import { PIAZZA_CACHE_KEY } from './src/piazza/cache.js';
import { clearSemanticCache, registerSemanticSearch } from './src/search/semantic/background.js';
import { clearPdfCache, registerPdfSearch } from './src/search/pdf/background.js';
import { toggleSpotlight } from './src/toggle.js';
import { registerCourseSites } from './src/sites/background.js';
import { registerLearnSession } from './src/learn/session.js';
import { isSearchSender } from './src/message-sender.js';

registerSemanticSearch();
registerPdfSearch();

async function updateIndex(store, action, payload) {
  const previous = ['begin', 'clear'].includes(action) ? await store('read') : null;
  const index = await store(action, payload);
  if (action === 'clear' || (action === 'begin' && previous.accountId !== index.accountId)) await clearSemanticCache();
  if (store === indexStore && (action === 'clear' || (action === 'begin' && previous.accountId !== index.accountId))) await clearPdfCache();
  return index;
}

const piazzaStore = createIndexStore(chrome.storage.local, PIAZZA_CACHE_KEY);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'piazza-index' || !isSearchSender(sender, chrome.runtime.id)) return;
  let onPiazza = false;
  try { onPiazza = new URL(sender.url).origin === 'https://piazza.com' && sender.frameId === 0; } catch {}
  if (['begin', 'commit', 'rename-course'].includes(message.action) && !onPiazza) {
    reply({ ok: false, error: 'Refresh from a signed-in Piazza tab.' });
    return;
  }
  updateIndex(piazzaStore, message.action, message.payload).then(
    (index) => reply({ ok: true, index }),
    (error) => reply({ ok: false, error: /quota/i.test(error.message)
      ? 'Local storage is full. Clear saved data for a source before refreshing.'
      : 'Piazza index changed or could not be saved. Try refreshing.' })
  );
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'piazza-session') return;
  readPiazzaSession(sender, chrome.runtime.id, (options) => chrome.scripting.executeScript(options)).then(reply);
  return true;
});

const indexStore = createIndexStore(chrome.storage.local);
registerLearnSession(indexStore);
registerCourseSites(indexStore);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'learn-index' || !isSearchSender(sender, chrome.runtime.id)) return;
  let onLearn = false;
  try { onLearn = new URL(sender.url).origin === 'https://learn.uwaterloo.ca'; } catch {}
  if (['begin', 'commit', 'label-notes', 'discover-sites', 'begin-site', 'commit-site', 'remove-site'].includes(message.action) && !onLearn) {
    reply({ ok: false, error: 'Refresh from a signed-in LEARN tab.' });
    return;
  }
  if (message.action === 'clear-pdf') {
    clearPdfCache().then(() => reply({ ok: true, index: null }), () => reply({ ok: false, error: 'Could not clear PDF text.' }));
    return true;
  }
  updateIndex(indexStore, message.action, message.payload).then(
    (index) => reply({ ok: true, index }),
    (error) => reply({ ok: false, error: error.message })
  );
  return true;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "toggle-spotlight") {
    await toggleSpotlight(tab);
  }
});

chrome.action.onClicked.addListener(tab => toggleSpotlight(tab, chrome, 'toolbar'));
