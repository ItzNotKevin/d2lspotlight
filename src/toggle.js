export async function toggleSpotlight(tab, api = chrome) {
  try {
    // onCommand's tab argument is optional. Resolve the focused tab on every
    // invocation, including after a background-worker restart or app switch.
    const target = Number.isInteger(tab?.id) ? tab : (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!Number.isInteger(target?.id)) return false;
    await api.scripting.executeScript({ target: { tabId: target.id }, world: 'ISOLATED', files: ['dist/spotlight.js'] });
    return true;
  } catch (error) {
    // Internal Chrome pages cannot accept content-script injection.
    console.warn('Learn Spotlight cannot open on this page.', error);
    return false;
  }
}
