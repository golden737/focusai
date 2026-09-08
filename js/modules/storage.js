// ── FocusAI Storage ──────────────────────────────────────────────────────────
// Wrapper sobre IndexedDB. Todos los módulos usan este API para persistir datos.
// Los stores se definen en data/schema.js y las migraciones en data/migrations.js.

window.FlowStorage = (() => {

  let _db = null;
  const DB_NAME    = 'focusai';
  const DB_VERSION = 1;

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    if (_db) return _db;
    _db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Crear stores definidos en schema.js
        FlowSchema.stores.forEach((store) => {
          if (!db.objectStoreNames.contains(store.name)) {
            const os = db.createObjectStore(store.name, { keyPath: store.keyPath || 'id', autoIncrement: store.autoIncrement || false });
            (store.indexes || []).forEach((idx) => {
              os.createIndex(idx.name, idx.keyPath, { unique: idx.unique || false, multiEntry: idx.multiEntry || false });
            });
          }
        });
        // Ejecutar migraciones si existen
        if (window.FlowMigrations) FlowMigrations.run(db, e.oldVersion, e.newVersion);
      };

      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
    return _db;
  }

  // ── Helpers de transacción ────────────────────────────────────────────────

  function _tx(storeName, mode = 'readonly') {
    if (!_db) throw new Error('FlowStorage: DB no inicializada. Llama init() primero.');
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function _promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── CRUD genérico ─────────────────────────────────────────────────────────

  /** Obtener un registro por su key primaria */
  async function get(storeName, key) {
    const store = _tx(storeName, 'readonly');
    return _promisify(store.get(key));
  }

  /** Obtener todos los registros de un store */
  async function getAll(storeName, indexName, query) {
    const store = _tx(storeName, 'readonly');
    const source = indexName ? store.index(indexName) : store;
    return _promisify(source.getAll(query));
  }

  /** Obtener registros usando un índice con rango */
  async function getByIndex(storeName, indexName, value) {
    const store = _tx(storeName, 'readonly');
    const index = store.index(indexName);
    return _promisify(index.getAll(IDBKeyRange.only(value)));
  }

  /** Insertar o reemplazar un registro (put = upsert) */
  async function save(storeName, record) {
    const store = _tx(storeName, 'readwrite');
    return _promisify(store.put(record));
  }

  /** Insertar múltiples registros en una sola transacción */
  async function saveMany(storeName, records) {
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let count = 0;
      records.forEach((r) => {
        const req = store.put(r);
        req.onsuccess = () => { count++; if (count === records.length) resolve(count); };
        req.onerror   = (e) => reject(e.target.error);
      });
      tx.onerror = (e) => reject(e.target.error);
      if (records.length === 0) resolve(0);
    });
  }

  /** Eliminar un registro por su key */
  async function remove(storeName, key) {
    const store = _tx(storeName, 'readwrite');
    return _promisify(store.delete(key));
  }

  /** Eliminar múltiples registros */
  async function removeMany(storeName, keys) {
    return new Promise((resolve, reject) => {
      const tx    = _db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      keys.forEach((k) => store.delete(k));
      tx.oncomplete = () => resolve(keys.length);
      tx.onerror    = (e) => reject(e.target.error);
    });
  }

  /** Limpiar completamente un store */
  async function clear(storeName) {
    const store = _tx(storeName, 'readwrite');
    return _promisify(store.clear());
  }

  /** Contar registros en un store */
  async function count(storeName, indexName, query) {
    const store  = _tx(storeName, 'readonly');
    const source = indexName ? store.index(indexName) : store;
    return _promisify(source.count(query));
  }

  // ── Consultas avanzadas con cursor ────────────────────────────────────────

  /**
   * Iterar con cursor y un predicado JS (para filtros complejos).
   * Más lento que getAll pero permite filtrar sin índice.
   */
  async function query(storeName, predicate, limit = Infinity) {
    return new Promise((resolve, reject) => {
      const store   = _tx(storeName, 'readonly');
      const results = [];
      const req     = store.openCursor();

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor || results.length >= limit) { resolve(results); return; }
        if (predicate(cursor.value)) results.push(cursor.value);
        cursor.continue();
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtener registros en un rango de fechas usando un índice de fecha.
   */
  async function getByDateRange(storeName, indexName, start, end) {
    const store = _tx(storeName, 'readonly');
    const index = store.index(indexName);
    const range = IDBKeyRange.bound(
      start instanceof Date ? start.toISOString() : start,
      end   instanceof Date ? end.toISOString()   : end
    );
    return _promisify(index.getAll(range));
  }

  // ── Store de metadatos (key-value genérico) ───────────────────────────────
  // Usado para guardar pares sueltos: configuración de gamificación, estado de sincronización, etc.

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

  /** Exportar todos los datos como JSON */
  async function exportAll() {
    const stores = FlowSchema.stores.map((s) => s.name);
    const data   = {};
    await Promise.all(
      stores.map(async (name) => {
        try { data[name] = await getAll(name); } catch { data[name] = []; }
      })
    );
    return {
      version:   DB_VERSION,
      exportedAt: new Date().toISOString(),
      app:       'FocusAI',
      data,
    };
  }

  /** Importar datos desde un JSON exportado */
  async function importAll(exported) {
    if (!exported?.data) throw new Error('Formato de importación inválido');
    for (const [storeName, records] of Object.entries(exported.data)) {
      if (!Array.isArray(records)) continue;
      try {
        await clear(storeName);
        if (records.length > 0) await saveMany(storeName, records);
      } catch (e) {
        console.warn(`[Storage] Error importando store "${storeName}":`, e);
      }
    }
  }

  /** Exportar un store específico como CSV */
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

  // ── Utilidades ────────────────────────────────────────────────────────────

  /** Generar un ID único para registros nuevos */
  function generateId(prefix = '') {
    const ts     = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}${ts}${random}`;
  }

  /** Obtener el tamaño aproximado de la DB en bytes */
  async function estimateSize() {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota, usageMB: (usage / 1024 / 1024).toFixed(2), quotaMB: (quota / 1024 / 1024).toFixed(0) };
  }

  /** Solicitar almacenamiento persistente (evita que el navegador limpie la DB) */
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
