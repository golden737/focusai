// ── FocusAI Stats ────────────────────────────────────────────────────────────
// Métricas de productividad, datos para gráficos, reportes semanales/mensuales.

window.FlowStats = (() => {

  // ── Métricas generales ────────────────────────────────────────────────────

  function getDashboardMetrics() {
    const today     = new Date().toISOString().split('T')[0];
    const tasks     = FlowState.get('tasks.items')  || [];
    const habits    = FlowState.get('habits.items') || [];
    const goals     = FlowState.get('goals.items')  || [];
    const timeLogs  = FlowState.get('timer.logs')   || [];
    const gamif     = FlowState.get('gamification');

    // Tareas
    const todayTasks     = tasks.filter((t) => t.dueDate === today);
    const todayDone      = todayTasks.filter((t) => t.completed).length;
    const todayTotal     = todayTasks.length;
    const overdue        = tasks.filter((t) => t.dueDate && t.dueDate < today && !t.completed && !t.archived).length;
    const completedToday = tasks.filter((t) => t.completedAt?.startsWith(today)).length;

    // Tiempo
    const todayMin  = timeLogs.filter((l) => l.date === today).reduce((s, l) => s + l.durationMin, 0);
    const weekMin   = FlowTimer.getWeekMinutes();

    // Hábitos
    const habitStats = FlowHabits.getStats();

    // Objetivos
    const activeGoals = goals.filter((g) => !g.completed && !g.archived);
    const avgGoalProgress = activeGoals.length > 0
      ? Math.round(activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length)
      : 0;

    // Racha de productividad (días consecutivos con al menos 1 tarea completada)
    const productivityStreak = _getProductivityStreak(tasks);

    return {
      tasks:    { todayDone, todayTotal, overdue, completedToday },
      time:     { todayMin, weekMin, todayFormatted: FlowTimer.formatMinutes(todayMin), weekFormatted: FlowTimer.formatMinutes(weekMin) },
      habits:   habitStats,
      goals:    { active: activeGoals.length, avgProgress: avgGoalProgress },
      gamif:    { level: gamif?.level || 1, xp: gamif?.xp || 0, streak: gamif?.streak || 0 },
      productivity: { streak: productivityStreak },
    };
  }

  // ── Datos para gráficos ───────────────────────────────────────────────────

  /** Tareas completadas por día — últimos N días */
  function getTasksCompletedByDay(days = 7) {
    const tasks  = FlowState.get('tasks.items') || [];
    const result = _buildDateArray(days);
    tasks
      .filter((t) => t.completedAt)
      .forEach((t) => {
        const d = t.completedAt.split('T')[0];
        if (result[d] !== undefined) result[d]++;
      });
    return _toChartData(result, 'Tareas completadas');
  }

  /** Tiempo trabajado por día — últimos N días */
  function getTimeByDay(days = 7) {
    const logs   = FlowState.get('timer.logs') || [];
    const result = _buildDateArray(days);
    logs.forEach((l) => {
      if (result[l.date] !== undefined) result[l.date] += l.durationMin || 0;
    });
    // Convertir a horas con 1 decimal
    const chartData = _toChartData(result, 'Horas trabajadas');
    chartData.datasets[0].data = chartData.datasets[0].data.map((m) => Math.round(m / 60 * 10) / 10);
    return chartData;
  }

  /** Distribución de tareas por prioridad */
  function getTasksByPriority() {
    const tasks   = (FlowState.get('tasks.items') || []).filter((t) => !t.archived && !t.completed);
    const counts  = { high: 0, medium: 0, low: 0, none: 0 };
    tasks.forEach((t) => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
    return {
      labels: ['Alta 🔴', 'Media 🟡', 'Baja 🔵', 'Sin prioridad'],
      datasets: [{
        data:            [counts.high, counts.medium, counts.low, counts.none],
        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#64748b'],
        borderWidth:     0,
      }],
    };
  }

  /** Tiempo por proyecto — últimos 30 días */
  function getTimeByProject() {
    const logs     = FlowState.get('timer.logs')     || [];
    const projects = FlowState.get('projects.items') || [];
    const tasks    = FlowState.get('tasks.items')    || [];

    const byProject = {};
    logs.forEach((l) => {
      if (!l.taskId) return;
      const task = tasks.find((t) => t.id === l.taskId);
      if (!task?.projectId) return;
      byProject[task.projectId] = (byProject[task.projectId] || 0) + l.durationMin;
    });

    const labels  = [];
    const data    = [];
    const colors  = [];
    Object.entries(byProject).forEach(([pid, min]) => {
      const proj = projects.find((p) => p.id === pid);
      if (!proj) return;
      labels.push(proj.name);
      data.push(Math.round(min / 60 * 10) / 10);
      colors.push(proj.color || '#6366f1');
    });

    return { labels, datasets: [{ label: 'Horas', data, backgroundColor: colors, borderWidth: 0 }] };
  }

  /** Tasa de cumplimiento de hábitos — últimos 4 semanas */
  function getHabitComplianceByWeek() {
    const habits = (FlowState.get('habits.items') || []).filter((h) => !h.archived);
    const labels = [];
    const data   = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = _getMondayOfWeek(-w);
      labels.push(`Sem. ${4 - w}`);
      if (!habits.length) { data.push(0); continue; }
      const rates = habits.map((h) => {
        let sched = 0, done = 0;
        for (let d = 0; d < 7; d++) {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + d);
          if (date > new Date()) continue;
          const dateStr = date.toISOString().split('T')[0];
          const logs    = FlowState.get('habits.logs') || [];
          const log     = logs.find((l) => l.habitId === h.id && l.date === dateStr);
          sched++;
          if (log && log.count >= h.targetCount) done++;
        }
        return sched > 0 ? done / sched : 0;
      });
      data.push(Math.round(rates.reduce((s, r) => s + r, 0) / rates.length * 100));
    }
    return {
      labels,
      datasets: [{ label: '% Hábitos completados', data, backgroundColor: '#22c55e', borderRadius: 6 }],
    };
  }

  /** Productividad por hora del día (distribución de tiempo trabajado) */
  function getProductivityByHour() {
    const logs    = FlowState.get('timer.logs') || [];
    const byHour  = new Array(24).fill(0);
    logs.forEach((l) => {
      if (!l.startTime) return;
      const hour = parseInt(l.startTime.split(':')[0], 10);
      if (hour >= 0 && hour < 24) byHour[hour] += l.durationMin || 0;
    });
    return {
      labels:   Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`),
      datasets: [{ label: 'Min trabajados', data: byHour, backgroundColor: '#6366f1', borderRadius: 4 }],
    };
  }

  /** Comparativa semana actual vs semana anterior */
  function getWeekComparison() {
    const logs   = FlowState.get('timer.logs')  || [];
    const tasks  = FlowState.get('tasks.items') || [];
    const days   = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const thisWeekStart = _getMondayOfWeek(0);
    const lastWeekStart = _getMondayOfWeek(-1);

    const thisWeekMin = new Array(7).fill(0);
    const lastWeekMin = new Array(7).fill(0);
    const thisWeekDone = new Array(7).fill(0);
    const lastWeekDone = new Array(7).fill(0);

    for (let d = 0; d < 7; d++) {
      const thisDay = _addDaysToISO(thisWeekStart, d);
      const lastDay = _addDaysToISO(lastWeekStart, d);

      logs.filter((l) => l.date === thisDay).forEach((l) => { thisWeekMin[d] += l.durationMin || 0; });
      logs.filter((l) => l.date === lastDay).forEach((l) => { lastWeekMin[d] += l.durationMin || 0; });
      thisWeekDone[d] = tasks.filter((t) => t.completedAt?.startsWith(thisDay)).length;
      lastWeekDone[d] = tasks.filter((t) => t.completedAt?.startsWith(lastDay)).length;
    }

    return {
      labels: days,
      timeChart: {
        datasets: [
          { label: 'Esta semana (h)', data: thisWeekMin.map((m) => Math.round(m/60*10)/10), backgroundColor: '#6366f1', borderRadius: 4 },
          { label: 'Semana anterior (h)', data: lastWeekMin.map((m) => Math.round(m/60*10)/10), backgroundColor: '#a5b4fc', borderRadius: 4 },
        ],
      },
      tasksChart: {
        datasets: [
          { label: 'Esta semana', data: thisWeekDone, backgroundColor: '#22c55e', borderRadius: 4 },
          { label: 'Semana anterior', data: lastWeekDone, backgroundColor: '#86efac', borderRadius: 4 },
        ],
      },
    };
  }

  // ── Reporte de productividad (texto) ──────────────────────────────────────

  async function generateReport(period = 'week') {
    if (!FlowAI.isConfigured()) {
      return _buildLocalReport(period);
    }
    const metrics = getDashboardMetrics();
    const text    = await FlowAI.chat(
      `Genera un informe de productividad para el periodo: ${period === 'week' ? 'esta semana' : 'este mes'}.
       Métricas: ${JSON.stringify(metrics)}
       Incluye: resumen ejecutivo, logros destacados, áreas de mejora, y 3 recomendaciones.`
    );
    return text.text || '';
  }

  function _buildLocalReport(period) {
    const m = getDashboardMetrics();
    return `📊 Resumen ${period === 'week' ? 'semanal' : 'mensual'}:
• Tareas completadas hoy: ${m.tasks.completedToday}
• Tiempo trabajado hoy: ${m.time.todayFormatted}
• Tiempo esta semana: ${m.time.weekFormatted}
• Hábitos hoy: ${m.habits.todayDone}/${m.habits.todayTotal} (${m.habits.todayRate}%)
• Objetivos activos: ${m.goals.active} (progreso medio: ${m.goals.avgProgress}%)
• Nivel: ${m.gamif.level} | XP: ${m.gamif.xp}`;
  }

  // ── Racha de productividad ────────────────────────────────────────────────

  function _getProductivityStreak(tasks) {
    let streak  = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d     = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const done = tasks.some((t) => t.completedAt?.startsWith(dateStr));
      if (done) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _buildDateArray(days) {
    const result = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      result[d.toISOString().split('T')[0]] = 0;
    }
    return result;
  }

  function _toChartData(obj, label) {
    const labels  = Object.keys(obj).map((d) => {
      const date = new Date(d + 'T12:00:00');
      return date.toLocaleDateString('es', { weekday: 'short', day: 'numeric' });
    });
    return {
      labels,
      datasets: [{ label, data: Object.values(obj), backgroundColor: '#6366f1', borderRadius: 6 }],
    };
  }

  function _getMondayOfWeek(weeksOffset = 0) {
    const d   = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1 + weeksOffset * 7);
    return d.toISOString().split('T')[0];
  }

  function _addDaysToISO(isoDate, days) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  return {
    getDashboardMetrics,
    getTasksCompletedByDay, getTimeByDay,
    getTasksByPriority, getTimeByProject,
    getHabitComplianceByWeek, getProductivityByHour,
    getWeekComparison, generateReport,
  };

})();
