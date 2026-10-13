export function extensionContextAlive() {
  try { return Boolean(globalThis.chrome?.runtime?.id && chrome.runtime.getManifest()); }
  catch { return false; }
}

export function subscribeStorageChanges(listener) {
  const event = chrome.storage.onChanged;
  event.addListener(listener);
  return () => {
    // Chrome invalidates extension APIs when an unpacked extension is reloaded.
    try { event.removeListener(listener); } catch { /* Context already gone. */ }
  };
}
