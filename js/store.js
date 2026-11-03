// Garde les données importées dans le navigateur (IndexedDB), pour ne pas devoir
// redéposer le zip à chaque visite. Elles ne quittent jamais cet appareil.
const DB_NAME = 'spotify-stats', STORE = 'data', KEY = 'history';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function run(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { resolve(req?.result); db.close(); };
    tx.onerror = () => { reject(tx.error); db.close(); };
  }));
}

export async function loadSaved() {
  try { return (await run('readonly', s => s.get(KEY))) || null; } catch { return null; }
}
export async function save(data) {
  try { await run('readwrite', s => s.put(data, KEY)); return true; } catch { return false; }
}
export async function clearSaved() {
  try { await run('readwrite', s => s.delete(KEY)); } catch { /* rien à effacer */ }
}
