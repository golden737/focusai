// ── FocusAI Storage ───────────────────────────────────────────────────────────
// Capa de abstracción de almacenamiento.
// Si Supabase está configurado → guarda en la nube.
// Si no → guarda en IndexedDB local (fallback).

window.FlowStorage = (() => {

  // ── IndexedDB (fallback local) ────────────────────────────────────────────
  let _db = null;
  const DB_NAME    = 'focusai';
  const DB_VERSION = 1;

  async function _initIDB() {
    if (_db) return _db;
    _db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        FlowSchema.stores.forEach((store) => {
          if (!db.objectStoreNames.contains(store.name)) {
            const os = db.createObjectStore(store.name, { keyPath: store.keyPath || 'id', autoIncrement: store.autoIncrement || false });
            (store.indexes || []).forEach((idx) => {
              os.createIndex(idx.name, idx.keyPath, { unique: idx.unique || false, multiEntry: idx.multiEntry || false });
            });
          }
        });
        if (window.FlowMigrations) FlowMigrations.run(db, e.oldVersion, e.newVersion);
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
    return _db;
  }

  function _promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function _tx(storeName, mode = 'readonly') {
    if (!_db) throw new Error('IDB no inicializada');
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  // ── Mapa de tablas IDB → Supabase ─────────────────────────────────────────
  const TABLE_MAP = {
    'tasks':      'tasks',
    'habits':     'habits',
    'habit_logs': 'habit_logs',
    'goals':      'goals',
    'projects':   'projects',
    'time_logs':  'time_logs',
    'journal':    'journal',
    'events':     null, // solo local por ahora
    'focus_logs': null, // solo local por ahora
    'meta':       null, // solo local
  };

  function _useSupabase(storeName) {
    return FlowSupabase.isConfigured() && TABLE_MAP[storeName] !== null && TABLE_MAP[storeName] !== undefined;
  }

  // ── API pública ───────────────────────────────────────────────────────────

  async function init() {
    await _initIDB();
  }

  async function getAll(storeName) {
    if (_useSupabase(storeName)) {
      const table = TABLE_MAP[storeName];
      return FlowSupabase.getAll(table);
    }
    await _initIDB();
    const store = _tx(storeName, 'readonly');
    return _promisify(store.getAll());
  }

  async function get(storeName, key) {
    if (_useSupabase(storeName)) {
      const sb   = FlowSupabase.getClient();
      const user = await FlowSupabase.getUser();
      if (!sb || !user) return null;
      const table = TABLE_MAP[storeName];
      const { data } = await sb.from(table).select('*').eq('id', key).single();
      return data;
    }
    await _initIDB();
    const store = _tx(storeName, 'readonly');
    return _promisify(store.get(key));
  }

  async function save(storeName, record) {
    if (_useSupabase(storeName)) {
      const table = TABLE_MAP[storeName];
      return FlowSupabase.save(table, record);
    }
    await _initIDB();
    const store = _tx(storeName, 'readwrite');
    return _promisify(store.put(record));
  }

  async function saveMany(storeName, records) {
    if (_useSupabase(storeName)) {
      const results = [];
      for (const r of records) {
        const saved = await save(storeName, r);
        results.push(saved);
      }
      return results;
    }
    await _initIDB();
    return new Promise((resolve, reject) => {
      const tx    = _db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let count   = 0;
      if (!records.length) { resolve(0); return; }
      records.forEach((r) => {
        const req = store.put(r);
        req.onsuccess = () => { count++; if (count === records.length) resolve(count); };
        req.onerror   = (e) => reject(e.target.error);
      });
    });
  }

  async function remove(storeName, key) {
    if (_useSupabase(storeName)) {
      const table = TABLE_MAP[storeName];
      return FlowSupabase.remove(table, key);
    }
    await _initIDB();
    const store = _tx(storeName, 'readwrite');
    return _promisify(store.delete(key));
  }

  async function removeMany(storeName, keys) {
    for (const key of keys) await remove(storeName, key);
  }

  async function clear(storeName) {
    await _initIDB();
    const store = _tx(storeName, 'readwrite');
    return _promisify(store.clear());
  }

  async function count(storeName) {
    await _initIDB();
    const store = _tx(storeName, 'readonly');
    return _promisify(store.count());
  }

  async function getByIndex(storeName, indexName, value) {
    await _initIDB();
    const store = _tx(storeName, 'readonly');
    const index = store.index(indexName);
    return _promisify(index.getAll(IDBKeyRange.only(value)));
  }

  async function getByDateRange(storeName, indexName, start, end) {
    await _initIDB();
    const store = _tx(storeName, 'readonly');
    const index = store.index(indexName);
    const range = IDBKeyRange.bound(
      start instanceof Date ? start.toISOString() : start,
      end   instanceof Date ? end.toISOString()   : end
    );
    return _promisify(index.getAll(range));
  }

  async function query(storeName, predicate, limit = Infinity) {
    const all = await getAll(storeName);
    return all.filter(predicate).slice(0, limit);
  }

  // ── Meta (siempre local) ──────────────────────────────────────────────────

  async function getMeta(key) {
    return get('meta', key);
  }

  async function setMeta(key, value) {
    return save('meta', { key, value, updatedAt: new Date().toISOString() });
  }

  async function removeMeta(key) {
    return remove('meta', key);
  }

  // ── Export / Import ───────────────────────────────────────────────────────

  async function exportAll() {
    const stores = FlowSchema.stores.map((s) => s.name);
    const data   = {};
    await Promise.all(stores.map(async (name) => {
      try { data[name] = await getAll(name); } catch { data[name] = []; }
    }));
    return { version: DB_VERSION, exportedAt: new Date().toISOString(), app: 'FocusAI', data };
  }

  async function importAll(exported) {
    if (!exported?.data) throw new Error('Formato inválido');
    for (const [storeName, records] of Object.entries(exported.data)) {
      if (!Array.isArray(records)) continue;
      try {
        await clear(storeName);
        if (records.length > 0) await saveMany(storeName, records);
      } catch (e) {
        console.warn(`[Storage] Error importando ${storeName}:`, e);
      }
    }
  }

  async function exportCSV(storeName) {
    const records = await getAll(storeName);
    if (!records.length) return '';
    const headers = Object.keys(records[0]);
    const rows    = records.map((r) =>
      headers.map((h) => {
        const val = r[h];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  function generateId(prefix = '') {
    const ts     = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}${ts}${random}`;
  }

  async function estimateSize() {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota, usageMB: (usage / 1024 / 1024).toFixed(2), quotaMB: (quota / 1024 / 1024).toFixed(0) };
  }

  async function requestPersistence() {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  }

  return {
    init,
    get, getAll, getByIndex, getByDateRange, query,
    save, saveMany,
    remove, removeMany, clear, count,
    getMeta, setMeta, removeMeta,
    exportAll, importAll, exportCSV,
    generateId, estimateSize, requestPersistence,
  };

})();
