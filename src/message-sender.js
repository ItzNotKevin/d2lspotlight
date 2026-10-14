export function isSearchSender(sender, extensionId) {
  if (sender.id !== extensionId) return false;
  if (Number.isInteger(sender.tab?.id) && sender.frameId === 0) return true;
  return sender.url === `chrome-extension://${extensionId}/spotlight.html` && (sender.frameId === undefined || sender.frameId === 0);
}
