// ── FocusAI Timer ────────────────────────────────────────────────────────────
// Cronómetro, Pomodoro, registro manual de horas, historial y tiempo por tarea.

window.FlowTimer = (() => {

  let _interval   = null;
  let _startedAt  = null;   // timestamp cuando se inició/reanudó

  // ── Stopwatch ─────────────────────────────────────────────────────────────

  function startStopwatch(taskId = null) {
    if (FlowState.get('timer.status') === 'running') return;
    _startedAt = Date.now() - (FlowState.get('timer.elapsed') || 0) * 1000;
    FlowState.batch(() => {
      FlowState.set('timer.mode',   'stopwatch');
      FlowState.set('timer.status', 'running');
      if (taskId) FlowState.set('timer.activeTaskId', taskId);
    });
    _tick();
  }

  function pauseTimer() {
    if (FlowState.get('timer.status') !== 'running') return;
    clearInterval(_interval);
    _interval = null;
    FlowState.set('timer.status', 'paused');
  }

  function resumeTimer() {
    if (FlowState.get('timer.status') !== 'paused') return;
    _startedAt = Date.now() - FlowState.get('timer.elapsed') * 1000;
    FlowState.set('timer.status', 'running');
    _tick();
  }

  async function stopTimer(save = true) {
    const elapsed = FlowState.get('timer.elapsed') || 0;
    clearInterval(_interval);
    _interval = null;

    if (save && elapsed > 10) {
      await _saveLog({
        durationMin: Math.round(elapsed / 60),
        taskId:      FlowState.get('timer.activeTaskId'),
        mode:        FlowState.get('timer.mode'),
      });
    }

    FlowState.batch(() => {
      FlowState.set('timer.status',      'idle');
      FlowState.set('timer.elapsed',     0);
      FlowState.set('timer.activeTaskId', null);
    });
  }

  function _tick() {
    clearInterval(_interval);
    _interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - _startedAt) / 1000);
      FlowState.set('timer.elapsed', elapsed);
    }, 1000);
  }

  // ── Pomodoro ──────────────────────────────────────────────────────────────

  function startPomodoro(taskId = null) {
    const settings = FlowState.get('timer.settings');
    FlowState.batch(() => {
      FlowState.set('timer.mode',          'pomodoro');
      FlowState.set('timer.pomodoroPhase', 'work');
      FlowState.set('timer.elapsed',       0);
      FlowState.set('timer.status',        'running');
      if (taskId) FlowState.set('timer.activeTaskId', taskId);
    });
    _startedAt = Date.now();
    _tickPomodoro(settings.workDuration);
  }

  function _tickPomodoro(totalSeconds) {
    clearInterval(_interval);
    const endAt = Date.now() + totalSeconds * 1000;

    _interval = setInterval(async () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      FlowState.set('timer.elapsed', totalSeconds - remaining);

      if (remaining <= 0) {
        clearInterval(_interval);
        await _onPomodoroPhaseEnd();
      }
    }, 1000);
  }

  async function _onPomodoroPhaseEnd() {
    const settings  = FlowState.get('timer.settings');
    const phase     = FlowState.get('timer.pomodoroPhase');
    const count     = FlowState.get('timer.pomodoroCount');
    const soundOn   = settings.soundEnabled;

    if (soundOn) _playSound('bell');

    if (phase === 'work') {
      const newCount = count + 1;
      FlowState.set('timer.pomodoroCount', newCount);

      // Guardar log de la sesión de trabajo
      await _saveLog({
        durationMin: Math.round(settings.workDuration / 60),
        taskId:      FlowState.get('timer.activeTaskId'),
        mode:        'pomodoro',
        phase:       'work',
        session:     newCount,
      });

      // XP por completar un pomodoro
      FlowGamification.addXP(15, 'pomodoro_complete');

      // Decidir tipo de descanso
      const isLong = newCount % settings.sessionsUntilLong === 0;
      const breakDuration = isLong ? settings.longBreakDuration : settings.shortBreakDuration;
      const breakPhase    = isLong ? 'long-break' : 'short-break';

      FlowApp.toast(`🍅 ¡Pomodoro ${newCount} completado! Tómate un ${isLong ? 'descanso largo' : 'descanso corto'}.`, 'success', { duration: 5000 });
      FlowNotifications.pushLocal('FocusAI', `¡Pomodoro completado! Tiempo de descanso.`);

      if (settings.autoStartBreaks) {
        FlowState.batch(() => {
          FlowState.set('timer.pomodoroPhase', breakPhase);
          FlowState.set('timer.elapsed', 0);
          FlowState.set('timer.status', 'break');
        });
        _startedAt = Date.now();
        _tickPomodoro(breakDuration);
      } else {
        FlowState.set('timer.status', 'idle');
      }

    } else {
      // Fin del descanso
      FlowApp.toast('⏰ Descanso terminado. ¡A trabajar!', 'info', { duration: 4000 });
      FlowNotifications.pushLocal('FocusAI', 'Descanso terminado. ¡Vamos!');

      if (settings.autoStartWork) {
        FlowState.batch(() => {
          FlowState.set('timer.pomodoroPhase', 'work');
          FlowState.set('timer.elapsed', 0);
          FlowState.set('timer.status', 'running');
        });
        _startedAt = Date.now();
        _tickPomodoro(settings.workDuration);
      } else {
        FlowState.set('timer.status', 'idle');
      }
    }
  }

  function skipPhase() {
    clearInterval(_interval);
    _onPomodoroPhaseEnd();
  }

  function resetPomodoro() {
    clearInterval(_interval);
    FlowState.batch(() => {
      FlowState.set('timer.status',        'idle');
      FlowState.set('timer.elapsed',       0);
      FlowState.set('timer.pomodoroPhase', 'work');
      FlowState.set('timer.pomodoroCount', 0);
      FlowState.set('timer.activeTaskId',  null);
    });
  }

  // ── Registro manual ───────────────────────────────────────────────────────

  async function logManual({ date, startTime, endTime, taskId, projectId, description }) {
    const start = new Date(`${date}T${startTime}`);
    const end   = new Date(`${date}T${endTime}`);
    if (end <= start) { FlowApp.toast('La hora de fin debe ser mayor que la de inicio', 'error'); return; }
    const durationMin = Math.round((end - start) / 60000);
    return _saveLog({ date, durationMin, taskId, projectId, description, mode: 'manual', startTime, endTime });
  }

  async function _saveLog(data) {
    const today = new Date().toISOString().split('T')[0];
    const log = {
      id:          FlowStorage.generateId('log_'),
      date:        data.date        || today,
      durationMin: data.durationMin || 0,
      taskId:      data.taskId      || null,
      projectId:   data.projectId   || null,
      description: data.description || '',
      mode:        data.mode        || 'stopwatch',
      phase:       data.phase       || null,
      session:     data.session     || null,
      startTime:   data.startTime   || null,
      endTime:     data.endTime     || null,
      createdAt:   new Date().toISOString(),
    };

    await FlowStorage.save('time_logs', log);
    FlowState.array.push('timer.logs', log);

    // Si la tarea tiene seguimiento, actualizar tiempo real
    if (log.taskId) {
      const task = FlowState.array.find('tasks.items', (t) => t.id === log.taskId);
      if (task) {
        const currentActual = task.actualMin || 0;
        await FlowTasks.update(log.taskId, { actualMin: currentActual + log.durationMin });
      }
    }

    return log;
  }

  async function deleteLog(id) {
    await FlowStorage.remove('time_logs', id);
    FlowState.array.remove('timer.logs', (l) => l.id === id);
  }

  // ── Consultas de historial ────────────────────────────────────────────────

  function getLogsForDate(date) {
    return (FlowState.get('timer.logs') || []).filter((l) => l.date === date);
  }

  function getLogsForTask(taskId) {
    return (FlowState.get('timer.logs') || []).filter((l) => l.taskId === taskId);
  }

  function getLogsForProject(projectId) {
    return (FlowState.get('timer.logs') || []).filter((l) => l.projectId === projectId);
  }

  function getTodayMinutes() {
    const today = new Date().toISOString().split('T')[0];
    return (FlowState.get('timer.logs') || [])
      .filter((l) => l.date === today)
      .reduce((sum, l) => sum + (l.durationMin || 0), 0);
  }

  function getWeekMinutes() {
    const logs   = FlowState.get('timer.logs') || [];
    const monday = _getMondayISO();
    const sunday = _getSundayISO();
    return logs
      .filter((l) => l.date >= monday && l.date <= sunday)
      .reduce((sum, l) => sum + (l.durationMin || 0), 0);
  }

  function getStatsByDay(days = 7) {
    const logs   = FlowState.get('timer.logs') || [];
    const result = {};
    for (let i = 0; i < days; i++) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      result[key] = logs.filter((l) => l.date === key).reduce((s, l) => s + (l.durationMin || 0), 0);
    }
    return result;
  }

  // ── Formato de tiempo ─────────────────────────────────────────────────────

  function format(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${_pad(m)}:${_pad(s)}`;
    return `${_pad(m)}:${_pad(s)}`;
  }

  function formatMinutes(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function getRemainingSeconds() {
    const settings = FlowState.get('timer.settings');
    const phase    = FlowState.get('timer.pomodoroPhase');
    const elapsed  = FlowState.get('timer.elapsed') || 0;
    const total    = phase === 'work' ? settings.workDuration
      : phase === 'long-break' ? settings.longBreakDuration
      : settings.shortBreakDuration;
    return Math.max(0, total - elapsed);
  }

  // ── Sonido ────────────────────────────────────────────────────────────────

  function _playSound(type) {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type      = type === 'bell' ? 'sine' : 'square';
      osc.frequency.value = type === 'bell' ? 880 : 440;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.2);
    } catch {}
  }

  // ── Helpers de fecha ──────────────────────────────────────────────────────

  function _pad(n) { return String(n).padStart(2, '0'); }

  function _getMondayISO() {
    const d   = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().split('T')[0];
  }

  function _getSundayISO() {
    const d   = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 7);
    return d.toISOString().split('T')[0];
  }

  return {
    startStopwatch, pauseTimer, resumeTimer, stopTimer,
    startPomodoro, skipPhase, resetPomodoro,
    logManual, deleteLog,
    getLogsForDate, getLogsForTask, getLogsForProject,
    getTodayMinutes, getWeekMinutes, getStatsByDay,
    format, formatMinutes, getRemainingSeconds,
  };

})();
