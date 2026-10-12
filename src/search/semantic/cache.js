import { CACHE_DATABASE } from './config.js';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function openEmbeddingCache() {
  const request = indexedDB.open(CACHE_DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('vectors', { keyPath: 'key' });
  const db = await requestResult(request);
  async function write(operation) {
    const transaction = db.transaction('vectors', 'readwrite');
    const finished = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('Embedding storage interrupted.'));
      transaction.onerror = () => reject(transaction.error);
    });
    operation(transaction.objectStore('vectors'));
    await finished;
  }
  return {
    close: () => db.close(),
    get: (key) => requestResult(db.transaction('vectors').objectStore('vectors').get(key)),
    put: (entry) => write((store) => store.put(entry)),
    clear: () => write((store) => store.clear()),
    prune: (keep) => write((store) => {
      const cursor = store.openKeyCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        if (!keep.has(cursor.result.key)) store.delete(cursor.result.key);
        cursor.result.continue();
      };
    })
  };
}
