export async function copyReport(text, { clipboard = globalThis.navigator?.clipboard, select } = {}) {
  try {
    if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
    await clipboard.writeText(text);
    return 'copied';
  } catch {
    select?.();
    return 'selected';
  }
}
