// ── FocusAI Schema ───────────────────────────────────────────────────────────
// Definición de todos los object stores de IndexedDB.
// Usado por storage.js al inicializar (onupgradeneeded).

window.FlowSchema = {

  stores: [

    // ── Tareas ───────────────────────────────────────────────────────────────
    {
      name:     'tasks',
      keyPath:  'id',
      indexes: [
        { name: 'dueDate',   keyPath: 'dueDate' },
        { name: 'projectId', keyPath: 'projectId' },
        { name: 'goalId',    keyPath: 'goalId' },
        { name: 'status',    keyPath: 'status' },
        { name: 'priority',  keyPath: 'priority' },
        { name: 'completed', keyPath: 'completed' },
        { name: 'createdAt', keyPath: 'createdAt' },
        { name: 'labels',    keyPath: 'labels', multiEntry: true },
        { name: 'assignedTo',keyPath: 'assignedTo' },
        { name: 'parentId',  keyPath: 'parentId' },
      ],
    },

    // ── Eventos de calendario ────────────────────────────────────────────────
    {
      name:    'events',
      keyPath: 'id',
      indexes: [
        { name: 'startDate', keyPath: 'startDate' },
        { name: 'endDate',   keyPath: 'endDate' },
        { name: 'type',      keyPath: 'type' },
        { name: 'projectId', keyPath: 'projectId' },
        { name: 'taskId',    keyPath: 'taskId' },
        { name: 'parentId',  keyPath: 'parentId' },
      ],
    },

    // ── Hábitos ──────────────────────────────────────────────────────────────
    {
      name:    'habits',
      keyPath: 'id',
      indexes: [
        { name: 'archived',  keyPath: 'archived' },
        { name: 'createdAt', keyPath: 'createdAt' },
      ],
    },

    // ── Logs de hábitos ──────────────────────────────────────────────────────
    {
      name:    'habit_logs',
      keyPath: 'id',
      indexes: [
        { name: 'habitId', keyPath: 'habitId' },
        { name: 'date',    keyPath: 'date' },
        // Índice compuesto simulado: habitId_date (para lookup rápido)
        { name: 'habitId_date', keyPath: ['habitId', 'date'] },
      ],
    },

    // ── Objetivos ────────────────────────────────────────────────────────────
    {
      name:    'goals',
      keyPath: 'id',
      indexes: [
        { name: 'type',       keyPath: 'type' },
        { name: 'completed',  keyPath: 'completed' },
        { name: 'targetDate', keyPath: 'targetDate' },
        { name: 'archived',   keyPath: 'archived' },
      ],
    },

    // ── Proyectos ────────────────────────────────────────────────────────────
    {
      name:    'projects',
      keyPath: 'id',
      indexes: [
        { name: 'status',    keyPath: 'status' },
        { name: 'archived',  keyPath: 'archived' },
        { name: 'createdAt', keyPath: 'createdAt' },
      ],
    },

    // ── Registros de tiempo ──────────────────────────────────────────────────
    {
      name:    'time_logs',
      keyPath: 'id',
      indexes: [
        { name: 'date',      keyPath: 'date' },
        { name: 'taskId',    keyPath: 'taskId' },
        { name: 'projectId', keyPath: 'projectId' },
        { name: 'mode',      keyPath: 'mode' },
      ],
    },

    // ── Diario personal ──────────────────────────────────────────────────────
    {
      name:    'journal',
      keyPath: 'id',
      indexes: [
        { name: 'date',      keyPath: 'date',      unique: true },
        { name: 'mood',      keyPath: 'mood' },
        { name: 'createdAt', keyPath: 'createdAt' },
      ],
    },

    // ── Logs de estado de ánimo ──────────────────────────────────────────────
    {
      name:    'mood_logs',
      keyPath: 'id',
      indexes: [
        { name: 'date', keyPath: 'date', unique: true },
        { name: 'mood', keyPath: 'mood' },
      ],
    },

    // ── Adjuntos ─────────────────────────────────────────────────────────────
    {
      name:    'attachments',
      keyPath: 'id',
      indexes: [
        { name: 'taskId',    keyPath: 'taskId' },
        { name: 'createdAt', keyPath: 'createdAt' },
      ],
    },

    // ── Logs de sesiones de enfoque ──────────────────────────────────────────
    {
      name:    'focus_logs',
      keyPath: 'id',
      indexes: [
        { name: 'date', keyPath: 'date' },
        { name: 'mode', keyPath: 'mode' },
      ],
    },

    // ── Equipos ──────────────────────────────────────────────────────────────
    {
      name:    'teams',
      keyPath: 'id',
      indexes: [
        { name: 'ownerId', keyPath: 'ownerId' },
      ],
    },

    // ── Mensajes de equipo ───────────────────────────────────────────────────
    {
      name:    'messages',
      keyPath: 'id',
      indexes: [
        { name: 'teamId',    keyPath: 'teamId' },
        { name: 'authorId',  keyPath: 'authorId' },
        { name: 'createdAt', keyPath: 'createdAt' },
      ],
    },

    // ── Metadatos clave-valor ────────────────────────────────────────────────
    // Usado para: gamificación, configuración de sync, estado de migraciones, etc.
    {
      name:    'meta',
      keyPath: 'key',
    },

  ],

};
