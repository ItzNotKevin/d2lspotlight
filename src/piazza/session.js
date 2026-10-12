// Serialized by executeScript; keep this function self-contained.
export function readPageToken() {
  if (location.origin !== 'https://piazza.com') return '';
  const token = window.CSRF_TOKEN;
  return typeof token === 'string' && token.length <= 8192 && !/[\r\n]/.test(token) ? token : '';
}

export async function readPiazzaSession(sender, extensionId, executeScript) {
  if (sender.id !== extensionId || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0) return { ok: false };
  try {
    if (new URL(sender.url).origin !== 'https://piazza.com') return { ok: false };
    const results = await executeScript({
      target: { tabId: sender.tab.id, frameIds: [0] },
      world: 'MAIN',
      func: readPageToken
    });
    const token = results[0]?.result;
    return { ok: true, token: typeof token === 'string' ? token : '' };
  } catch {
    return { ok: false };
  }
}
