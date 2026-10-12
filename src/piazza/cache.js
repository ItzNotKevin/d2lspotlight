export const PIAZZA_CACHE_KEY = 'piazzaSpotlightIndexV1';

export async function piazzaIndexMessage(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type: 'piazza-index', action, payload });
  if (!response?.ok) throw new Error(response?.error || 'Cannot access saved Piazza posts. Reload the extension.');
  return response.index;
}
