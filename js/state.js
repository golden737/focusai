// ── FocusAI State ────────────────────────────────────────────────────────────
// Store centralizado con patrón observer.
// Todos los módulos leen y escriben aquí. La UI reacciona a cambios vía subscribe().

window.FlowState = (() => {

  // ── Estado inicial ──────────────────────────────────────────────────────────
  const _state = {

    // Usuario y sesión
    user: {
      id:       null,
      name:     'Usuario',
      email:    null,
      avatar:   null,
      theme:    'dark',       // 'dark' | 'light' | 'system'
      lang:     'es',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: null,
    },

    // Gamificación (nivel, XP, insignias)
    gamification: {
      xp:        0,
      level:     1,
      badges:    [],
      streak:    0,
      totalTasks: 0,
      weekPoints: 0,
      challenges: [],
    },

    // Tareas
    tasks: {
      items:       [],   // Array<Task>
      filter:      'all', // 'all' | 'today' | 'upcoming' | 'completed' | 'overdue'
      sortBy:      'priority', // 'priority' | 'dueDate' | 'createdAt' | 'title'
      sortDir:     'asc',
      activeLabels: [],
      searchQuery: '',
      view:        'list', // 'list' | 'board' | 'grid'
    },

    // Calendario
    calendar: {
      events:      [],
      currentDate: new Date().toISOString(),
      viewMode:    'week',   // 'day' | 'week' | 'month'
      selectedDate: null,
    },

    // Timer / Pomodoro
    timer: {
      mode:          'stopwatch', // 'stopwatch' | 'pomodoro' | 'countdown'
      status:        'idle',      // 'idle' | 'running' | 'paused' | 'break'
      elapsed:       0,           // segundos
      pomodoroPhase: 'work',      // 'work' | 'short-break' | 'long-break'
      pomodoroCount: 0,
      settings: {
        workDuration:       25 * 60,
        shortBreakDuration: 5  * 60,
        longBreakDuration:  15 * 60,
        sessionsUntilLong:  4,
        autoStartBreaks:    false,
        autoStartWork:      false,
        soundEnabled:       true,
      },
      logs:          [],   // Array<TimeLog>
      activeTaskId:  null,
    },

    // Hábitos
    habits: {
      items:     [],   // Array<Habit>
      logs:      [],   // Array<HabitLog>
      viewDate:  new Date().toISOString().split('T')[0],
    },

    // Objetivos
    goals: {
      items: [],  // Array<Goal>
      filter: 'all', // 'all' | 'short' | 'long' | 'completed'
    },

    // Proyectos
    projects: {
      items:       [],   // Array<Project>
      activeId:    null,
      viewMode:    'kanban', // 'kanban' | 'gantt' | 'list'
    },

    // Estadísticas (cache de métricas calculadas)
    stats: {
      daily:   {},
      weekly:  {},
      monthly: {},
      lastCalculated: null,
    },

    // IA
    ai: {
      apiKey:       '',
      provider:     'ollama',
      baseUrl:      'http://localhost:11434',
      model:        'qwen2.5-coder:7b',
      chatHistory:  [],          // Array<{role, content, ts}>
      suggestions:  [],          // Sugerencias activas del día
      planGenerated: false,
      isThinking:   false,
      panelOpen:    false,
      context: {
        tasksToday:  [],
        overdue:     [],
        habits:      [],
        focusScore:  0,
      },
    },

    // Modo Enfoque
    focus: {
      active:        false,
      sessionStart:  null,
      mode:          'deep',    // 'deep' | 'light' | 'custom'
      blockedSites:  [],
      musicTrack:    null,
      stats: {
        todaySessions:  0,
        todayMinutes:   0,
        weekSessions:   0,
      },
    },

    // Diario personal
    personal: {
      entries:  [],   // Array<JournalEntry>
      moodLogs: [],   // Array<MoodLog>
      viewDate: new Date().toISOString().split('T')[0],
    },

    // Notificaciones
    notifications: {
      permission: 'default', // 'default' | 'granted' | 'denied'
      queue:      [],
      settings: {
        taskReminders:    true,
        habitReminders:   true,
        focusAlerts:      true,
        weeklyReport:     true,
        emailEnabled:     false,
        emailAddress:     '',
        reminderMinutes:  15,
      },
    },

    // Colaboración
    collaboration: {
      teams:    [],
      members:  [],
      messages: [],
      activeTeamId: null,
    },

    // Búsqueda global
    search: {
      query:   '',
      results: [],
      active:  false,
    },

    // UI / navegación
    ui: {
      currentView:    'dashboard',
      previousView:   null,
      sidebarOpen:    true,
      sidebarCollapsed: false,
      modalOpen:      false,
      modalType:      null,
      modalData:      null,
      loading:        false,
      loadingMessage: '',
      toasts:         [],
    },

    // Ajustes generales
    settings: {
      firstRun:         true,
      onboardingStep:   0,
      dateFormat:       'DD/MM/YYYY',
      timeFormat:       '24h',    // '12h' | '24h'
      weekStartsOn:     1,        // 0=domingo, 1=lunes
      currency:         'USD',
      exportFormat:     'json',   // 'json' | 'csv'
      backupEnabled:    false,
      backupInterval:   'weekly',
      syncCalendar:     false,
      calendarProvider: null,
      calendarToken:    null,
    },

  };

  // ── Suscriptores ─────────────────────────────────────────────────────────────
  const _subscribers = new Map(); // key → Set<fn>
  let   _batchDepth  = 0;
  const _pendingKeys = new Set();

  function _notify(key) {
    if (_batchDepth > 0) { _pendingKeys.add(key); return; }
    const subs = _subscribers.get(key);
    if (subs) subs.forEach((fn) => { try { fn(get(key)); } catch (e) { console.error(`FlowState subscriber error [${key}]:`, e); } });
    // wildcard '*'
    const all = _subscribers.get('*');
    if (all) all.forEach((fn) => { try { fn({ key, value: get(key) }); } catch (e) { console.error('FlowState wildcard error:', e); } });
  }

  // ── API pública ───────────────────────────────────────────────────────────────

  /**
   * Leer un valor del estado usando notación de punto.
   * get('user.name') → 'Usuario'
   */
  function get(path) {
    if (!path) return _state;
    return path.split('.').reduce((obj, key) => obj?.[key], _state);
  }

  /**
   * Escribir un valor en el estado.
   * set('user.name', 'Ana') actualiza _state.user.name y notifica a suscriptores de 'user.name' y 'user'.
   */
  function set(path, value) {
    const keys = path.split('.');
    let obj = _state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    const lastKey = keys[keys.length - 1];
    const oldVal  = obj[lastKey];

    // No notificar si no cambió (comparación superficial)
    if (oldVal === value) return;

    obj[lastKey] = value;

    // Notificar en cascada: 'user.name', 'user', '*'
    let notifyPath = path;
    while (notifyPath) {
      _notify(notifyPath);
      const dot = notifyPath.lastIndexOf('.');
      notifyPath = dot > -1 ? notifyPath.substring(0, dot) : null;
    }
  }

  /**
   * Actualizar parcialmente un objeto en el estado (shallow merge).
   * update('user', { name: 'Ana', email: 'ana@x.com' })
   */
  function update(path, partial) {
    const current = get(path);
    if (typeof current !== 'object' || current === null) {
      set(path, partial);
      return;
    }
    batch(() => {
      Object.entries(partial).forEach(([k, v]) => set(`${path}.${k}`, v));
    });
  }

  /**
   * Operaciones sobre arrays: push, remove, updateItem, replaceAll.
   */
  const array = {
    push(path, item) {
      const arr = get(path) || [];
      set(path, [...arr, item]);
    },
    remove(path, predicate) {
      const arr = get(path) || [];
      set(path, arr.filter((item, i) => !predicate(item, i)));
    },
    updateItem(path, predicate, changes) {
      const arr = get(path) || [];
      set(path, arr.map((item) => predicate(item) ? { ...item, ...changes } : item));
    },
    replaceAll(path, items) {
      set(path, [...items]);
    },
    find(path, predicate) {
      return (get(path) || []).find(predicate);
    },
  };

  /**
   * Suscribirse a cambios en un path.
   * Retorna una función para cancelar la suscripción.
   */
  function subscribe(path, fn) {
    if (!_subscribers.has(path)) _subscribers.set(path, new Set());
    _subscribers.get(path).add(fn);
    return () => _subscribers.get(path)?.delete(fn);
  }

  /**
   * Agrupar múltiples set() para emitir una sola notificación al final.
   */
  function batch(fn) {
    _batchDepth++;
    try { fn(); } finally {
      _batchDepth--;
      if (_batchDepth === 0) {
        const keys = [..._pendingKeys];
        _pendingKeys.clear();
        keys.forEach(_notify);
      }
    }
  }

  /**
   * Persistir estado crítico en localStorage (user prefs, settings, api key).
   * Los datos de tareas/hábitos/etc. viven en IndexedDB (storage.js).
   */
  function persist() {
    try {
      const persisted = {
        user:     get('user'),
        settings: get('settings'),
        ai: {
          apiKey: get('ai.apiKey'),
          model:  get('ai.model'),
        },
        timer: {
          settings: get('timer.settings'),
        },
        notifications: {
          settings: get('notifications.settings'),
        },
        ui: {
          sidebarCollapsed: get('ui.sidebarCollapsed'),
          currentView:      get('ui.currentView'),
        },
      };
      localStorage.setItem('focusai_state', JSON.stringify(persisted));
    } catch (e) {
      console.warn('FlowState: no se pudo persistir en localStorage:', e);
    }
  }

  /**
   * Restaurar estado persistido desde localStorage.
   */
  function restore() {
    try {
      const raw = localStorage.getItem('focusai_state');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      batch(() => {
        if (saved.user)     update('user', saved.user);
        if (saved.settings) update('settings', saved.settings);
        if (saved.ai) {
          if (saved.ai.apiKey) set('ai.apiKey', saved.ai.apiKey);
        }
        if (saved.timer?.settings) update('timer.settings', saved.timer.settings);
        if (saved.notifications?.settings) update('notifications.settings', saved.notifications.settings);
        if (saved.ui) {
          if (saved.ui.sidebarCollapsed !== undefined) set('ui.sidebarCollapsed', saved.ui.sidebarCollapsed);
        }
      });
      return true;
    } catch (e) {
      console.warn('FlowState: error al restaurar localStorage:', e);
      return false;
    }
  }

  /**
   * Reset completo del estado (útil para logout o tests).
   */
  function reset(path) {
    if (path) {
      // Reset de un sub-árbol específico — recarga desde el estado inicial
      console.warn(`FlowState.reset('${path}') — reimplementar con estado inicial si se necesita`);
    } else {
      localStorage.removeItem('focusai_state');
      window.location.reload();
    }
  }

  /**
   * Snapshot del estado completo (para debug o export).
   */
  function snapshot() {
    return JSON.parse(JSON.stringify(_state));
  }

  // Auto-persist cada vez que cambia user, settings o ai.apiKey
  subscribe('user',        persist);
  subscribe('settings',    persist);
  subscribe('ai.apiKey',   persist);
  subscribe('ai.model',    persist);
  subscribe('timer.settings', persist);
  subscribe('notifications.settings', persist);
  subscribe('ui.sidebarCollapsed', persist);

  // Exponer para debug en desarrollo
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.__FlowState__ = { get, set, update, snapshot, _state };
  }

  return { get, set, update, array, subscribe, batch, persist, restore, reset, snapshot };

  // Hacer showModal disponible globalmente desde el inicio
  window.FlowApp = window.FlowApp || { 
    showModal: (...args) => window.showGlobalModal?.(...args),
    closeModal: () => window.closeGlobalModal?.()
  };
})();
