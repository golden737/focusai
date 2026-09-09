// ── FocusAI Goals ────────────────────────────────────────────────────────────
// Objetivos SMART, seguimiento de progreso, desglose en tareas.

window.FlowGoals = (() => {

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function create(data = {}) {
    const now  = new Date().toISOString();
    const goal = {
      id:           FlowStorage.generateId('goal_'),
      title:        data.title        || 'Nuevo objetivo',
      description:  data.description  || '',
      type:         data.type         || 'short', // 'short' | 'long'
      // SMART fields
      specific:     data.specific     || '',
      measurable:   data.measurable   || '',
      achievable:   data.achievable   || '',
      relevant:     data.relevant     || '',
      targetDate:   data.targetDate   || null,    // Time-bound
      // Progreso
      progress:     data.progress     || 0,       // 0-100
      milestones:   data.milestones   || [],       // [{ id, title, completed, date }]
      // Relaciones
      parentGoalId: data.parentGoalId || null,
      taskIds:      data.taskIds      || [],
      color:        data.color        || '#6366f1',
      icon:         data.icon         || '🎯',
      completed:    false,
      completedAt:  null,
      archived:     false,
      createdAt:    now,
      updatedAt:    now,
    };

    await FlowStorage.save('goals', goal);
    FlowState.array.push('goals.items', goal);
    FlowApp.toast(`Objetivo "${goal.title}" creado`, 'success');
    return goal;
  }

  async function update(id, changes = {}) {
    const goal = _findById(id);
    if (!goal) return;
    const updated = { ...goal, ...changes, id, updatedAt: new Date().toISOString() };
    await FlowStorage.save('goals', updated);
    FlowState.array.updateItem('goals.items', (g) => g.id === id, updated);
    return updated;
  }

  async function remove(id) {
    await FlowStorage.remove('goals', id);
    FlowState.array.remove('goals.items', (g) => g.id === id);
  }

  async function archive(id) { await update(id, { archived: true }); }

  async function complete(id) {
    await update(id, { completed: true, completedAt: new Date().toISOString(), progress: 100 });
    FlowGamification.addXP(50, 'goal_complete');
    FlowApp.toast('🎯 ¡Objetivo completado! +50 XP', 'success', { duration: 4000 });
  }

  // ── Progreso ──────────────────────────────────────────────────────────────

  async function setProgress(id, value) {
    const progress = Math.max(0, Math.min(100, Math.round(value)));
    await update(id, { progress });
    if (progress >= 100) await complete(id);
  }

  /** Recalcular progreso automáticamente basado en tareas vinculadas */
  async function recalculateProgress(goalId) {
    const goal = _findById(goalId);
    if (!goal || !goal.taskIds.length) return;

    const tasks      = FlowTasks.getForGoal(goalId);
    const total      = tasks.length;
    const completed  = tasks.filter((t) => t.completed).length;
    const newProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

    await setProgress(goalId, newProgress);
  }

  // ── Hitos (milestones) ────────────────────────────────────────────────────

  async function addMilestone(goalId, title, date = null) {
    const goal = _findById(goalId);
    if (!goal) return;
    const milestone = {
      id:        FlowStorage.generateId('ms_'),
      title,
      completed: false,
      date,
      completedAt: null,
    };
    await update(goalId, { milestones: [...goal.milestones, milestone] });
    return milestone;
  }

  async function toggleMilestone(goalId, milestoneId) {
    const goal = _findById(goalId);
    if (!goal) return;
    const milestones = goal.milestones.map((m) =>
      m.id === milestoneId
        ? { ...m, completed: !m.completed, completedAt: !m.completed ? new Date().toISOString() : null }
        : m
    );
    await update(goalId, { milestones });
    // Recalcular progreso basado en hitos
    const total     = milestones.length;
    const done      = milestones.filter((m) => m.completed).length;
    if (total > 0) await setProgress(goalId, (done / total) * 100);
  }

  // ── Vincular tareas ───────────────────────────────────────────────────────

  async function linkTask(goalId, taskId) {
    const goal = _findById(goalId);
    if (!goal || goal.taskIds.includes(taskId)) return;
    await update(goalId, { taskIds: [...goal.taskIds, taskId] });
    await FlowTasks.update(taskId, { goalId });
  }

  async function unlinkTask(goalId, taskId) {
    const goal = _findById(goalId);
    if (!goal) return;
    await update(goalId, { taskIds: goal.taskIds.filter((id) => id !== taskId) });
    await FlowTasks.update(taskId, { goalId: null });
  }

  /** Desglosar un objetivo en tareas usando la IA */
  async function breakdownWithAI(goalId) {
    if (!FlowAI.isConfigured()) { FlowApp.toast('Configura tu API key para usar esta función', 'warning'); return; }
    const goal = _findById(goalId);
    if (!goal) return;

    FlowApp.toast('La IA está generando tareas…', 'info', { duration: 6000 });
    try {
      const result = await FlowAI.chat(
        `Desglosa el siguiente objetivo en 5-7 tareas concretas y accionables. 
         Para cada tarea usa la acción CREATE_TASK con el goalId="${goalId}".
         Objetivo: "${goal.title}"
         Descripción: "${goal.description || 'Sin descripción'}"
         Fecha límite: ${goal.targetDate || 'Sin fecha'}`
      );
      FlowApp.toast('✨ Tareas generadas', 'success');
      return result;
    } catch (e) {
      FlowApp.toast(e.message, 'error');
    }
  }

  // ── Consultas ─────────────────────────────────────────────────────────────

  function getFiltered() {
    const goals  = FlowState.get('goals.items') || [];
    const filter = FlowState.get('goals.filter') || 'all';
    let result = goals.filter((g) => !g.archived);
    if (filter === 'short')     result = result.filter((g) => g.type === 'short');
    if (filter === 'long')      result = result.filter((g) => g.type === 'long');
    if (filter === 'completed') result = result.filter((g) => g.completed);
    if (filter === 'active')    result = result.filter((g) => !g.completed);
    return result.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.targetDate || '9999') < (b.targetDate || '9999') ? -1 : 1;
    });
  }

  function getDaysRemaining(goalId) {
    const goal = _findById(goalId);
    if (!goal?.targetDate) return null;
    const diff = new Date(goal.targetDate) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function getStats() {
    const goals     = (FlowState.get('goals.items') || []).filter((g) => !g.archived);
    const total     = goals.length;
    const completed = goals.filter((g) => g.completed).length;
    const avgProgress = total > 0
      ? Math.round(goals.filter((g) => !g.completed).reduce((s, g) => s + g.progress, 0) / (total - completed || 1))
      : 0;
    const overdue = goals.filter((g) => {
      if (!g.targetDate || g.completed) return false;
      return new Date(g.targetDate) < new Date();
    }).length;
    return { total, completed, active: total - completed, avgProgress, overdue };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _findById(id) {
    return FlowState.array.find('goals.items', (g) => g.id === id);
  }

  return {
    create, update, remove, archive, complete,
    setProgress, recalculateProgress,
    addMilestone, toggleMilestone,
    linkTask, unlinkTask, breakdownWithAI,
    getFiltered, getDaysRemaining, getStats,
  };

})();
