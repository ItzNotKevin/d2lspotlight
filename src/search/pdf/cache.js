const DATABASE = 'spotlight-pdf-v1';
export async function openPdfCache() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  function run(mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', mode);
      const request = operation(transaction.objectStore('documents'));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('PDF cache unavailable.'));
    });
  }
  return {
    all: () => run('readonly', store => store.getAll()),
    put: document => run('readwrite', store => store.put(document)),
    remove: ids => run('readwrite', store => { for (const id of ids) store.delete(id); }),
    clear: () => run('readwrite', store => store.clear()), close: () => db.close()
  };
}
