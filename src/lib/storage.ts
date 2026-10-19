/** localStorage with JSON + a namespace; never throws. */
export const LS = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem('encore.' + k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem('encore.' + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k: string) { try { localStorage.removeItem('encore.' + k); } catch { /* ignore */ } },
};

/** Tiny IndexedDB key-value store (for the listening history, which is too big for localStorage). */
let dbp: Promise<IDBDatabase> | null = null;
function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('encore', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
export const IDB = {
  async get<T>(k: string): Promise<T | undefined> {
    try {
      const db = await open();
      return await new Promise<T | undefined>((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result as T); r.onerror = () => rej(r.error); });
    } catch { return undefined; }
  },
  async set(k: string, v: unknown) {
    const db = await open();
    await new Promise<void>((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  },
  async del(k: string) {
    try { const db = await open(); await new Promise<void>((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(); t.onerror = () => res(); }); } catch { /* ignore */ }
  },
};
