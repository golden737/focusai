// ── FocusAI Habits ───────────────────────────────────────────────────────────
// Hábitos diarios, rachas (streaks), seguimiento y estadísticas.

window.FlowHabits = (() => {

  // ── Modelo de datos ───────────────────────────────────────────────────────
  /*
  Habit {
    id, name, description, icon, color,
    frequency: 'daily' | 'weekdays' | 'weekends' | number[] (días 0-6)
    targetCount: number (veces por día, default 1)
    reminderTime: 'HH:MM' | null
    streak: number, longestStreak: number,
    totalCompleted: number, startDate, archived, createdAt, updatedAt
  }
  HabitLog { id, habitId, date, count, note, createdAt }
  */

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function create(data = {}) {
    const now   = new Date().toISOString();
    const habit = {
      id:             FlowStorage.generateId('hab_'),
      name:           data.name           || 'Nuevo hábito',
      description:    data.description    || '',
      icon:           data.icon           || '⭐',
      color:          data.color          || '#6366f1',
      frequency:      data.frequency      || 'daily',
      targetCount:    data.targetCount    || 1,
      reminderTime:   data.reminderTime   || null,
      streak:         0,
      longestStreak:  0,
      totalCompleted: 0,
      startDate:      now.split('T')[0],
      archived:       false,
      createdAt:      now,
      updatedAt:      now,
    };

    await FlowStorage.save('habits', habit);
    FlowState.array.push('habits.items', habit);

    if (habit.reminderTime) _scheduleReminder(habit);

    FlowApp.toast(`Hábito "${habit.name}" creado`, 'success');
    return habit;
  }

  async function update(id, changes = {}) {
    const habit = _findById(id);
    if (!habit) return;
    const updated = { ...habit, ...changes, id, updatedAt: new Date().toISOString() };
    await FlowStorage.save('habits', updated);
    FlowState.array.updateItem('habits.items', (h) => h.id === id, updated);
    if (changes.reminderTime !== undefined) _scheduleReminder(updated);
    return updated;
  }

  async function remove(id) {
    await FlowStorage.remove('habits', id);
    FlowState.array.remove('habits.items', (h) => h.id === id);
    // Eliminar logs asociados
    const logs = (FlowState.get('habits.logs') || []).filter((l) => l.habitId === id);
    await Promise.all(logs.map((l) => FlowStorage.remove('habit_logs', l.id)));
    FlowState.array.remove('habits.logs', (l) => l.habitId === id);
  }

  async function archive(id) { await update(id, { archived: true }); }

  // ── Completar / descompletar ──────────────────────────────────────────────

  async function complete(habitId, date = null, note = '') {
    const today = date || new Date().toISOString().split('T')[0];
    const habit = _findById(habitId);
    if (!habit) return;

    // Verificar si ya está completo hoy
    const existing = _getLog(habitId, today);
    if (existing && existing.count >= habit.targetCount) {
      FlowApp.toast('Hábito ya completado hoy', 'info');
      return;
    }

    if (existing) {
      // Incrementar contador
      const updated = { ...existing, count: existing.count + 1 };
      await FlowStorage.save('habit_logs', updated);
      FlowState.array.updateItem('habits.logs', (l) => l.id === existing.id, updated);
    } else {
      // Crear nuevo log
      const log = {
        id:        FlowStorage.generateId('hl_'),
        habitId,
        date:      today,
        count:     1,
        note,
        createdAt: new Date().toISOString(),
      };
      await FlowStorage.save('habit_logs', log);
      FlowState.array.push('habits.logs', log);
    }

    // Recalcular racha
    const newStreak = _calculateStreak(habitId);
    const changes   = {
      streak:         newStreak,
      longestStreak:  Math.max(habit.longestStreak, newStreak),
      totalCompleted: habit.totalCompleted + 1,
    };
    await update(habitId, changes);

    // Gamificación
    FlowGamification.addXP(10, 'habit_complete');
    if (newStreak > 0 && newStreak % 7 === 0) {
      FlowGamification.unlockBadge(`streak_${newStreak}d`, `Racha de ${newStreak} días en "${habit.name}"`);
    }

    FlowApp.toast(`${habit.icon} "${habit.name}" completado${newStreak > 1 ? ` · Racha: ${newStreak} días 🔥` : ''}`, 'success');
  }

  async function uncomplete(habitId, date = null) {
    const today = date || new Date().toISOString().split('T')[0];
    const log   = _getLog(habitId, today);
    if (!log) return;

    if (log.count > 1) {
      const updated = { ...log, count: log.count - 1 };
      await FlowStorage.save('habit_logs', updated);
      FlowState.array.updateItem('habits.logs', (l) => l.id === log.id, updated);
    } else {
      await FlowStorage.remove('habit_logs', log.id);
      FlowState.array.remove('habits.logs', (l) => l.id === log.id);
    }

    const newStreak = _calculateStreak(habitId);
    const habit     = _findById(habitId);
    await update(habitId, {
      streak:         newStreak,
      totalCompleted: Math.max(0, (habit?.totalCompleted || 1) - 1),
    });
  }

  // ── Rachas ────────────────────────────────────────────────────────────────

  function _calculateStreak(habitId) {
    const habit  = _findById(habitId);
    if (!habit) return 0;

    const logs   = (FlowState.get('habits.logs') || [])
      .filter((l) => l.habitId === habitId)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (!logs.length) return 0;

    let streak  = 0;
    let current = new Date();
    current.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const dateStr = current.toISOString().split('T')[0];
      const log     = logs.find((l) => l.date === dateStr);
      const needed  = _isScheduledOn(habit, current);

      if (!needed) {
        // Día no programado → saltar sin romper racha
        current.setDate(current.getDate() - 1);
        continue;
      }

      if (log && log.count >= habit.targetCount) {
        streak++;
      } else if (i === 0) {
        // Hoy aún no completo → no contar, pero tampoco romper
      } else {
        break; // Racha rota
      }

      current.setDate(current.getDate() - 1);
    }

    return streak;
  }

  function _isScheduledOn(habit, date) {
    const dayOfWeek = date.getDay(); // 0=dom, 6=sab
    if (habit.frequency === 'daily')    return true;
    if (habit.frequency === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
    if (habit.frequency === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
    if (Array.isArray(habit.frequency)) return habit.frequency.includes(dayOfWeek);
    return true;
  }

  // ── Consultas ─────────────────────────────────────────────────────────────

  function getTodayHabits() {
    const today   = new Date();
    const todayStr = today.toISOString().split('T')[0];
    return (FlowState.get('habits.items') || [])
      .filter((h) => !h.archived && _isScheduledOn(h, today))
      .map((h) => {
        const log = _getLog(h.id, todayStr);
        return {
          ...h,
          todayCount:    log?.count || 0,
          todayComplete: (log?.count || 0) >= h.targetCount,
        };
      });
  }

  function getWeekGrid(habitId) {
    // Retorna los últimos 7 días con estado de completado
    const habit = _findById(habitId);
    if (!habit) return [];
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr   = d.toISOString().split('T')[0];
      const log       = _getLog(habitId, dateStr);
      const scheduled = _isScheduledOn(habit, d);
      result.push({
        date:      dateStr,
        day:       ['D','L','M','X','J','V','S'][d.getDay()],
        scheduled,
        count:     log?.count || 0,
        complete:  scheduled ? (log?.count || 0) >= habit.targetCount : null,
      });
    }
    return result;
  }

  function getMonthGrid(habitId, year, month) {
    const habit     = _findById(habitId);
    if (!habit) return [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const result      = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date    = new Date(year, month - 1, d);
      const dateStr = date.toISOString().split('T')[0];
      const log     = _getLog(habitId, dateStr);
      const sched   = _isScheduledOn(habit, date);
      result.push({
        day:      d,
        date:     dateStr,
        scheduled: sched,
        count:    log?.count || 0,
        complete: sched ? (log?.count || 0) >= habit.targetCount : null,
      });
    }
    return result;
  }

  function getCompletionRate(habitId, days = 30) {
    const habit = _findById(habitId);
    if (!habit) return 0;
    let scheduled = 0;
    let completed = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (!_isScheduledOn(habit, d)) continue;
      scheduled++;
      const log = _getLog(habit.id, d.toISOString().split('T')[0]);
      if (log && log.count >= habit.targetCount) completed++;
    }
    return scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
  }

  function getStats() {
    const habits    = (FlowState.get('habits.items') || []).filter((h) => !h.archived);
    const todayList = getTodayHabits();
    const done      = todayList.filter((h) => h.todayComplete).length;
    const bestStreak = habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);
    return {
      total:        habits.length,
      todayTotal:   todayList.length,
      todayDone:    done,
      todayRate:    todayList.length > 0 ? Math.round((done / todayList.length) * 100) : 0,
      bestStreak,
      totalCompleted: habits.reduce((s, h) => s + (h.totalCompleted || 0), 0),
    };
  }

  // ── Recordatorios ─────────────────────────────────────────────────────────

  function _scheduleReminder(habit) {
    if (!habit.reminderTime) return;
    FlowNotifications.scheduleHabit(habit);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _findById(id) {
    return FlowState.array.find('habits.items', (h) => h.id === id);
  }

  function _getLog(habitId, date) {
    return (FlowState.get('habits.logs') || []).find((l) => l.habitId === habitId && l.date === date);
  }

  return {
    create, update, remove, archive,
    complete, uncomplete,
    getTodayHabits, getWeekGrid, getMonthGrid,
    getCompletionRate, getStats,
  };

})();
