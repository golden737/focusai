// ── FocusAI Personal ─────────────────────────────────────────────────────────
// Diario personal, registro de emociones, estado de ánimo, gratitud.

window.FlowPersonal = (() => {

  const MOODS = [
    { id: 5, emoji: '😄', label: 'Excelente', color: '#22c55e' },
    { id: 4, emoji: '🙂', label: 'Bien',      color: '#84cc16' },
    { id: 3, emoji: '😐', label: 'Regular',   color: '#f59e0b' },
    { id: 2, emoji: '😕', label: 'Bajo',      color: '#f97316' },
    { id: 1, emoji: '😔', label: 'Mal',       color: '#ef4444' },
  ];

  const EMOTIONS = [
    'Motivado', 'Tranquilo', 'Concentrado', 'Creativo', 'Cansado',
    'Estresado', 'Ansioso', 'Feliz', 'Frustrado', 'Esperanzador',
    'Satisfecho', 'Abrumado', 'Agradecido', 'Entusiasmado', 'Reflexivo',
  ];

  // ── Diario ────────────────────────────────────────────────────────────────

  async function saveEntry({ date, content, mood, emotions, gratitude, highlights, improvements }) {
    const today   = date || new Date().toISOString().split('T')[0];
    const entries = FlowState.get('personal.entries') || [];
    const existing = entries.find((e) => e.date === today);

    const entry = {
      id:           existing?.id || FlowStorage.generateId('journal_'),
      date:         today,
      content:      content       || '',
      mood:         mood          ?? null,
      emotions:     emotions      || [],
      gratitude:    gratitude     || [],   // array de strings (hasta 3)
      highlights:   highlights    || '',
      improvements: improvements  || '',
      wordCount:    (content || '').trim().split(/\s+/).filter(Boolean).length,
      createdAt:    existing?.createdAt || new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    await FlowStorage.save('journal', entry);

    if (existing) {
      FlowState.array.updateItem('personal.entries', (e) => e.id === existing.id, entry);
    } else {
      FlowState.array.push('personal.entries', entry);
      FlowGamification.addXP(5, 'journal_entry');
    }

    FlowApp.toast('Entrada guardada', 'success');
    return entry;
  }

  async function deleteEntry(id) {
    await FlowStorage.remove('journal', id);
    FlowState.array.remove('personal.entries', (e) => e.id === id);
  }

  function getEntry(date) {
    return (FlowState.get('personal.entries') || []).find((e) => e.date === date) || null;
  }

  function getTodayEntry() {
    return getEntry(new Date().toISOString().split('T')[0]);
  }

  function getRecentEntries(days = 7) {
    const since   = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    return (FlowState.get('personal.entries') || [])
      .filter((e) => e.date >= sinceStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ── Estado de ánimo ───────────────────────────────────────────────────────

  async function logMood(moodId, emotions = [], note = '') {
    const today = new Date().toISOString().split('T')[0];
    const logs  = FlowState.get('personal.moodLogs') || [];
    const existing = logs.find((l) => l.date === today);

    const log = {
      id:        existing?.id || FlowStorage.generateId('mood_'),
      date:      today,
      mood:      moodId,
      emotions,
      note,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await FlowStorage.save('mood_logs', log);

    if (existing) {
      FlowState.array.updateItem('personal.moodLogs', (l) => l.id === existing.id, log);
    } else {
      FlowState.array.push('personal.moodLogs', log);
    }

    // También guardar en la entrada del diario
    const entry = getTodayEntry();
    if (entry) await saveEntry({ ...entry, mood: moodId, emotions });

    return log;
  }

  function getTodayMood() {
    const today = new Date().toISOString().split('T')[0];
    return (FlowState.get('personal.moodLogs') || []).find((l) => l.date === today) || null;
  }

  function getMoodHistory(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    return (FlowState.get('personal.moodLogs') || [])
      .filter((l) => l.date >= sinceStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Datos para gráfico de ánimo */
  function getMoodChartData(days = 14) {
    const history = getMoodHistory(days);
    const labels  = history.map((l) => {
      const d = new Date(l.date + 'T12:00:00');
      return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' });
    });
    const data   = history.map((l) => l.mood);
    const colors = history.map((l) => MOODS.find((m) => m.id === l.mood)?.color || '#6366f1');

    return {
      labels,
      datasets: [{
        label:           'Estado de ánimo',
        data,
        borderColor:     '#6366f1',
        backgroundColor: colors,
        fill:            false,
        tension:         0.4,
        pointBackgroundColor: colors,
        pointRadius:     6,
      }],
    };
  }

  /** Estado de ánimo promedio en un período */
  function getAverageMood(days = 7) {
    const history = getMoodHistory(days);
    if (!history.length) return null;
    const avg = history.reduce((s, l) => s + l.mood, 0) / history.length;
    return Math.round(avg * 10) / 10;
  }

  // ── Gratitud ──────────────────────────────────────────────────────────────

  async function addGratitude(items = []) {
    const today = new Date().toISOString().split('T')[0];
    const entry = getTodayEntry() || { date: today };
    const current = entry.gratitude || [];
    const updated = [...new Set([...current, ...items])].slice(0, 10);
    await saveEntry({ ...entry, gratitude: updated });
    FlowGamification.addXP(3, 'gratitude');
    return updated;
  }

  function getGratitudeHistory(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    return (FlowState.get('personal.entries') || [])
      .filter((e) => e.date >= sinceStr && e.gratitude?.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => ({ date: e.date, items: e.gratitude }));
  }

  // ── Reflexión ─────────────────────────────────────────────────────────────

  async function saveReflection({ highlights, improvements }) {
    const today = new Date().toISOString().split('T')[0];
    const entry = getTodayEntry() || { date: today };
    return saveEntry({ ...entry, highlights, improvements });
  }

  // ── IA: reflexión guiada ──────────────────────────────────────────────────

  async function aiReflectionPrompt() {
    if (!FlowAI.isConfigured()) {
      return _localReflectionPrompt();
    }
    try {
      const mood     = getTodayMood();
      const entry    = getTodayEntry();
      const moodInfo = mood ? `Estado de ánimo hoy: ${MOODS.find((m) => m.id === mood.mood)?.label || mood.mood}` : '';
      const text = await FlowAI.chat(
        `Genera 3 preguntas de reflexión personal para el final del día, personalizadas para mí. ${moodInfo}. Sé empático y motivador. Solo las preguntas, numeradas.`
      );
      return text.text || _localReflectionPrompt();
    } catch {
      return _localReflectionPrompt();
    }
  }

  function _localReflectionPrompt() {
    const prompts = [
      ['¿Qué es lo más importante que logré hoy?', '¿Qué obstáculo superé y cómo lo hice?', '¿Qué haré diferente mañana?'],
      ['¿Qué momento de hoy me hizo sentir orgulloso/a?', '¿Dónde puse más energía hoy?', '¿Qué aprendí hoy que quiero recordar?'],
      ['¿Cómo me acerqué a mis objetivos hoy?', '¿Qué interrumpió mi concentración y por qué?', '¿Por qué tres cosas estoy agradecido/a hoy?'],
    ];
    const set = prompts[new Date().getDay() % prompts.length];
    return set.map((q, i) => `${i + 1}. ${q}`).join('\n');
  }

  // ── Estadísticas ──────────────────────────────────────────────────────────

  function getStats() {
    const entries   = FlowState.get('personal.entries')  || [];
    const moodLogs  = FlowState.get('personal.moodLogs') || [];
    const thisMonth = new Date().toISOString().substring(0, 7);
    const monthEntries = entries.filter((e) => e.date.startsWith(thisMonth));
    const streak    = _getJournalStreak(entries);
    const avgMood   = getAverageMood(30);
    const avgMoodObj = avgMood ? MOODS.slice().reverse().find((m) => m.id <= Math.round(avgMood)) : null;

    return {
      totalEntries:  entries.length,
      monthEntries:  monthEntries.length,
      streak,
      avgMood,
      avgMoodLabel:  avgMoodObj?.label || '—',
      avgMoodEmoji:  avgMoodObj?.emoji || '—',
      totalWords:    entries.reduce((s, e) => s + (e.wordCount || 0), 0),
      moodLogsTotal: moodLogs.length,
    };
  }

  function _getJournalStreak(entries) {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (entries.some((e) => e.date === dateStr)) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  return {
    MOODS, EMOTIONS,
    saveEntry, deleteEntry, getEntry, getTodayEntry, getRecentEntries,
    logMood, getTodayMood, getMoodHistory, getMoodChartData, getAverageMood,
    addGratitude, getGratitudeHistory,
    saveReflection, aiReflectionPrompt,
    getStats,
  };

})();
