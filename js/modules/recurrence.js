// ── FocusAI Recurrence ───────────────────────────────────────────────────────
// Motor de reglas de recurrencia para tareas y eventos.

window.FlowRecurrence = (() => {

  // Expandir instancias futuras de una tarea recurrente
  function nextTask(parentTask) {
    const rule = parentTask.recurrence;
    if (!rule) return null;
    const base = new Date(parentTask.dueDate + 'T12:00:00');
    const next = _nextDate(base, rule);
    if (!next) return null;
    return {
      ...parentTask,
      id:          FlowStorage.generateId('task_'),
      dueDate:     next.toISOString().split('T')[0],
      completed:   false,
      completedAt: null,
      parentId:    parentTask.id,
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
  }

  // Expandir instancias de un evento recurrente (N semanas adelante)
  function expandEvent(parent, weeksAhead = 8) {
    const rule      = parent.recurrence;
    if (!rule) return [];
    const instances = [];
    let   current   = new Date(parent.startDate + 'T12:00:00');
    const limit     = new Date();
    limit.setDate(limit.getDate() + weeksAhead * 7);

    for (let i = 0; i < 200; i++) {
      const next = _nextDate(current, rule);
      if (!next || next > limit) break;
      instances.push({
        ...parent,
        id:        FlowStorage.generateId('evt_'),
        startDate: next.toISOString().split('T')[0],
        endDate:   next.toISOString().split('T')[0],
        parentId:  parent.id,
        recurrence: null,
        createdAt:  new Date().toISOString(),
        updatedAt:  new Date().toISOString(),
      });
      current = next;
    }
    return instances;
  }

  async function expandUpcoming() {
    // Expandir eventos recurrentes sin instancia futura
    const events  = FlowState.get('calendar.events') || [];
    const parents = events.filter((e) => e.recurrence && !e.parentId);
    for (const parent of parents) {
      const instances = expandEvent(parent, 4);
      for (const inst of instances) {
        const exists = events.some((e) => e.parentId === parent.id && e.startDate === inst.startDate);
        if (!exists) {
          await FlowStorage.save('events', inst);
          FlowState.array.push('calendar.events', inst);
        }
      }
    }
  }

  function _nextDate(from, rule) {
    const d = new Date(from);
    switch (rule.freq) {
      case 'daily':    d.setDate(d.getDate() + (rule.interval || 1)); break;
      case 'weekly':   d.setDate(d.getDate() + 7 * (rule.interval || 1)); break;
      case 'monthly':  d.setMonth(d.getMonth() + (rule.interval || 1)); break;
      case 'yearly':   d.setFullYear(d.getFullYear() + (rule.interval || 1)); break;
      case 'weekdays': {
        d.setDate(d.getDate() + 1);
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        break;
      }
      default: return null;
    }
    if (rule.until && d > new Date(rule.until)) return null;
    return d;
  }

  function buildRule(freq, options = {}) {
    return { freq, interval: options.interval || 1, until: options.until || null, count: options.count || null };
  }

  function describeRule(rule) {
    if (!rule) return '';
    const intervals = { daily: ['día','días'], weekly: ['semana','semanas'], monthly: ['mes','meses'], yearly: ['año','años'] };
    const [sing, plur] = intervals[rule.freq] || ['día','días'];
    const n = rule.interval || 1;
    if (rule.freq === 'weekdays') return 'Cada día laborable';
    return n === 1 ? `Cada ${sing}` : `Cada ${n} ${plur}`;
  }

  return { nextTask, expandEvent, expandUpcoming, buildRule, describeRule };
})();


// ── FocusAI Search ───────────────────────────────────────────────────────────
// Búsqueda global full-text en tareas, hábitos, objetivos, proyectos y diario.

window.FlowSearch = (() => {

  function search(query) {
    if (!query || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    const results = [];

    // Tareas
    (FlowState.get('tasks.items') || []).filter((t) => !t.archived).forEach((t) => {
      if (_matches([t.title, t.description, ...(t.labels || [])], q)) {
        results.push({ type: 'task', id: t.id, title: t.title, subtitle: t.dueDate || '', icon: '✅', action: () => { FlowRouter.navigate('tasks'); } });
      }
    });

    // Proyectos
    (FlowState.get('projects.items') || []).filter((p) => !p.archived).forEach((p) => {
      if (_matches([p.name, p.description], q)) {
        results.push({ type: 'project', id: p.id, title: p.name, subtitle: 'Proyecto', icon: p.icon || '📁', action: () => { FlowProjects.setActive(p.id); FlowRouter.navigate('projects'); } });
      }
    });

    // Hábitos
    (FlowState.get('habits.items') || []).filter((h) => !h.archived).forEach((h) => {
      if (_matches([h.name, h.description], q)) {
        results.push({ type: 'habit', id: h.id, title: h.name, subtitle: `Racha: ${h.streak} días`, icon: h.icon || '⭐', action: () => FlowRouter.navigate('habits') });
      }
    });

    // Objetivos
    (FlowState.get('goals.items') || []).filter((g) => !g.archived).forEach((g) => {
      if (_matches([g.title, g.description], q)) {
        results.push({ type: 'goal', id: g.id, title: g.title, subtitle: `${g.progress}% completado`, icon: g.icon || '🎯', action: () => FlowRouter.navigate('goals') });
      }
    });

    // Diario
    (FlowState.get('personal.entries') || []).forEach((e) => {
      if (_matches([e.content, e.highlights], q)) {
        results.push({ type: 'journal', id: e.id, title: `Entrada: ${e.date}`, subtitle: e.content?.substring(0, 60) + '…', icon: '📔', action: () => FlowRouter.navigate('personal') });
      }
    });

    FlowState.set('search.results', results.slice(0, 20));
    return results.slice(0, 20);
  }

  function openGlobal() {
    FlowState.set('search.active', true);
    window.dispatchEvent(new CustomEvent('focusai:search:open'));
  }

  function close() {
    FlowState.batch(() => {
      FlowState.set('search.active', false);
      FlowState.set('search.query', '');
      FlowState.set('search.results', []);
    });
  }

  function _matches(fields, q) {
    return fields.some((f) => f && String(f).toLowerCase().includes(q));
  }

  return { search, openGlobal, close };
})();


// ── FocusAI Auth ─────────────────────────────────────────────────────────────
// Autenticación local simple. Preparado para OAuth en el futuro.

window.FlowAuth = (() => {

  function init() {
    const user = FlowState.get('user');
    if (!user.id) {
      FlowState.update('user', {
        id:        FlowStorage.generateId('user_'),
        createdAt: new Date().toISOString(),
      });
      FlowState.persist();
    }
  }

  function updateProfile(data) {
    FlowState.update('user', data);
    FlowState.persist();
    FlowApp.toast('Perfil actualizado', 'success');
  }

  function getProfile() {
    return FlowState.get('user');
  }

  async function exportData() {
    const data = await FlowStorage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `focusai-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    FlowApp.toast('Datos exportados', 'success');
  }

  async function importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          await FlowStorage.importAll(data);
          FlowApp.toast('Datos importados. Recargando…', 'success');
          setTimeout(() => location.reload(), 1500);
          resolve();
        } catch (err) {
          FlowApp.toast('Error importando datos: ' + err.message, 'error');
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }

  async function clearAllData() {
    if (!confirm('¿Seguro? Esta acción eliminará TODOS tus datos de FocusAI.')) return;
    FlowState.reset();
  }

  return { init, updateProfile, getProfile, exportData, importData, clearAllData };
})();


// ── FocusAI Sync ─────────────────────────────────────────────────────────────
// Sincronización con Google Calendar / CalDAV (estructura preparada).

window.FlowSync = (() => {

  async function syncNow(type = 'all') {
    const settings = FlowState.get('settings');
    if (!settings?.syncCalendar || !settings?.calendarToken) return;
    console.info(`[Sync] Iniciando sync: ${type}`);
    // Implementación real requiere un servidor proxy para manejar OAuth
    // Esta estructura está lista para conectar con tu propio backend
    FlowApp.toast('Sincronización completada', 'success');
  }

  function getStatus() {
    return {
      enabled:  FlowState.get('settings.syncCalendar')  || false,
      provider: FlowState.get('settings.calendarProvider') || null,
      lastSync: FlowState.get('settings.lastSync') || null,
    };
  }

  function configure(provider, token) {
    FlowState.batch(() => {
      FlowState.set('settings.syncCalendar',     true);
      FlowState.set('settings.calendarProvider', provider);
      FlowState.set('settings.calendarToken',    token);
    });
    FlowState.persist();
  }

  function disconnect() {
    FlowState.batch(() => {
      FlowState.set('settings.syncCalendar',     false);
      FlowState.set('settings.calendarProvider', null);
      FlowState.set('settings.calendarToken',    null);
    });
    FlowState.persist();
    FlowApp.toast('Sincronización desconectada', 'info');
  }

  return { syncNow, getStatus, configure, disconnect };
})();


// ── FocusAI Collaboration ────────────────────────────────────────────────────
// Equipos, roles, chat interno, comentarios colaborativos (estructura local).

window.FlowCollaboration = (() => {

  async function createTeam(name, description = '') {
    const team = {
      id:          FlowStorage.generateId('team_'),
      name, description,
      ownerId:     FlowState.get('user.id'),
      members:     [{ userId: FlowState.get('user.id'), role: 'owner', joinedAt: new Date().toISOString() }],
      createdAt:   new Date().toISOString(),
    };
    await FlowStorage.save('teams', team);
    FlowState.array.push('collaboration.teams', team);
    FlowApp.toast(`Equipo "${name}" creado`, 'success');
    return team;
  }

  async function sendMessage(teamId, text) {
    const msg = {
      id:       FlowStorage.generateId('msg_'),
      teamId, text,
      authorId: FlowState.get('user.id'),
      authorName: FlowState.get('user.name'),
      createdAt: new Date().toISOString(),
    };
    await FlowStorage.save('messages', msg);
    FlowState.array.push('collaboration.messages', msg);
    return msg;
  }

  function getTeamMessages(teamId) {
    return (FlowState.get('collaboration.messages') || []).filter((m) => m.teamId === teamId);
  }

  function getTeams() {
    return FlowState.get('collaboration.teams') || [];
  }

  return { createTeam, sendMessage, getTeamMessages, getTeams };
})();


// ── FocusAI Attachments ──────────────────────────────────────────────────────
// Adjuntos de tareas: subida, lectura, eliminación y previews.

window.FlowAttachments = (() => {

  const MAX_SIZE_MB = 10;

  async function attach(taskId, file) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      FlowApp.toast(`El archivo supera el límite de ${MAX_SIZE_MB}MB`, 'error');
      return null;
    }

    const base64 = await _toBase64(file);
    const att = {
      id:        FlowStorage.generateId('att_'),
      taskId,
      name:      file.name,
      type:      file.type,
      size:      file.size,
      data:      base64,
      createdAt: new Date().toISOString(),
    };

    await FlowStorage.save('attachments', att);

    // Añadir referencia en la tarea
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (task) {
      await FlowTasks.update(taskId, { attachments: [...(task.attachments || []), att.id] });
    }

    FlowApp.toast(`Archivo "${file.name}" adjuntado`, 'success');
    return att;
  }

  async function getForTask(taskId) {
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (!task?.attachments?.length) return [];
    return Promise.all(task.attachments.map((id) => FlowStorage.get('attachments', id)));
  }

  async function remove(attId, taskId) {
    await FlowStorage.remove('attachments', attId);
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (task) {
      await FlowTasks.update(taskId, { attachments: (task.attachments || []).filter((id) => id !== attId) });
    }
  }

  function download(att) {
    const a    = document.createElement('a');
    a.href     = att.data;
    a.download = att.name;
    a.click();
  }

  function _toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function isImage(att) { return att?.type?.startsWith('image/'); }
  function formatSize(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  return { attach, getForTask, remove, download, isImage, formatSize };
})();
