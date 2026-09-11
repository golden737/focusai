// ── FocusAI Migrations ───────────────────────────────────────────────────────
// Actualizaciones de versión de la base de datos IndexedDB.
// Se ejecuta en onupgradeneeded cuando DB_VERSION aumenta.

window.FlowMigrations = {

  run(db, oldVersion, newVersion) {
    console.info(`[Migrations] Actualizando DB v${oldVersion} → v${newVersion}`);

    // Cada bloque case cae en cascada (sin break) para aplicar
    // todas las migraciones desde la versión actual hasta la nueva.
    switch (oldVersion) {
      case 0:
        // v1: creación inicial — los stores los crea schema.js
        // No hay nada extra que hacer aquí.
        console.info('[Migrations] v1: schema inicial aplicado');
        // falls through

      // case 1:
      //   // v2: añadir índice 'color' a habits
      //   if (db.objectStoreNames.contains('habits')) {
      //     const tx    = db.transaction('habits', 'readwrite');
      //     const store = tx.objectStore('habits');
      //     if (!store.indexNames.contains('color')) {
      //       store.createIndex('color', 'color');
      //     }
      //   }
      //   console.info('[Migrations] v2: índice color en habits');
      //   // falls through

      default:
        break;
    }
  },

};
