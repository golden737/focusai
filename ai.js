// ── FocusAI AI ───────────────────────────────────────────────────────────────
// IA 100% local y gratuita. Compatible con:
//   • Ollama          → http://localhost:11434  (recomendado)
//   • LM Studio       → http://localhost:1234
//   • Jan             → http://localhost:1337
//   • Anything LLM    → http://localhost:3001
//   • GPT4All Server  → http://localhost:4891
//   • LocalAI         → http://localhost:8080
// Sin API key, sin límites, sin internet requerido.

window.FlowAI = (() => {

  // ── Config por defecto ────────────────────────────────────────────────────
  const PROVIDERS = {
    ollama: {
      name:       'Ollama',
      baseUrl:    'http://localhost:11434',
      chatPath:   '/api/chat',
      modelsPath: '/api/tags',
      format:     'ollama',
    },
    lmstudio: {
      name:       'LM Studio',
      baseUrl:    'http://localhost:1234',
      chatPath:   '/v1/chat/completions',
      modelsPath: '/v1/models',
      format:     'openai',
    },
    jan: {
      name:       'Jan',
      baseUrl:    'http://localhost:1337',
      chatPath:   '/v1/chat/completions',
      modelsPath: '/v1/models',
      format:     'openai',
    },
    localai: {
      name:       'LocalAI',
      baseUrl:    'http://localhost:8080',
      chatPath:   '/v1/chat/completions',
      modelsPath: '/v1/models',
      format:     'openai',
    },
  };

  // Modelos recomendados por tarea (usar el que tengas instalado)
  const RECOMMENDED_MODELS = [
    'llama3.2', 'llama3.1', 'llama3', 'llama2',
    'mistral', 'mistral-nemo', 'mixtral',
    'gemma2', 'gemma',
    'phi3', 'phi3.5',
    'qwen2.5', 'qwen2',
    'deepseek-r1',
    'neural-chat', 'openchat',
  ];

  function _getConfig() {
    const saved = FlowState.get('ai') || {};
    const provider = saved.provider || 'ollama';
    const isAdmin = FlowState.get('user.role') === 'admin';
    const sharedUrl = _normalizeBaseUrl(window.FOCUSAI_AI_URL || '');
    const sharedModel = String(window.FOCUSAI_AI_MODEL || '').trim();
    return {
      provider,
      baseUrl:    isAdmin ? _normalizeBaseUrl(saved.baseUrl || sharedUrl || (PROVIDERS[provider] || PROVIDERS.ollama).baseUrl) : (sharedUrl || (PROVIDERS[provider] || PROVIDERS.ollama).baseUrl),
      model:      isAdmin ? (saved.model || sharedModel) : (sharedModel || saved.model || ''),
      maxTokens:  saved.maxTokens || 1024,
      temperature:saved.temperature ?? 0.7,
      timeout:    saved.timeout   || 60000,
    };
  }

  function _normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  // Los dominios gratuitos de ngrok pueden servir una página de advertencia
  // HTML en lugar de la API. Esta cabecera pide que la petición llegue al
  // túnel. No se envía a ningún otro proveedor.
  function _requestHeaders(baseUrl, json = false) {
    const headers = json ? { 'Content-Type': 'application/json' } : {};
    try {
      const hostname = new URL(baseUrl).hostname;
      if (hostname.endsWith('.ngrok-free.app') || hostname.endsWith('.ngrok-free.dev') || hostname.endsWith('.ngrok.io')) {
        headers['ngrok-skip-browser-warning'] = 'true';
      }
    } catch (_) {}
    return headers;
  }

  function _getProvider() {
    const cfg  = _getConfig();
    return PROVIDERS[cfg.provider] || PROVIDERS.ollama;
  }

  // ── Test de conexión ──────────────────────────────────────────────────────

  async function testConnection() {
    const cfg      = _getConfig();
    const provider = _getProvider();
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 12000);
      const res  = await fetch(`${cfg.baseUrl}${provider.modelsPath}`, {
        signal: ctrl.signal,
        headers: _requestHeaders(cfg.baseUrl),
      });
      clearTimeout(tid);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(_friendlyHttpError(res.status, detail));
      }
      const data   = await res.json();
      // Extraer lista de modelos según formato
      const models = provider.format === 'ollama'
        ? (data.models || []).map((m) => m.name)
        : (data.data   || []).map((m) => m.id);
      return { ok: true, models };
    } catch (e) {
      return { ok: false, error: _friendlyConnectionError(e, cfg.baseUrl) };
    }
  }

  async function listModels() {
    const result = await testConnection();
    return result.ok ? result.models : [];
  }

  // ── Llamada principal ─────────────────────────────────────────────────────

  async function _call(messages, systemText, maxTokens = null) {
    const cfg      = _getConfig();
    const provider = _getProvider();
    const url      = `${cfg.baseUrl}${provider.chatPath}`;

    FlowState.set('ai.isThinking', true);

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), cfg.timeout);

    try {
      let body;

      if (provider.format === 'ollama') {
        // Formato nativo de Ollama
        body = JSON.stringify({
          model:    cfg.model,
          stream:   false,
          options: {
            temperature:  cfg.temperature,
            num_predict:  maxTokens || cfg.maxTokens,
          },
          messages: [
            { role: 'system',  content: systemText },
            ...messages,
          ],
        });
      } else {
        // Formato OpenAI compatible (LM Studio, Jan, LocalAI…)
        body = JSON.stringify({
          model:       cfg.model,
          stream:      false,
          temperature: cfg.temperature,
          max_tokens:  maxTokens || cfg.maxTokens,
          messages: [
            { role: 'system',  content: systemText },
            ...messages,
          ],
        });
      }

      const res = await fetch(url, {
        method:  'POST',
        headers: _requestHeaders(cfg.baseUrl, true),
        body,
        signal:  ctrl.signal,
      });

      clearTimeout(tid);

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(_friendlyHttpError(res.status, txt));
      }

      const data = await res.json();

      // Extraer texto según formato
      if (provider.format === 'ollama') {
        return data.message?.content || data.response || '';
      } else {
        return data.choices?.[0]?.message?.content || '';
      }

    } catch (e) {
      throw new Error(_friendlyConnectionError(e, cfg.baseUrl));
    } finally {
      FlowState.set('ai.isThinking', false);
    }
  }

  // ── Contexto del día ──────────────────────────────────────────────────────

  function _buildContext() {
    const tasks    = FlowState.get('tasks.items')    || [];
    const habits   = FlowState.get('habits.items')   || [];
    const goals    = FlowState.get('goals.items')    || [];
    const projects = FlowState.get('projects.items') || [];
    const timeLogs = FlowState.get('timer.logs')     || [];
    const today    = new Date().toISOString().split('T')[0];
    const now      = new Date();

    const todayTasks   = tasks.filter((t) => t.dueDate === today && !t.completed && !t.archived);
    const overdue      = tasks.filter((t) => t.dueDate && t.dueDate < today && !t.completed && !t.archived);
    const todayMinutes = timeLogs.filter((l) => l.date === today).reduce((s, l) => s + (l.durationMin || 0), 0);
    const metrics = typeof FlowStats !== 'undefined' && typeof FlowStats.getDashboardMetrics === 'function'
      ? FlowStats.getDashboardMetrics()
      : { tasks: {}, time: { todayMin: todayMinutes }, habits: {}, goals: {} };
    const eventsToday = (FlowState.get('calendar.events') || [])
      .filter((event) => event.startDate === today)
      .map((event) => ({ id: event.id, title: event.title, startTime: event.startTime, endTime: event.endTime, type: event.type }));

    return {
      datetime:     now.toISOString(),
      date:         today,
      dayOfWeek:    ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][now.getDay()],
      user:         FlowState.get('user.name') || 'Usuario',
      todayTasks:   todayTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, estimatedMin: t.estimatedMin })),
      overdueTasks: overdue.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
      pendingCount: tasks.filter((t) => !t.completed && !t.archived).length,
      habits:       habits.filter((h) => !h.archived).map((h) => ({ id: h.id, name: h.name, streak: h.streak || 0 })),
      activeGoals:  goals.filter((g) => !g.completed).map((g) => ({ id: g.id, title: g.title, progress: g.progress || 0 })),
      projects:     projects.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name })),
      todayMinutes,
      metrics,
      eventsToday,
      timer: { status: FlowState.get('timer.status'), mode: FlowState.get('timer.mode'), activeTaskId: FlowState.get('timer.activeTaskId') },
    };
  }

  function _systemPrompt(mode = 'assistant') {
    const ctx  = _buildContext();
    const base = `Eres FocusAI AI, asistente de productividad personal integrado en la app FocusAI.
Respondes siempre en español, de forma clara, concisa y motivadora.
Hoy es ${ctx.dayOfWeek} ${ctx.date}. El usuario se llama ${ctx.user}.

CONTEXTO ACTUAL:
- Tareas para hoy: ${JSON.stringify(ctx.todayTasks)}
- Tareas vencidas: ${JSON.stringify(ctx.overdueTasks)}
- Total pendientes: ${ctx.pendingCount}
- Hábitos activos: ${JSON.stringify(ctx.habits)}
- Objetivos activos: ${JSON.stringify(ctx.activeGoals)}
- Proyectos: ${JSON.stringify(ctx.projects)}
- Eventos de hoy: ${JSON.stringify(ctx.eventsToday)}
- Estado del temporizador: ${JSON.stringify(ctx.timer)}
- Métricas calculadas de FocusAI: ${JSON.stringify(ctx.metrics)}

ACCIONES DISPONIBLES:
Cuando el usuario pida cambiar algo en FocusAI, EJECÚTALO. No des SQL, código, comandos ni explicaciones técnicas.
Para ejecutar una acción, incluye al final una línea por acción, sin bloque Markdown:
<action>{"type":"TIPO","payload":{...}}</action>
Es JSON estricto: usa comillas dobles y las fechas en formato YYYY-MM-DD. Si faltan datos indispensables, pregunta solo por ese dato.
Nunca inventes IDs: utiliza únicamente los IDs presentes en el contexto. No uses la acción DELETE_TASK; pide confirmación en texto antes de borrar algo.

Tipos disponibles:
CREATE_TASK      → { title, description?, priority?: "high"|"medium"|"low"|"none", dueDate?: "YYYY-MM-DD", dueTime?, estimatedMin?, labels?, projectId?, goalId? }
UPDATE_TASK      → { id, ...campos }
COMPLETE_TASK    → { id }
RESCHEDULE_TASK  → { id, dueDate }
SET_PRIORITY     → { id, priority }
CREATE_HABIT     → { name, frequency?, reminderTime? }
CREATE_GOAL      → { title, description?, targetDate?, type? }
CREATE_PROJECT   → { name, description?, endDate? }
CREATE_EVENT     → { title, startDate?, startTime?, endTime?, type?, description? }
START_POMODORO   → { taskId? }
START_STOPWATCH  → { taskId? }
PAUSE_TIMER, RESUME_TIMER, STOP_TIMER → {}
COMPLETE_HABIT   → { id }
SET_GOAL_PROGRESS → { id, progress }
NAVIGATE         → { view: "dashboard"|"tasks"|"timer"|"habits"|"goals"|"projects"|"calendar"|"stats" }
PLAN_DAY         → { tasks: [{ id, order, estimatedMin }] }
SHOW_TOAST       → { message, type }`;

    if (mode === 'planning')  return base + '\n\nMODO: Planificador del día. Propón un plan optimizado con la acción PLAN_DAY.';
    if (mode === 'analysis')  return base + '\n\nMODO: Analista. Detecta patrones, sobrecarga y oportunidades de mejora. Sé conciso.';
    return base + '\n\nMODO ASISTENTE: Ayuda al usuario. Sé proactivo y usa acciones cuando sea útil.';
  }

  // ── Ejecutar acciones embebidas ───────────────────────────────────────────

  async function _executeActions(text) {
    const regex = /<action>\s*([\s\S]*?)\s*<\/action>/gi;
    let match;
    const results = [];
    const seen = new Set();
    while ((match = regex.exec(text)) !== null) {
      try {
        const action = JSON.parse(match[1].trim());
        const key = JSON.stringify(action);
        if (!seen.has(key)) {
          seen.add(key);
          results.push(await _dispatch(action));
        }
      } catch (e) {
        console.warn('[AI] Error en acción:', e.message, match[1]);
      }
    }
    return {
      text:    text.replace(/<action>[\s\S]*?<\/action>/g, '').trim(),
      actions: results,
    };
  }

  async function _dispatch({ type, payload }) {
    switch (type) {
      case 'CREATE_TASK':      return FlowTasks.create(payload);
      case 'UPDATE_TASK':      return FlowTasks.update(payload.id, payload);
      case 'COMPLETE_TASK':    return FlowTasks.complete(payload.id);
      // Borrar datos nunca se ejecuta desde una respuesta generada por el modelo.
      // La interfaz de tareas pide confirmación explícita al usuario.
      case 'DELETE_TASK':      return { skipped: true, reason: 'La eliminación requiere confirmación en la lista de tareas.' };
      case 'RESCHEDULE_TASK':  return FlowTasks.update(payload.id, { dueDate: payload.dueDate });
      case 'SET_PRIORITY':     return FlowTasks.update(payload.id, { priority: payload.priority });
      case 'CREATE_HABIT':     return FlowHabits.create(payload);
      case 'CREATE_GOAL':      return FlowGoals.create(payload);
      case 'CREATE_PROJECT':   return FlowProjects.create(payload);
      case 'CREATE_EVENT':     return FlowCalendar.createEvent(payload);
      case 'NAVIGATE':         return FlowRouter.navigate(payload.view);
      case 'START_POMODORO':   return FlowTimer.startPomodoro(payload.taskId);
      case 'START_STOPWATCH':  return FlowTimer.startStopwatch(payload.taskId);
      case 'PAUSE_TIMER':      return FlowTimer.pauseTimer();
      case 'RESUME_TIMER':     return FlowTimer.resumeTimer();
      case 'STOP_TIMER':       return FlowTimer.stopTimer();
      case 'COMPLETE_HABIT':   return FlowHabits.complete(payload.id);
      case 'SET_GOAL_PROGRESS': return FlowGoals.setProgress(payload.id, payload.progress);
      case 'SHOW_TOAST':       return FlowApp.toast(payload.message, payload.type || 'info');
      case 'PLAN_DAY': {
        for (const item of payload.tasks || []) {
          await FlowTasks.update(item.id, { order: item.order, estimatedMin: item.estimatedMin });
        }
        FlowState.set('ai.planGenerated', true);
        return { planned: payload.tasks?.length };
      }
      default:
        console.warn('[AI] Acción desconocida:', type);
        return null;
    }
  }

  // ── API pública ───────────────────────────────────────────────────────────

  /** Analizar contexto del día al arrancar */
  async function analyzeDayContext() {
    if (!isConfigured()) return;
    try {
      const text = await _call(
        [{ role: 'user', content: 'Analiza mis tareas de hoy y dime brevemente (máximo 3 puntos) qué priorizar. Sé muy conciso.' }],
        _systemPrompt('analysis'),
        400
      );
      const { text: clean } = await _executeActions(text);
      FlowState.set('ai.suggestions', [{ id: Date.now(), text: clean, type: 'daily_analysis', ts: new Date().toISOString() }]);
    } catch (e) {
      console.warn('[AI] analyzeDayContext:', e.message);
    }
  }

  /** Planificar el día automáticamente */
  async function planDay() {
    if (!isConfigured()) { FlowApp.toast('Configura la IA local en Ajustes', 'warning'); return; }
    FlowApp.toast('La IA está planificando tu día…', 'info', { duration: 8000 });
    try {
      const text = await _call(
        [{ role: 'user', content: 'Organiza mis tareas pendientes de hoy por prioridad y tiempo. Usa PLAN_DAY y explica brevemente.' }],
        _systemPrompt('planning'),
        1000
      );
      const { text: clean, actions } = await _executeActions(text);
      _addToHistory('user', 'Planifica mi día');
      _addToHistory('assistant', clean);
      FlowApp.toast('✨ Plan del día generado', 'success');
      return { text: clean, actions };
    } catch (e) {
      FlowApp.toast(e.message, 'error');
      throw e;
    }
  }

  /** Estimar tiempo de una tarea */
  async function estimateTask(taskId) {
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (!task || !isConfigured()) return;
    try {
      const text = await _call(
        [{ role: 'user', content: `Responde SOLO con un número entero (minutos) para esta tarea:\n"${task.title}"\nDescripción: "${task.description || 'ninguna'}"\nSubtareas: ${task.subtasks?.length || 0}` }],
        'Eres un estimador de tiempo. Responde ÚNICAMENTE con un número entero en minutos, sin ningún otro texto.',
        10
      );
      const minutes = parseInt(text.trim().replace(/\D/g, ''), 10);
      if (!isNaN(minutes) && minutes > 0) {
        await FlowTasks.update(taskId, { estimatedMin: minutes });
        FlowApp.toast(`Estimado: ~${minutes} min`, 'info');
      }
    } catch (e) {
      console.warn('[AI] estimateTask:', e.message);
    }
  }

  /** Detectar sobrecarga */
  async function detectOverload() {
    if (!isConfigured()) return null;
    try {
      const text = await _call(
        [{ role: 'user', content: '¿Tengo sobrecarga hoy? Responde SOLO con JSON: {"overloaded":bool,"reason":"...","suggestion":"..."}' }],
        _systemPrompt('analysis'),
        200
      );
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch (e) {
      console.warn('[AI] detectOverload:', e.message);
    }
    return null;
  }

  /** Sugerir prioridades */
  async function suggestPriorities() {
    if (!isConfigured()) return;
    FlowApp.toast('Analizando prioridades…', 'info', { duration: 5000 });
    try {
      const text = await _call(
        [{ role: 'user', content: 'Ajusta las prioridades de mis tareas pendientes con acciones SET_PRIORITY. Explica brevemente.' }],
        _systemPrompt('assistant'),
        800
      );
      const { text: clean } = await _executeActions(text);
      _addToHistory('assistant', clean);
      FlowApp.toast('Prioridades actualizadas', 'success');
      return clean;
    } catch (e) {
      FlowApp.toast(e.message, 'error');
    }
  }

  /** Resumen del día */
  async function dailySummary() {
    if (!isConfigured()) return '';
    try {
      const text = await _call(
        [{ role: 'user', content: 'Genera un resumen breve de mi productividad de hoy: tareas completadas, tiempo trabajado, reflexión motivadora.' }],
        _systemPrompt('analysis'),
        400
      );
      const { text: clean } = await _executeActions(text);
      return clean;
    } catch (e) {
      return '';
    }
  }

  /** Chat conversacional */
  async function chat(userMessage) {
    if (!isConfigured()) throw new Error('Configura la IA local en Ajustes primero');
    _addToHistory('user', userMessage);
    // Las órdenes sencillas se resuelven localmente. Así siguen funcionando
    // aunque un modelo pequeño responda con SQL o no respete el formato action.
    const direct = await _runDirectCommand(userMessage);
    if (direct) {
      _addToHistory('assistant', direct.text);
      return { text: direct.text, actions: [direct.result] };
    }
    const history = (FlowState.get('ai.chatHistory') || [])
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    try {
      const text = await _call(history, _systemPrompt('assistant'), 1000);
      const { text: clean, actions } = await _executeActions(text);
      _addToHistory('assistant', clean);
      return { text: clean, actions };
    } catch (e) {
      _addToHistory('assistant', `⚠️ ${e.message}`);
      throw e;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _commandDate(message) {
    const today = new Date();
    const normalized = message.toLowerCase();
    if (/\bpasado mañana\b/.test(normalized)) today.setDate(today.getDate() + 2);
    else if (/\bmañana\b/.test(normalized)) today.setDate(today.getDate() + 1);
    return today.toISOString().slice(0, 10);
  }

  function _cleanCommandTitle(value) {
    return value
      .replace(/\b(para|el)\s+(hoy|mañana|pasado mañana)\b/gi, '')
      .replace(/\b(con prioridad\s+)?(alta|media|baja)\b/gi, '')
      .replace(/[.。]+$/, '')
      .trim();
  }

  async function _runDirectCommand(message) {
    const value = String(message || '').trim();
    const normalized = value.toLowerCase();
    const taskMatch = value.match(/\b(?:crea|crear|agrega|agregar|añade|añadir|anota|anotar)\s+(?:una\s+)?tarea(?:\s*(?:de|:))?\s+(.+)/i);
    if (taskMatch) {
      const title = _cleanCommandTitle(taskMatch[1]);
      if (!title) return { text: '¿Qué título quieres ponerle a la tarea?', result: null };
      const priority = /\b(alta|urgente)\b/i.test(normalized) ? 'high' : /\bmedia\b/i.test(normalized) ? 'medium' : /\bbaja\b/i.test(normalized) ? 'low' : 'none';
      const task = await FlowTasks.create({ title, priority, dueDate: _commandDate(normalized) });
      return { text: `✅ Listo: creé la tarea “${task.title}”${task.dueDate ? ` para ${task.dueDate}` : ''}.`, result: task };
    }

    const habitMatch = value.match(/\b(?:crea|crear|agrega|agregar|añade|añadir)\s+(?:un\s+)?hábito(?:\s+(?:de|:))?\s+(.+)/i);
    if (habitMatch) {
      const habit = await FlowHabits.create({ name: _cleanCommandTitle(habitMatch[1]) || 'Nuevo hábito' });
      return { text: `✅ Listo: creé el hábito “${habit.name}”.`, result: habit };
    }

    const goalMatch = value.match(/\b(?:crea|crear|agrega|agregar|añade|añadir)\s+(?:una\s+)?meta(?:\s+(?:de|:))?\s+(.+)/i);
    if (goalMatch) {
      const goal = await FlowGoals.create({ title: _cleanCommandTitle(goalMatch[1]) || 'Nueva meta' });
      return { text: `✅ Listo: creé la meta “${goal.title}”.`, result: goal };
    }

    const projectMatch = value.match(/\b(?:crea|crear|agrega|agregar|añade|añadir)\s+(?:un\s+)?proyecto(?:\s+(?:de|:))?\s+(.+)/i);
    if (projectMatch) {
      const project = await FlowProjects.create({ name: _cleanCommandTitle(projectMatch[1]) || 'Nuevo proyecto' });
      return { text: `✅ Listo: creé el proyecto “${project.name}”.`, result: project };
    }

    if (/\b(?:inicia|iniciar|empieza|empezar)\b.*\b(pomodoro|cronómetro|cronometro)\b/i.test(normalized)) {
      const isPomodoro = /\bpomodoro\b/i.test(normalized);
      const result = isPomodoro ? FlowTimer.startPomodoro() : FlowTimer.startStopwatch();
      return { text: `▶️ ${isPomodoro ? 'Pomodoro' : 'Cronómetro'} iniciado.`, result };
    }
    if (/\b(?:pausa|pausar)\b.*\b(pomodoro|cronómetro|cronometro|temporizador)\b/i.test(normalized)) {
      const result = FlowTimer.pauseTimer();
      return { text: '⏸️ Temporizador pausado.', result };
    }
    if (/\b(?:detén|detener|para|parar)\b.*\b(pomodoro|cronómetro|cronometro|temporizador)\b/i.test(normalized)) {
      const result = await FlowTimer.stopTimer();
      return { text: '⏹️ Temporizador detenido y tiempo guardado.', result };
    }
    return null;
  }

  function _addToHistory(role, content) {
    const history = FlowState.get('ai.chatHistory') || [];
    const entry   = { role, content, ts: new Date().toISOString(), id: FlowStorage.generateId('msg_') };
    FlowState.set('ai.chatHistory', [...history, entry].slice(-100));
  }

  function clearHistory() {
    FlowState.set('ai.chatHistory', []);
  }

  function getSuggestions() {
    return FlowState.get('ai.suggestions') || [];
  }

  /** Devuelve true si hay una URL de servidor configurada y un modelo seleccionado */
  function isConfigured() {
    const cfg = _getConfig();
    return !!(cfg.baseUrl && cfg.model);
  }

  /** Guardar configuración del servidor local */
  function saveConfig(config) {
    FlowState.batch(() => {
      if (config.provider)    FlowState.set('ai.provider',    config.provider);
      if (config.baseUrl !== undefined) FlowState.set('ai.baseUrl', _normalizeBaseUrl(config.baseUrl));
      if (config.model !== undefined)   FlowState.set('ai.model', String(config.model).trim());
      if (config.temperature !== undefined) FlowState.set('ai.temperature', config.temperature);
      if (config.maxTokens)   FlowState.set('ai.maxTokens',   config.maxTokens);
      if (config.timeout)     FlowState.set('ai.timeout',     config.timeout);
    });
    FlowState.persist();
  }

  function _friendlyHttpError(status, detail = '') {
    if (status === 404) return 'El túnel respondió, pero no encuentra la API de Ollama. Comprueba que ngrok apunte a http://localhost:11434.';
    if (status === 502 || status === 503) return 'ngrok no puede alcanzar Ollama. Verifica que Ollama y ngrok estén ejecutándose en tu PC.';
    if (status === 401 || status === 403) return 'El túnel bloqueó el acceso. Revisa las reglas de acceso de ngrok o la configuración de CORS de Ollama.';
    return `El servidor respondió ${status}${detail ? `: ${detail.slice(0, 180)}` : ''}`;
  }

  function _friendlyConnectionError(error, baseUrl) {
    if (error?.name === 'AbortError') return 'Tiempo de espera agotado. Revisa que Ollama y el túnel de Cloudflare sigan activos.';
    if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError') || error instanceof TypeError) {
      return `No se pudo acceder a ${baseUrl}. Verifica que Ollama y ngrok estén activos. Si el túnel abre pero falla en el navegador, configura CORS en Ollama para permitir el dominio de esta web.`;
    }
    return error?.message || 'No se pudo conectar con la IA local.';
  }

  return {
    // Configuración
    PROVIDERS, RECOMMENDED_MODELS,
    testConnection, listModels, saveConfig, isConfigured,
    // IA
    chat, planDay, estimateTask,
    detectOverload, suggestPriorities, dailySummary,
    analyzeDayContext, clearHistory, getSuggestions,
  };

})();
