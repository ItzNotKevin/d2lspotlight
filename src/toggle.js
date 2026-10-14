export async function toggleSpotlight(tab, api = chrome, source = 'command') {
  async function success() {
    try {
      await api.storage?.local.set({ spotlightLaunchStatus: { ok: true, at: Date.now() } });
      await api.action?.setBadgeText({ text: '' });
      await api.action?.setTitle({ title: 'Open Learn Spotlight' });
    } catch {}
  }
  try {
    // onCommand's tab argument is optional. Resolve the focused tab on every
    // invocation, including after a background-worker restart or app switch.
    const target = Number.isInteger(tab?.id) ? tab : (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!Number.isInteger(target?.id)) return false;
    const handled = await api.scripting.executeScript({ target: { tabId: target.id }, world: 'ISOLATED',
      func: source => globalThis.__learnSpotlightShortcut?.invoke?.(source) === true, args: [source] });
    if (handled?.[0]?.result === true) { await success(); return true; }
    await api.scripting.executeScript({ target: { tabId: target.id }, world: 'ISOLATED', files: ['dist/spotlight.js'] });
    await success();
    return true;
  } catch (error) {
    // Internal Chrome pages cannot accept content-script injection.
    console.warn('Learn Spotlight cannot open on this page.', error);
    try {
      const detail = String(error?.message || error).replace(/https?:\/\/[^\s"']+/g, '[page URL]');
      await api.storage?.local.set({ spotlightLaunchStatus: { ok: false, at: Date.now(), error: detail } });
      await api.action?.setBadgeText({ text: '!' });
      await api.action?.setTitle({ title: `Spotlight could not open: ${detail}` });
    } catch {}
    return false;
  }
}
