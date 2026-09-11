// ── FocusAI Tasks ────────────────────────────────────────────────────────────
// Gestión completa de tareas: CRUD, prioridades, subtareas, recurrencia,
// etiquetas, adjuntos, comentarios, y acceso directo de la IA.

window.FlowTasks = (() => {

  // ── Modelo de datos ───────────────────────────────────────────────────────
  /*
  Task {
    id:           string
    title:        string
    description:  string
    priority:     'high' | 'medium' | 'low' | 'none'
    status:       'pending' | 'in_progress' | 'completed' | 'cancelled'
    completed:    boolean
    completedAt:  ISO string | null
    dueDate:      ISO string | null
    dueTime:      'HH:MM' | null
    reminder:     ISO string | null
    reminderSent: boolean
    projectId:    string | null
    goalId:       string | null
    labels:       string[]
    subtasks:     Subtask[]
    comments:     Comment[]
    attachments:  string[]   (attachment IDs)
    recurrence:   RecurrenceRule | null
    parentId:     string | null  (para tareas recurrentes generadas)
    estimatedMin: number | null  (minutos estimados por IA o usuario)
    actualMin:    number | null  (minutos reales registrados)
    assignedTo:   string | null  (userId)
    order:        number
    archived:     boolean
    createdAt:    ISO string
    updatedAt:    ISO string
  }

  Subtask { id, title, completed, completedAt, order }
  Comment { id, text, createdAt, authorId }
  */

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function create(data = {}) {
    const now  = new Date().toISOString();
    const task = {
      id:           FlowStorage.generateId('task_'),
      title:        data.title        || 'Sin título',
      description:  data.description  || '',
      priority:     data.priority      || 'none',
      status:       'pending',
      completed:    false,
      completedAt:  null,
      dueDate:      data.dueDate       || null,
      dueTime:      data.dueTime       || null,
      reminder:     data.reminder      || null,
      reminderSent: false,
      projectId:    data.projectId     || null,
      goalId:       data.goalId        || null,
      labels:       data.labels        || [],
      subtasks:     data.subtasks      || [],
      comments:     data.comments      || [],
      attachments:  data.attachments   || [],
      recurrence:   data.recurrence    || null,
      parentId:     data.parentId      || null,
      estimatedMin: data.estimatedMin  ?? null,
      actualMin:    null,
      assignedTo:   data.assignedTo    || null,
      order:        data.order         ?? Date.now(),
      archived:     false,
      createdAt:    now,
      updatedAt:    now,
    };

    await FlowStorage.save('tasks', task);
    FlowState.array.push('tasks.items', task);

    // Programar recordatorio si tiene fecha
    if (task.reminder) FlowNotifications.schedule(task);

    // Actualizar contexto de la IA
    _notifyAI('created', task);

    FlowApp.toast(`Tarea "${_truncate(task.title)}" creada`, 'success');
    return task;
  }

  async function update(id, changes = {}) {
    const task = _findById(id);
    if (!task) throw new Error(`Tarea ${id} no encontrada`);

    const updated = {
      ...task,
      ...changes,
      id,
      updatedAt: new Date().toISOString(),
    };

    await FlowStorage.save('tasks', updated);
    FlowState.array.updateItem('tasks.items', (t) => t.id === id, updated);

    // Re-programar recordatorio si cambió
    if (changes.reminder !== undefined) FlowNotifications.schedule(updated);

    _notifyAI('updated', updated);
    return updated;
  }

  async function remove(id) {
    const task = _findById(id);
    if (!task) return;

    await FlowStorage.remove('tasks', id);
    FlowState.array.remove('tasks.items', (t) => t.id === id);

    FlowNotifications.cancel(`task_${id}`);
    _notifyAI('deleted', task);

    FlowApp.toast(`Tarea eliminada`, 'info', {
      action: { label: 'Deshacer', fn: () => _undoDelete(task) }
    });
  }

  async function _undoDelete(task) {
    await FlowStorage.save('tasks', task);
    FlowState.array.push('tasks.items', task);
    FlowApp.toast('Tarea restaurada', 'success');
  }

  // ── Estado y completado ───────────────────────────────────────────────────

  async function complete(id) {
    const task = _findById(id);
    if (!task || task.completed) return;

    const now = new Date().toISOString();
    await update(id, { completed: true, completedAt: now, status: 'completed' });

    // Manejar recurrencia: si tiene regla, generar siguiente instancia
    if (task.recurrence && !task.parentId) {
      const next = FlowRecurrence.nextTask(task);
      if (next) await create(next);
    }

    // Gamificación
    const pts = { high: 30, medium: 20, low: 10, none: 5 };
    FlowGamification.addXP(pts[task.priority] || 5, 'task_complete');

    FlowApp.toast('✓ Tarea completada', 'success');
  }

  async function reopen(id) {
    await update(id, { completed: false, completedAt: null, status: 'pending' });
  }

  async function archive(id) {
    await update(id, { archived: true });
    FlowState.array.remove('tasks.items', (t) => t.id === id && t.archived);
  }

  // ── Subtareas ─────────────────────────────────────────────────────────────

  async function addSubtask(taskId, title) {
    const task = _findById(taskId);
    if (!task) return;
    const subtask = {
      id:          FlowStorage.generateId('st_'),
      title,
      completed:   false,
      completedAt: null,
      order:       task.subtasks.length,
    };
    await update(taskId, { subtasks: [...task.subtasks, subtask] });
    return subtask;
  }

  async function toggleSubtask(taskId, subtaskId) {
    const task = _findById(taskId);
    if (!task) return;
    const subtasks = task.subtasks.map((s) =>
      s.id === subtaskId
        ? { ...s, completed: !s.completed, completedAt: !s.completed ? new Date().toISOString() : null }
        : s
    );
    await update(taskId, { subtasks });
    // Completar tarea padre si todas las subtareas están listas
    if (subtasks.every((s) => s.completed) && !task.completed) {
      await complete(taskId);
    }
  }

  async function removeSubtask(taskId, subtaskId) {
    const task = _findById(taskId);
    if (!task) return;
    await update(taskId, { subtasks: task.subtasks.filter((s) => s.id !== subtaskId) });
  }

  // ── Comentarios ───────────────────────────────────────────────────────────

  async function addComment(taskId, text) {
    const task = _findById(taskId);
    if (!task) return;
    const comment = {
      id:        FlowStorage.generateId('cmt_'),
      text,
      createdAt: new Date().toISOString(),
      authorId:  FlowState.get('user.id') || 'local',
    };
    await update(taskId, { comments: [...task.comments, comment] });
    return comment;
  }

  async function removeComment(taskId, commentId) {
    const task = _findById(taskId);
    if (!task) return;
    await update(taskId, { comments: task.comments.filter((c) => c.id !== commentId) });
  }

  // ── Etiquetas ─────────────────────────────────────────────────────────────

  async function addLabel(taskId, label) {
    const task = _findById(taskId);
    if (!task || task.labels.includes(label)) return;
    await update(taskId, { labels: [...task.labels, label] });
  }

  async function removeLabel(taskId, label) {
    const task = _findById(taskId);
    if (!task) return;
    await update(taskId, { labels: task.labels.filter((l) => l !== label) });
  }

  function getAllLabels() {
    const tasks  = FlowState.get('tasks.items') || [];
    const labels = new Set(tasks.flatMap((t) => t.labels || []));
    return [...labels].sort();
  }

  // ── Filtros y consultas ───────────────────────────────────────────────────

  function getFiltered() {
    const tasks     = FlowState.get('tasks.items') || [];
    const filter    = FlowState.get('tasks.filter');
    const sortBy    = FlowState.get('tasks.sortBy');
    const sortDir   = FlowState.get('tasks.sortDir');
    const labels    = FlowState.get('tasks.activeLabels') || [];
    const search    = (FlowState.get('tasks.searchQuery') || '').toLowerCase();
    const today     = new Date().toISOString().split('T')[0];

    let result = tasks.filter((t) => !t.archived);

    // Filtro principal
    switch (filter) {
      case 'today':     result = result.filter((t) => t.dueDate === today && !t.completed); break;
      case 'upcoming':  result = result.filter((t) => t.dueDate > today && !t.completed);   break;
      case 'completed': result = result.filter((t) => t.completed);                          break;
      case 'overdue':   result = result.filter((t) => t.dueDate < today && !t.completed);   break;
      default:          result = result.filter((t) => !t.completed);                         break;
    }

    // Filtro por etiquetas
    if (labels.length) {
      result = result.filter((t) => labels.some((l) => t.labels.includes(l)));
    }

    // Búsqueda
    if (search) {
      result = result.filter((t) =>
        t.title.toLowerCase().includes(search) ||
        t.description?.toLowerCase().includes(search) ||
        t.labels.some((l) => l.toLowerCase().includes(search))
      );
    }

    // Ordenado
    const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'priority') cmp = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
      else if (sortBy === 'dueDate') cmp = (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1;
      else if (sortBy === 'title') cmp = a.title.localeCompare(b.title);
      else cmp = a.order - b.order;
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }

  function getForProject(projectId) {
    return (FlowState.get('tasks.items') || []).filter((t) => t.projectId === projectId && !t.archived);
  }

  function getForGoal(goalId) {
    return (FlowState.get('tasks.items') || []).filter((t) => t.goalId === goalId && !t.archived);
  }

  function getOverdue() {
    const today = new Date().toISOString().split('T')[0];
    return (FlowState.get('tasks.items') || []).filter((t) => t.dueDate && t.dueDate < today && !t.completed && !t.archived);
  }

  function getToday() {
    const today = new Date().toISOString().split('T')[0];
    return (FlowState.get('tasks.items') || []).filter((t) => t.dueDate === today && !t.completed && !t.archived);
  }

  // ── Modal de nueva tarea ──────────────────────────────────────────────────

    function openNewTaskModal(defaults = {}) {
    // Crear dialog nativo
    const existing = document.getElementById('task-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'task-dialog';
    dialog.className = 'native-dialog';
    dialog.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">Nueva tarea</h2>
        <button class="icon-btn" onclick="document.getElementById('task-dialog').close()">✕</button>
      </div>
      <div class="modal-body">
        ${_taskFormHTML('', defaults)}
      </div>`;

    document.body.appendChild(dialog);
    dialog.showModal();

    setTimeout(() => _bindTaskForm(null), 50);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  function openEditModal(id) {
    const task = _findById(id);
    if (!task) return;
    FlowApp.showModal({
      title: 'Editar tarea',
      size:  'lg',
      content: _taskFormHTML(id, task),
    });
    setTimeout(() => _bindTaskForm(id), 50);
  }

  function _taskFormHTML(id, data = {}) {
    const priorityOpts = ['none','low','medium','high'].map((p) =>
      `<option value="${p}" ${data.priority === p ? 'selected' : ''}>${_priorityLabel(p)}</option>`
    ).join('');

    const labelList = getAllLabels().map((l) =>
      `<label class="checkbox-pill">
        <input type="checkbox" value="${l}" ${(data.labels || []).includes(l) ? 'checked' : ''}>
        ${l}
      </label>`
    ).join('');

    return `
      <form id="task-form" class="task-form" autocomplete="off">
        <input type="hidden" name="id" value="${id}">
        <div class="form-group">
          <label class="form-label">Título *</label>
          <input class="form-input" name="title" value="${data.title || ''}" placeholder="¿Qué necesitas hacer?" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <textarea class="form-input form-textarea" name="description" rows="3" placeholder="Detalles opcionales…">${data.description || ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Prioridad</label>
            <select class="form-input form-select" name="priority">${priorityOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha límite</label>
            <input class="form-input" type="date" name="dueDate" value="${data.dueDate || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Hora</label>
            <input class="form-input" type="time" name="dueTime" value="${data.dueTime || ''}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Recordatorio</label>
            <input class="form-input" type="datetime-local" name="reminder" value="${data.reminder ? data.reminder.replace('Z','') : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Tiempo estimado (min)</label>
            <input class="form-input" type="number" name="estimatedMin" min="1" value="${data.estimatedMin || ''}" placeholder="ej. 30">
          </div>
        </div>
        ${labelList ? `<div class="form-group"><label class="form-label">Etiquetas</label><div class="label-list">${labelList}</div></div>` : ''}
        <div class="form-group">
          <label class="form-label">Nueva etiqueta</label>
          <div class="input-inline">
            <input class="form-input" id="new-label-input" placeholder="Escribe y presiona Enter">
            <button type="button" class="btn btn-ghost" id="add-label-btn">+ Agregar</button>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" onclick="FlowApp.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">${id ? 'Guardar cambios' : 'Crear tarea'}</button>
        </div>
      </form>`;
  }

  function _bindTaskForm(existingId) {
    const form = document.getElementById('task-form');
    if (!form) return;

    // Agregar etiqueta con Enter
    const labelInput = document.getElementById('new-label-input');
    const addBtn     = document.getElementById('add-label-btn');
    const addLabel   = () => {
      const val = labelInput.value.trim();
      if (!val) return;
      const list = form.querySelector('.label-list') || (() => {
        const div = document.createElement('div');
        div.className = 'label-list';
        labelInput.closest('.form-group').before(div);
        return div;
      })();
      const pill = document.createElement('label');
      pill.className = 'checkbox-pill';
      pill.innerHTML = `<input type="checkbox" value="${val}" checked>${val}`;
      list.appendChild(pill);
      labelInput.value = '';
    };
    labelInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } });
    addBtn?.addEventListener('click', addLabel);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const labels = [...form.querySelectorAll('.label-list input:checked')].map((i) => i.value);
      const data = {
        title:        fd.get('title'),
        description:  fd.get('description'),
        priority:     fd.get('priority'),
        dueDate:      fd.get('dueDate')      || null,
        dueTime:      fd.get('dueTime')      || null,
        reminder:     fd.get('reminder')     ? new Date(fd.get('reminder')).toISOString() : null,
        estimatedMin: fd.get('estimatedMin') ? Number(fd.get('estimatedMin')) : null,
        labels,
      };
      if (existingId) await update(existingId, data);
      else            await create(data);
      FlowApp.closeModal();
    });
  }

  // ── Reordenar (drag & drop desde proyectos/kanban) ────────────────────────

  async function reorder(taskId, newOrder) {
    await update(taskId, { order: newOrder });
  }

  async function bulkReorder(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      const task = _findById(orderedIds[i]);
      if (task) {
        const updated = { ...task, order: i, updatedAt: new Date().toISOString() };
        FlowState.array.updateItem('tasks.items', (t) => t.id === orderedIds[i], updated);
      }
    }
    // Guardar en batch
    const updated = orderedIds.map((id, i) => {
      const t = _findById(id);
      return t ? { ...t, order: i } : null;
    }).filter(Boolean);
    await FlowStorage.saveMany('tasks', updated);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _findById(id) {
    return FlowState.array.find('tasks.items', (t) => t.id === id);
  }

  function _truncate(str, len = 30) {
    return str.length > len ? str.substring(0, len) + '…' : str;
  }

  function _priorityLabel(p) {
    return { high: '🔴 Alta', medium: '🟡 Media', low: '🔵 Baja', none: '⚪ Sin prioridad' }[p] || p;
  }

  function _notifyAI(action, task) {
    const ctx = FlowState.get('ai.context') || {};
    const today = new Date().toISOString().split('T')[0];
    ctx.tasksToday = getToday();
    ctx.overdue    = getOverdue();
    FlowState.update('ai.context', ctx);
  }

  // ── Estadísticas para el dashboard ───────────────────────────────────────

  function getStats() {
    const tasks     = FlowState.get('tasks.items') || [];
    const today     = new Date().toISOString().split('T')[0];
    const total     = tasks.filter((t) => !t.archived).length;
    const completed = tasks.filter((t) => t.completed && !t.archived).length;
    const pending   = total - completed;
    const overdue   = tasks.filter((t) => t.dueDate < today && !t.completed && !t.archived).length;
    const todayDue  = tasks.filter((t) => t.dueDate === today && !t.completed && !t.archived).length;
    const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, overdue, todayDue, completionRate: rate };
  }

  return {
    create, update, remove,
    complete, reopen, archive,
    addSubtask, toggleSubtask, removeSubtask,
    addComment, removeComment,
    addLabel, removeLabel, getAllLabels,
    getFiltered, getForProject, getForGoal, getOverdue, getToday,
    openNewTaskModal, openEditModal,
    reorder, bulkReorder,
    getStats,
  };

})();
