let creating;
export async function semanticRequest(message, sender, api) {
  if (sender.id !== api.runtime.id || !sender.tab || sender.frameId !== 0) throw new Error('Invalid search caller.');
  if (typeof message.scope !== 'string' || message.scope.length > 1000 || typeof message.query !== 'string' || message.query.length > 500 || !Array.isArray(message.documents)
    || message.documents.length > 10000 || message.documents.some((doc) => typeof doc.id !== 'string' || typeof doc.text !== 'string' || doc.text.length > 2000)) throw new Error('Search request is too large.');
  const url = api.runtime.getURL('semantic.html');
  const existing = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (!existing.length) {
    creating ||= api.offscreen.createDocument({ url: 'semantic.html', reasons: ['WORKERS'], justification: 'Run the bundled local semantic model outside webpage content scripts.' }).finally(() => { creating = undefined; });
    await creating;
  }
  // Module scripts can still be initializing when createDocument resolves.
  for (let attempt = 0; attempt < 10; attempt++) {
    try { return await api.runtime.sendMessage({ ...message, type: 'semantic-engine' }); }
    catch (error) {
      if (attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
