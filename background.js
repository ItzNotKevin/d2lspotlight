import { createIndexStore } from './src/learn/cache.js';
import { readPiazzaSession } from './src/piazza/session.js';
import { PIAZZA_CACHE_KEY } from './src/piazza/cache.js';

const piazzaStore = createIndexStore(chrome.storage.local, PIAZZA_CACHE_KEY);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'piazza-index' || sender.id !== chrome.runtime.id || !sender.tab) return;
  let onPiazza = false;
  try { onPiazza = new URL(sender.url).origin === 'https://piazza.com' && sender.frameId === 0; } catch {}
  if (['begin', 'commit', 'rename-course'].includes(message.action) && !onPiazza) {
    reply({ ok: false, error: 'Refresh from a signed-in Piazza tab.' });
    return;
  }
  piazzaStore(message.action, message.payload).then(
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
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'learn-index' || sender.id !== chrome.runtime.id || !sender.tab) return;
  let onLearn = false;
  try { onLearn = new URL(sender.url).origin === 'https://learn.uwaterloo.ca'; } catch {}
  if (['begin', 'commit'].includes(message.action) && !onLearn) {
    reply({ ok: false, error: 'Refresh from a signed-in LEARN tab.' });
    return;
  }
  indexStore(message.action, message.payload).then(
    (index) => reply({ ok: true, index }),
    (error) => reply({ ok: false, error: error.message })
  );
  return true;
});

async function toggleSpotlight(tab) {
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["dist/spotlight.js"]
    });
  } catch (error) {
    // Chrome blocks injection into its own pages and some protected sites.
    console.warn("Learn Spotlight cannot open on this page.", error);
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "toggle-spotlight") {
    await toggleSpotlight(tab);
  }
});

chrome.action.onClicked.addListener(toggleSpotlight);
