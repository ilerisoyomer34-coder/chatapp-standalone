// Çevrimdışı açılış için küçük IndexedDB önbelleği (anahtar → değer).
// Sohbet listesi, profiller ve son mesajlar burada tutulur; çıkışta tamamen silinir.
const DB_NAME = 'chatapp-cache';
const STORE = 'kv';
let dbPromise = null;

function open() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

const memory = new Map();

export async function cacheGet(key) {
  if (memory.has(key)) return memory.get(key);
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => {
        if (req.result !== undefined) memory.set(key, req.result);
        resolve(req.result);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

const pending = new Map();
let timer = null;

// Yazmalar 500 ms toplanıp tek işlemde yapılır.
export function cacheSet(key, value) {
  memory.set(key, value);
  pending.set(key, value);
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}

async function flush() {
  const db = await open();
  if (!db || !pending.size) return;
  const entries = [...pending.entries()];
  pending.clear();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [k, v] of entries) {
      if (v === undefined || v === null) store.delete(k);
      else store.put(v, k);
    }
  } catch (err) {
    console.warn('[ChatApp] önbellek yazılamadı', err);
  }
}

export async function cacheClear() {
  memory.clear();
  pending.clear();
  clearTimeout(timer);
  const db = await open();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    } catch {
      resolve();
    }
  });
}
