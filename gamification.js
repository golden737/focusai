// ── FocusAI Gamification ─────────────────────────────────────────────────────
// Puntos XP, niveles, insignias, desafíos semanales y recompensas.

window.FlowGamification = (() => {

  // XP necesario para subir de nivel (escala progresiva)
  const xpForLevel = (level) => level * 100;

  // Catálogo de insignias
  const BADGES = [
    { id: 'first_task',     name: 'Primera tarea',      emoji: '✅', desc: 'Completaste tu primera tarea', xp: 20 },
    { id: 'task_10',        name: 'Imparable',           emoji: '🔥', desc: '10 tareas completadas',       xp: 50 },
    { id: 'task_50',        name: 'Máquina',             emoji: '⚡', desc: '50 tareas completadas',       xp: 100 },
    { id: 'task_100',       name: 'Centurión',           emoji: '🏆', desc: '100 tareas completadas',      xp: 200 },
    { id: 'streak_7d',      name: 'Semana perfecta',     emoji: '📅', desc: 'Racha de 7 días en un hábito', xp: 75 },
    { id: 'streak_30d',     name: 'Mes de hierro',       emoji: '💪', desc: 'Racha de 30 días en un hábito',xp: 200 },
    { id: 'pomodoro_10',    name: 'Tomate pro',          emoji: '🍅', desc: '10 pomodoros completados',    xp: 60 },
    { id: 'pomodoro_50',    name: 'Maestro del tiempo',  emoji: '⏰', desc: '50 pomodoros completados',    xp: 150 },
    { id: 'goal_first',     name: 'Visionario',          emoji: '🎯', desc: 'Completaste tu primer objetivo',xp: 100 },
    { id: 'project_first',  name: 'Gestor nato',         emoji: '📁', desc: 'Completaste tu primer proyecto',xp: 150 },
    { id: 'focus_60',       name: 'Estado de flujo',     emoji: '🌊', desc: '1 hora seguida en modo enfoque',xp: 80 },
    { id: 'journal_7',      name: 'Reflexivo',           emoji: '📔', desc: '7 entradas de diario',        xp: 50 },
    { id: 'early_bird',     name: 'Madrugador',          emoji: '🌅', desc: 'Completaste una tarea antes de las 8am',xp: 30 },
    { id: 'night_owl',      name: 'Noctámbulo',          emoji: '🦉', desc: 'Completaste una tarea después de las 10pm',xp: 30 },
    { id: 'all_habits',     name: 'Día perfecto',        emoji: '⭐', desc: 'Todos los hábitos del día completados',xp: 40 },
    { id: 'level_5',        name: 'Aprendiz',            emoji: '🥉', desc: 'Alcanzaste el nivel 5',       xp: 0 },
    { id: 'level_10',       name: 'Productivo',          emoji: '🥈', desc: 'Alcanzaste el nivel 10',      xp: 0 },
    { id: 'level_20',       name: 'Experto',             emoji: '🥇', desc: 'Alcanzaste el nivel 20',      xp: 0 },
    { id: 'level_50',       name: 'Leyenda',             emoji: '👑', desc: 'Alcanzaste el nivel 50',      xp: 0 },
  ];

  // Desafíos semanales predefinidos
  const CHALLENGE_TEMPLATES = [
    { id: 'w_tasks_20',    name: 'Semana productiva',   desc: 'Completa 20 tareas esta semana',  target: 20, type: 'tasks',    xp: 100 },
    { id: 'w_pomodoro_10', name: 'Maestro del ritmo',   desc: '10 pomodoros esta semana',        target: 10, type: 'pomodoro', xp: 80  },
    { id: 'w_habits_7',    name: 'Hábitos perfectos',   desc: '7 días con todos los hábitos',    target: 7,  type: 'habits',   xp: 120 },
    { id: 'w_focus_5h',    name: 'Deep worker',         desc: '5 horas en modo enfoque',         target: 300,type: 'focus',    xp: 100 },
    { id: 'w_journal_5',   name: 'Semana reflexiva',    desc: '5 entradas de diario',            target: 5,  type: 'journal',  xp: 60  },
    { id: 'w_goals_1',     name: 'Logrador',            desc: 'Completa un objetivo esta semana',target: 1,  type: 'goals',    xp: 150 },
  ];

  // ── Inicialización ────────────────────────────────────────────────────────

  async function init() {
    // Cargar gamificación guardada
    const saved = await FlowStorage.getMeta('gamification');
    if (saved?.value) {
      FlowState.update('gamification', saved.value);
    }

    // Generar desafíos de la semana si no existen
    _ensureWeeklyChallenges();

    // Verificar insignias pendientes
    setTimeout(_checkAutoTriggerBadges, 2000);
  }

  // ── XP y niveles ──────────────────────────────────────────────────────────

  async function addXP(amount, reason = '') {
    const current = FlowState.get('gamification') || {};
    let xp     = (current.xp    || 0) + amount;
    let level  = current.level  || 1;

    // Verificar subida de nivel
    let leveledUp = false;
    while (xp >= xpForLevel(level)) {
      xp    -= xpForLevel(level);
      level += 1;
      leveledUp = true;
    }

    const updated = {
      ...current,
      xp,
      level,
      totalTasks: current.totalTasks || 0,
      weekPoints: (current.weekPoints || 0) + amount,
    };

    FlowState.update('gamification', updated);
    await _persist(updated);

    if (leveledUp) {
      _onLevelUp(level);
    }

    // Verificar insignias de nivel
    if (level >= 5  && !hasBadge('level_5'))  unlockBadge('level_5');
    if (level >= 10 && !hasBadge('level_10')) unlockBadge('level_10');
    if (level >= 20 && !hasBadge('level_20')) unlockBadge('level_20');
    if (level >= 50 && !hasBadge('level_50')) unlockBadge('level_50');

    // Actualizar progreso de desafíos
    _updateChallengeProgress(reason, amount);
  }

  function _onLevelUp(newLevel) {
    FlowApp.toast(`🎉 ¡Subiste al nivel ${newLevel}!`, 'success', { duration: 5000 });
    FlowNotifications.pushLocal(`🎉 ¡Nivel ${newLevel}!`, `Has alcanzado el nivel ${newLevel} en FocusAI`);

    // Confeti visual (si hay función disponible)
    window.dispatchEvent(new CustomEvent('focusai:levelup', { detail: { level: newLevel } }));
  }

  // ── Insignias ─────────────────────────────────────────────────────────────

  async function unlockBadge(badgeId, customDesc = '') {
    if (hasBadge(badgeId)) return; // Ya desbloqueada

    const badge = BADGES.find((b) => b.id === badgeId);
    if (!badge) return;

    const current = FlowState.get('gamification') || {};
    const badges  = [...(current.badges || []), {
      id:          badge.id,
      unlockedAt:  new Date().toISOString(),
      desc:        customDesc || badge.desc,
    }];

    const updated = { ...current, badges };
    FlowState.update('gamification', updated);
    await _persist(updated);

    // XP bonus por insignia
    if (badge.xp > 0) await addXP(badge.xp, 'badge');

    FlowApp.toast(`${badge.emoji} Insignia desbloqueada: ${badge.name}`, 'success', { duration: 5000 });
    window.dispatchEvent(new CustomEvent('focusai:badge', { detail: badge }));
  }

  function hasBadge(badgeId) {
    const badges = FlowState.get('gamification.badges') || [];
    return badges.some((b) => b.id === badgeId);
  }

  function getBadges() {
    const unlocked = FlowState.get('gamification.badges') || [];
    return BADGES.map((b) => ({
      ...b,
      unlocked:    unlocked.some((u) => u.id === b.id),
      unlockedAt:  unlocked.find((u) => u.id === b.id)?.unlockedAt || null,
    }));
  }

  // ── Desafíos semanales ────────────────────────────────────────────────────

  function _ensureWeeklyChallenges() {
    const current  = FlowState.get('gamification') || {};
    const challenges = current.challenges || [];
    const weekKey  = _getWeekKey();

    const weekChallenges = challenges.filter((c) => c.weekKey === weekKey);
    if (weekChallenges.length >= 3) return; // Ya existen

    // Seleccionar 3 desafíos aleatorios para esta semana
    const shuffled = [...CHALLENGE_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 3);
    const newChallenges = shuffled.map((t) => ({
      ...t,
      weekKey,
      progress: 0,
      completed: false,
    }));

    const updated = { ...current, challenges: [...challenges.filter((c) => c.weekKey !== weekKey), ...newChallenges] };
    FlowState.update('gamification', updated);
    _persist(updated);
  }

  function getWeeklyChallenges() {
    const weekKey    = _getWeekKey();
    const challenges = FlowState.get('gamification.challenges') || [];
    return challenges.filter((c) => c.weekKey === weekKey);
  }

  function _updateChallengeProgress(reason, amount) {
    const challenges = getWeeklyChallenges();
    let changed = false;

    challenges.forEach((c) => {
      if (c.completed) return;
      let add = 0;
      if (c.type === 'tasks'    && reason === 'task_complete')    add = 1;
      if (c.type === 'pomodoro' && reason === 'pomodoro_complete') add = 1;
      if (c.type === 'focus'    && reason === 'focus_session')    add = amount;
      if (c.type === 'journal'  && reason === 'journal_entry')    add = 1;
      if (c.type === 'goals'    && reason === 'goal_complete')    add = 1;
      if (c.type === 'habits'   && reason === 'habit_complete') {
        // Verificar si todos los hábitos del día están completos
        const stats = FlowHabits.getStats();
        if (stats.todayRate === 100) add = 1;
      }

      if (add > 0) {
        c.progress = Math.min(c.target, (c.progress || 0) + add);
        changed = true;
        if (c.progress >= c.target && !c.completed) {
          c.completed = true;
          _onChallengeComplete(c);
        }
      }
    });

    if (changed) {
      const current  = FlowState.get('gamification') || {};
      const weekKey  = _getWeekKey();
      const updated  = {
        ...current,
        challenges: (current.challenges || []).map((c) =>
          c.weekKey === weekKey ? (challenges.find((wc) => wc.id === c.id) || c) : c
        ),
      };
      FlowState.update('gamification', updated);
      _persist(updated);
    }
  }

  function _onChallengeComplete(challenge) {
    addXP(challenge.xp, 'challenge');
    FlowApp.toast(`🏅 ¡Desafío completado: ${challenge.name}! +${challenge.xp} XP`, 'success', { duration: 6000 });
  }

  // ── Auto-verificación de insignias ────────────────────────────────────────

  function _checkAutoTriggerBadges() {
    const tasks  = FlowState.get('tasks.items')  || [];
    const done   = tasks.filter((t) => t.completed).length;
    if (done >= 1   && !hasBadge('first_task')) unlockBadge('first_task');
    if (done >= 10  && !hasBadge('task_10'))    unlockBadge('task_10');
    if (done >= 50  && !hasBadge('task_50'))    unlockBadge('task_50');
    if (done >= 100 && !hasBadge('task_100'))   unlockBadge('task_100');

    // Hábitos: todos completados hoy
    const habitStats = FlowHabits.getStats();
    if (habitStats.todayRate === 100 && habitStats.todayTotal > 0 && !hasBadge('all_habits')) {
      unlockBadge('all_habits');
    }
  }

  // ── Estadísticas ──────────────────────────────────────────────────────────

  function getStats() {
    const g = FlowState.get('gamification') || {};
    const level     = g.level || 1;
    const xp        = g.xp   || 0;
    const needed    = xpForLevel(level);
    const pct       = Math.round((xp / needed) * 100);
    const unlocked  = (g.badges || []).length;
    const total     = BADGES.length;
    return {
      level, xp, needed, pct,
      badgesUnlocked: unlocked,
      badgesTotal:    total,
      weekPoints:     g.weekPoints || 0,
      challenges:     getWeeklyChallenges(),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function _persist(data) {
    await FlowStorage.setMeta('gamification', data);
  }

  function _getWeekKey() {
    const d   = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().split('T')[0]; // fecha del lunes de la semana
  }

  return {
    init,
    addXP, unlockBadge, hasBadge, getBadges,
    getWeeklyChallenges, getStats,
    BADGES, CHALLENGE_TEMPLATES,
  };

})();
