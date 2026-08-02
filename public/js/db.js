/* ============================================
   AGOGE - IndexedDB (cache hors-ligne + sync)
   ============================================ */
const IDB = (() => {
  const DB_NAME = 'agoge-db';
  const DB_VERSION = 1;
  const STORES = ['cache', 'syncQueue', 'foodCache', 'sessionCache'];

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            const os = db.createObjectStore(store, { keyPath: 'key' });
            if (store !== 'cache') os.createIndex('time', 'time', { unique: false });
          }
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function put(storeName, obj) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(obj);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function get(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function remove(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function clear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  // Cache data with key
  async function cacheSet(key, data) {
    await put('cache', { key, data, time: Date.now() });
  }

  async function cacheGet(key) {
    const item = await get('cache', key);
    return item ? item.data : null;
  }

  // Sync queue
  async function enqueue(action, payload) {
    const key = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await put('syncQueue', { key, action, payload, time: Date.now() });
  }

  async function getQueue() {
    const all = await getAll('syncQueue');
    return all.sort((a, b) => a.time - b.time);
  }

  async function removeFromQueue(key) {
    await remove('syncQueue', key);
  }

  // Food cache (recent searches from OpenFoodFacts)
  async function cacheFood(query, results) {
    await put('foodCache', { key: query.toLowerCase(), data: results, time: Date.now() });
  }

  async function getCachedFood(query) {
    return (await get('foodCache', query.toLowerCase()))?.data || null;
  }

  return {
    cacheSet,
    cacheGet,
    enqueue,
    getQueue,
    removeFromQueue,
    clearQueue: () => clear('syncQueue'),
    cacheFood,
    getCachedFood
  };
})();

window.IDB = IDB;

