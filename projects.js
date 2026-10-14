// ── FocusAI Projects ─────────────────────────────────────────────────────────
// Proyectos múltiples, tableros Kanban, Gantt, estados y dependencias.

window.FlowProjects = (() => {

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function create(data = {}) {
    const now     = new Date().toISOString();
    const project = {
      id:          FlowStorage.generateId('proj_'),
      name:        data.name        || 'Nuevo proyecto',
      description: data.description || '',
      color:       data.color       || '#6366f1',
      icon:        data.icon        || '📁',
      status:      data.status      || 'active',  // 'active'|'on_hold'|'completed'|'cancelled'
      // Kanban: columnas personalizables
      columns: data.columns || [
        { id: 'todo',        title: 'Por hacer',  color: '#64748b', order: 0 },
        { id: 'in_progress', title: 'En progreso', color: '#3b82f6', order: 1 },
        { id: 'review',      title: 'En revisión', color: '#f59e0b', order: 2 },
        { id: 'done',        title: 'Completado',  color: '#22c55e', order: 3 },
      ],
      members:     data.members     || [],   // [{ userId, role }]
      startDate:   data.startDate   || now.split('T')[0],
      endDate:     data.endDate     || null,
      goalId:      data.goalId      || null,
      archived:    false,
      createdAt:   now,
      updatedAt:   now,
    };

    await FlowStorage.save('projects', project);
    FlowState.array.push('projects.items', project);
    FlowApp.toast(`Proyecto "${project.name}" creado`, 'success');
    return project;
  }

  async function update(id, changes = {}) {
    const proj = _findById(id);
    if (!proj) return;
    const updated = { ...proj, ...changes, id, updatedAt: new Date().toISOString() };
    await FlowStorage.save('projects', updated);
    FlowState.array.updateItem('projects.items', (p) => p.id === id, updated);
    return updated;
  }

  async function remove(id) {
    await FlowStorage.remove('projects', id);
    FlowState.array.remove('projects.items', (p) => p.id === id);
    // Desasociar tareas
    const tasks = FlowTasks.getForProject(id);
    await Promise.all(tasks.map((t) => FlowTasks.update(t.id, { projectId: null, columnId: null })));
  }

  async function archive(id) { await update(id, { archived: true }); }
  async function complete(id) { await update(id, { status: 'completed' }); FlowGamification.addXP(100, 'project_complete'); }

  // ── Columnas Kanban ───────────────────────────────────────────────────────

  async function addColumn(projectId, title, color = '#64748b') {
    const proj = _findById(projectId);
    if (!proj) return;
    const column = {
      id:    FlowStorage.generateId('col_'),
      title,
      color,
      order: proj.columns.length,
    };
    await update(projectId, { columns: [...proj.columns, column] });
    return column;
  }

  async function updateColumn(projectId, columnId, changes) {
    const proj = _findById(projectId);
    if (!proj) return;
    const columns = proj.columns.map((c) => c.id === columnId ? { ...c, ...changes } : c);
    await update(projectId, { columns });
  }

  async function removeColumn(projectId, columnId) {
    const proj = _findById(projectId);
    if (!proj) return;
    // Mover tareas de esa columna a la primera columna
    const firstColumn = proj.columns.find((c) => c.id !== columnId);
    if (firstColumn) {
      const tasks = FlowTasks.getForProject(projectId).filter((t) => t.columnId === columnId);
      await Promise.all(tasks.map((t) => FlowTasks.update(t.id, { columnId: firstColumn.id })));
    }
    await update(projectId, { columns: proj.columns.filter((c) => c.id !== columnId) });
  }

  async function reorderColumns(projectId, orderedIds) {
    const proj = _findById(projectId);
    if (!proj) return;
    const columns = orderedIds.map((id, i) => {
      const col = proj.columns.find((c) => c.id === id);
      return col ? { ...col, order: i } : null;
    }).filter(Boolean);
    await update(projectId, { columns });
  }

  // ── Mover tarea en Kanban ─────────────────────────────────────────────────

  async function moveTask(taskId, columnId, newOrder = null) {
    const changes = { columnId };
    if (newOrder !== null) changes.order = newOrder;
    // Si la columna es 'done' → completar la tarea
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (task) {
      const proj = _findById(task.projectId);
      if (proj) {
        const col = proj.columns.find((c) => c.id === columnId);
        if (col && col.title.toLowerCase().includes('completad') && !task.completed) {
          await FlowTasks.complete(taskId);
          return;
        }
      }
    }
    await FlowTasks.update(taskId, changes);
  }

  // ── Miembros ──────────────────────────────────────────────────────────────

  async function addMember(projectId, userId, role = 'member') {
    const proj = _findById(projectId);
    if (!proj || proj.members.some((m) => m.userId === userId)) return;
    await update(projectId, { members: [...proj.members, { userId, role, joinedAt: new Date().toISOString() }] });
  }

  async function removeMember(projectId, userId) {
    const proj = _findById(projectId);
    if (!proj) return;
    await update(projectId, { members: proj.members.filter((m) => m.userId !== userId) });
  }

  async function updateMemberRole(projectId, userId, role) {
    const proj = _findById(projectId);
    if (!proj) return;
    await update(projectId, { members: proj.members.map((m) => m.userId === userId ? { ...m, role } : m) });
  }

  // ── Dependencias entre tareas ─────────────────────────────────────────────

  async function addDependency(taskId, dependsOnId) {
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (!task) return;
    const deps = task.dependencies || [];
    if (deps.includes(dependsOnId)) return;
    // Verificar ciclos
    if (_wouldCreateCycle(taskId, dependsOnId)) {
      FlowApp.toast('Esta dependencia crearía un ciclo', 'error');
      return;
    }
    await FlowTasks.update(taskId, { dependencies: [...deps, dependsOnId] });
  }

  async function removeDependency(taskId, dependsOnId) {
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (!task) return;
    await FlowTasks.update(taskId, { dependencies: (task.dependencies || []).filter((d) => d !== dependsOnId) });
  }

  function _wouldCreateCycle(taskId, dependsOnId, visited = new Set()) {
    if (dependsOnId === taskId) return true;
    if (visited.has(dependsOnId)) return false;
    visited.add(dependsOnId);
    const dep = FlowState.array.find('tasks.items', (t) => t.id === dependsOnId);
    return (dep?.dependencies || []).some((d) => _wouldCreateCycle(taskId, d, visited));
  }

  // ── Datos para Gantt ──────────────────────────────────────────────────────

  function getGanttData(projectId) {
    const tasks = FlowTasks.getForProject(projectId)
      .filter((t) => t.dueDate)
      .map((t) => ({
        id:           t.id,
        title:        t.title,
        start:        t.createdAt.split('T')[0],
        end:          t.dueDate,
        completed:    t.completed,
        priority:     t.priority,
        dependencies: t.dependencies || [],
        columnId:     t.columnId,
        assignedTo:   t.assignedTo,
      }));
    return tasks.sort((a, b) => a.start.localeCompare(b.start));
  }

  // ── Estadísticas del proyecto ─────────────────────────────────────────────

  function getStats(projectId) {
    const proj  = _findById(projectId);
    if (!proj) return null;
    const tasks = FlowTasks.getForProject(projectId);
    const total = tasks.length;
    const done  = tasks.filter((t) => t.completed).length;
    const overdue = tasks.filter((t) => {
      const today = new Date().toISOString().split('T')[0];
      return t.dueDate && t.dueDate < today && !t.completed;
    }).length;

    // Tareas por columna
    const byColumn = {};
    proj.columns.forEach((c) => {
      byColumn[c.id] = tasks.filter((t) => t.columnId === c.id).length;
    });

    const daysLeft = proj.endDate
      ? Math.ceil((new Date(proj.endDate) - new Date()) / 86400000)
      : null;

    return { total, done, pending: total - done, overdue, byColumn, daysLeft, progress: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  function getAll() {
    return (FlowState.get('projects.items') || []).filter((p) => !p.archived);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _findById(id) {
    return FlowState.array.find('projects.items', (p) => p.id === id);
  }

  function setActive(id) {
    FlowState.set('projects.activeId', id);
  }

  function getActive() {
    const id = FlowState.get('projects.activeId');
    return id ? _findById(id) : null;
  }

  return {
    create, update, remove, archive, complete,
    addColumn, updateColumn, removeColumn, reorderColumns,
    moveTask,
    addMember, removeMember, updateMemberRole,
    addDependency, removeDependency,
    getGanttData, getStats, getAll,
    setActive, getActive,
  };

})();
