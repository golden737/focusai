// ── FocusAI AI ───────────────────────────────────────────────────────────────
// IA 100% local y gratuita. Compatible con:
// • Ollama → http://localhost:11434 (recomendado)
// • LM Studio → http://localhost:1234
// • Jan → http://localhost:1337
// • Anything LLM → http://localhost:3001
// • GPT4All Server → http://localhost:4891
// • LocalAI → http://localhost:8080
// Sin API key, sin límites, sin internet requerido.

window.FlowAI = (() => {

 // ── Config por defecto ────────────────────────────────────────────────────
 const PROVIDERS = {
 ollama: {
 name: 'Ollama',
 baseUrl: 'http://localhost:11434',
 chatPath: '/api/chat',
 modelsPath: '/api/tags',
 format: 'ollama',
 },
 lmstudio: {
 name: 'LM Studio',
 baseUrl: 'http://localhost:1234',
 chatPath: '/v1/chat/completions',
 modelsPath: '/v1/models',
 format: 'openai',
 },
 jan: {
 name: 'Jan',
 baseUrl: 'http://localhost:1337',
 chatPath: '/v1/chat/completions',
 modelsPath: '/v1/models',
 format: 'openai',
 },
 localai: {
 name: 'LocalAI',
 baseUrl: 'http://localhost:8080',
 chatPath: '/v1/chat/completions',
 modelsPath: '/v1/models',
 format: 'openai',
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
 baseUrl: isAdmin ? _normalizeBaseUrl(saved.baseUrl || sharedUrl || (PROVIDERS[provider] || PROVIDERS.ollama).baseUrl) : (sharedUrl || (PROVIDERS[provider] || PROVIDERS.ollama).baseUrl),
 model: isAdmin ? (saved.model || sharedModel) : (sharedModel || saved.model || ''),
 maxTokens: saved.maxTokens || 1024,
 temperature:saved.temperature ?? 0.7,
 timeout: saved.timeout || 60000,
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
 const cfg = _getConfig();
 return PROVIDERS[cfg.provider] || PROVIDERS.ollama;
 }

 // ── Test de conexión ──────────────────────────────────────────────────────

 async function _apiRequest(url, options = {}) {
 const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
 const data = await response.json().catch(() => ({}));
 if (!response.ok) throw new Error(data.error || `Error del servidor (${response.status})`);
 return data;
 }
 async function testConnection() {
 try { return await _apiRequest('/api/ai/test', { method: 'POST', body: '{}' }); }
 catch (e) { return { ok: false, error: e.message }; }
 }
 async function listModels() {
 try { const result = await _apiRequest('/api/ai/models'); return result.models || []; }
 catch (_) { return []; }
 }

 // ── Llamada principal ─────────────────────────────────────────────────────

 async function _call(messages, systemText, maxTokens = null) {
 FlowState.set('ai.isThinking', true);
 try {
  const result = await _apiRequest('/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages, systemText, maxTokens }) });
  return String(result.text || '');
 } catch (e) {
  throw new Error(e.message || 'No se pudo conectar con el proveedor de IA configurado por el superadministrador.');
 } finally { FlowState.set('ai.isThinking', false); }
 }

 // ── Contexto del día ──────────────────────────────────────────────────────

 function _buildContext() {
 const tasks = FlowState.get('tasks.items') || [];
 const habits = FlowState.get('habits.items') || [];
 const goals = FlowState.get('goals.items') || [];
 const projects = FlowState.get('projects.items') || [];
 const timeLogs = FlowState.get('timer.logs') || [];
 const today = new Date().toISOString().split('T')[0];
 const now = new Date();

 const todayTasks = tasks.filter((t) => t.dueDate === today && !t.completed && !t.archived);
 const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !t.completed && !t.archived);
 const todayMinutes = timeLogs.filter((l) => l.date === today).reduce((s, l) => s + (l.durationMin || 0), 0);
 const metrics = typeof FlowStats !== 'undefined' && typeof FlowStats.getDashboardMetrics === 'function'
 ? FlowStats.getDashboardMetrics()
 : { tasks: {}, time: { todayMin: todayMinutes }, habits: {}, goals: {} };
 const eventsToday = (FlowState.get('calendar.events') || [])
 .filter((event) => event.startDate === today)
 .map((event) => ({ id: event.id, title: event.title, startTime: event.startTime, endTime: event.endTime, type: event.type }));

 return {
 datetime: now.toISOString(),
 date: today,
 dayOfWeek: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][now.getDay()],
 user: FlowState.get('user.name') || 'Usuario',
 todayTasks: todayTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, estimatedMin: t.estimatedMin })),
 overdueTasks: overdue.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
 pendingCount: tasks.filter((t) => !t.completed && !t.archived).length,
 habits: habits.filter((h) => !h.archived).map((h) => ({ id: h.id, name: h.name, streak: h.streak || 0 })),
 activeGoals: goals.filter((g) => !g.completed).map((g) => ({ id: g.id, title: g.title, progress: g.progress || 0 })),
 projects: projects.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name })),
 todayMinutes,
 metrics,
 eventsToday,
 timer: { status: FlowState.get('timer.status'), mode: FlowState.get('timer.mode'), activeTaskId: FlowState.get('timer.activeTaskId') },
 };
 }

 function _systemPrompt(mode = 'assistant') {
 const ctx = _buildContext();
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
CREATE_TASK → { title, description?, priority?: "high"|"medium"|"low"|"none", dueDate?: "YYYY-MM-DD", dueTime?, estimatedMin?, labels?, projectId?, goalId? }
UPDATE_TASK → { id, ...campos }
COMPLETE_TASK → { id }
RESCHEDULE_TASK → { id, dueDate }
SET_PRIORITY → { id, priority }
CREATE_HABIT → { name, frequency?, reminderTime? }
CREATE_GOAL → { title, description?, targetDate?, type? }
CREATE_PROJECT → { name, description?, endDate? }
CREATE_EVENT → { title, startDate?, startTime?, endTime?, type?, description? }
START_POMODORO → { taskId? }
START_STOPWATCH → { taskId? }
PAUSE_TIMER, RESUME_TIMER, STOP_TIMER → {}
COMPLETE_HABIT → { id }
SET_GOAL_PROGRESS → { id, progress }
NAVIGATE → { view: "dashboard"|"tasks"|"timer"|"habits"|"goals"|"projects"|"calendar"|"stats" }
PLAN_DAY → { tasks: [{ id, order, estimatedMin }] }
SHOW_TOAST → { message, type }`;

 const scopeNote = `
LÍMITES DE CONTEXTO: Solo conoces los datos personales enumerados arriba. No tienes acceso al directorio de empleados, expedientes de RR. HH., encuestas ni desempeño individual, salvo que esos datos estén incluidos explícitamente. Si preguntan por ellos, dilo claramente y orienta a la persona al Directorio de empleados. Nunca sustituyas una pregunta de empleados por un resumen de proyectos ni inventes métricas.`;

 if (mode === 'planning') return base + scopeNote + '\n\nMODO: Planificador del día. Propón un plan optimizado con la acción PLAN_DAY.';
 if (mode === 'analysis') return base + scopeNote + '\n\nMODO: Analista. Detecta patrones, sobrecarga y oportunidades de mejora. Sé conciso.';
 return base + scopeNote + '\n\nMODO ASISTENTE: Ayuda al usuario. Sé proactivo y usa acciones cuando sea útil.';
 }

 const ACTION_NAMES = 'CREATE_TASK|UPDATE_TASK|COMPLETE_TASK|DELETE_TASK|RESCHEDULE_TASK|SET_PRIORITY|CREATE_HABIT|CREATE_GOAL|CREATE_PROJECT|CREATE_EVENT|START_POMODORO|START_STOPWATCH|PAUSE_TIMER|RESUME_TIMER|STOP_TIMER|COMPLETE_HABIT|SET_GOAL_PROGRESS|NAVIGATE|PLAN_DAY|SHOW_TOAST|ASSIGN_EMPLOYEE_TASK|CREATE_TRAINING|ASSIGN_TRAINING|EVALUATE_COMPETENCY|SCHEDULE_RECRUITMENT_INTERVIEW|UPDATE_MY_TRAINING';

 function _stripInternalActionMarkup(value) {
 const source=String(value || '');
 const hasLegacyAction=new RegExp(`<\\s*(?:${ACTION_NAMES})\\b`, 'i').test(source);
 const cleaned=source
 .replace(new RegExp(`<\\s*(?:${ACTION_NAMES})\\b[\\s\\S]*?>`, 'gi'), '')
 .replace(new RegExp(`<\\/\\s*(?:${ACTION_NAMES})\\s*>`, 'gi'), '')
 .replace(/```(?:json|xml)?\s*[\s\S]*?```/gi, (block) => /"type"\s*:\s*"(?:CREATE_TASK|UPDATE_TASK|COMPLETE_TASK|DELETE_TASK|RESCHEDULE_TASK|SET_PRIORITY|CREATE_HABIT|CREATE_GOAL|CREATE_PROJECT|CREATE_EVENT|START_POMODORO|START_STOPWATCH|PAUSE_TIMER|RESUME_TIMER|STOP_TIMER|COMPLETE_HABIT|SET_GOAL_PROGRESS|NAVIGATE|PLAN_DAY|SHOW_TOAST|ASSIGN_EMPLOYEE_TASK|CREATE_TRAINING|ASSIGN_TRAINING|EVALUATE_COMPETENCY|SCHEDULE_RECRUITMENT_INTERVIEW|UPDATE_MY_TRAINING)"/i.test(block) ? '' : block)
 .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
 return hasLegacyAction ? 'Esa respuesta anterior tuvo un error. Vuelve a hacer la pregunta y te responderé sin mostrar instrucciones internas.' : cleaned;
 }

 // ── Ejecutar acciones embebidas ───────────────────────────────────────────

 async function _executeActions(text) {
 const regex = /<action>\s*([\s\S]*?)\s*<\/action>/gi;
 let match;
 const results = [];
 const failures = [];
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
 failures.push(e.message || 'No se pudo completar una acción.');
 }
 }
 const cleanedText=_stripInternalActionMarkup(text.replace(/<action>[\s\S]*?<\/action>/gi, ''));
 return {
 text: failures.length ? `${cleanedText}${cleanedText?'\n\n':''}No pude completar una acción: ${failures.join('; ')}` : cleanedText,
 actions: results,
 };
 }

 async function _dispatch({ type, payload }) {
 switch (type) {
 case 'CREATE_TASK': return FlowTasks.create(payload);
 case 'UPDATE_TASK': return FlowTasks.update(payload.id, payload);
 case 'COMPLETE_TASK': return FlowTasks.complete(payload.id);
 // Borrar datos nunca se ejecuta desde una respuesta generada por el modelo.
 // La interfaz de tareas pide confirmación explícita al usuario.
 case 'DELETE_TASK': return { skipped: true, reason: 'La eliminación requiere confirmación en la lista de tareas.' };
 case 'RESCHEDULE_TASK': return FlowTasks.update(payload.id, { dueDate: payload.dueDate });
 case 'SET_PRIORITY': return FlowTasks.update(payload.id, { priority: payload.priority });
 case 'CREATE_HABIT': return FlowHabits.create(payload);
 case 'CREATE_GOAL': return FlowGoals.create(payload);
 case 'CREATE_PROJECT': return FlowProjects.create(payload);
 case 'CREATE_EVENT': return FlowCalendar.createEvent(payload);
 case 'NAVIGATE': return FlowRouter.navigate(payload.view);
 case 'START_POMODORO': return FlowTimer.startPomodoro(payload.taskId);
 case 'START_STOPWATCH': return FlowTimer.startStopwatch(payload.taskId);
 case 'PAUSE_TIMER': return FlowTimer.pauseTimer();
 case 'RESUME_TIMER': return FlowTimer.resumeTimer();
 case 'STOP_TIMER': return FlowTimer.stopTimer();
 case 'COMPLETE_HABIT': return FlowHabits.complete(payload.id);
 case 'SET_GOAL_PROGRESS': return FlowGoals.setProgress(payload.id, payload.progress);
 case 'SHOW_TOAST': return FlowApp.toast(payload.message, payload.type || 'info');
 case 'ASSIGN_EMPLOYEE_TASK': {
 const employeeId=String(payload.employeeId||'').trim();
 if (!employeeId) throw new Error('No se identificó a la persona para asignar la tarea.');
 return _apiRequest(`/api/enterprise/employees/${encodeURIComponent(employeeId)}/tasks`, { method: 'POST', body: JSON.stringify({ title: payload.title, description: payload.description || '', priority: payload.priority || 'medium', dueDate: payload.dueDate || null }) });
 }
 case 'CREATE_TRAINING': return _apiRequest('/api/enterprise/trainings', { method: 'POST', body: JSON.stringify(payload) });
 case 'ASSIGN_TRAINING': return _apiRequest(`/api/enterprise/trainings/${encodeURIComponent(payload.trainingId)}/assign`, { method: 'POST', body: JSON.stringify({ employeeIds: Array.isArray(payload.employeeIds) ? payload.employeeIds : [payload.employeeId].filter(Boolean) }) });
 case 'EVALUATE_COMPETENCY': return _apiRequest('/api/enterprise/competencies/evaluations', { method: 'POST', body: JSON.stringify(payload) });
 case 'SCHEDULE_RECRUITMENT_INTERVIEW': {
 const data={...payload};
 if(data.scheduledAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.scheduledAt)) data.scheduledAt=new Date(data.scheduledAt).toISOString();
 const interview=await _apiRequest('/api/enterprise/interviews', { method: 'POST', body: JSON.stringify(data) });
 try {
  const start=new Date(interview.scheduled_at||data.scheduledAt);
  if(Number.isFinite(start.getTime())){
   const pad=n=>String(n).padStart(2,'0');
   const startDate=`${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
   const startTime=`${pad(start.getHours())}:${pad(start.getMinutes())}`;
   const end=new Date(start.getTime()+60*60*1000);
   await FlowCalendar.createEvent({interviewId:interview.id,title:`Entrevista · ${data.candidateName} — ${data.positionTitle}`,description:[data.candidateEmail,data.candidatePhone,data.agenda].filter(Boolean).join('\n'),type:'meeting',color:'var(--accent)',startDate,endDate:startDate,startTime,endTime:`${pad(end.getHours())}:${pad(end.getMinutes())}`,attendees:data.candidateEmail?[data.candidateEmail]:[]});
  }
 } catch(calendarError){console.warn('[AI] Entrevista guardada, pero no se pudo sincronizar con el calendario:',calendarError.message);}
 return interview;
 }
 case 'UPDATE_MY_TRAINING': {
 const enrollmentId=String(payload.enrollmentId||'').trim();
 if(!enrollmentId) throw new Error('No se identificó la capacitación asignada.');
 const isEmployee=!['admin','hr','superadmin'].includes(FlowState.get('user.role'));
 const endpoint=isEmployee?`/api/my-development/trainings/${encodeURIComponent(enrollmentId)}`:`/api/enterprise/training-enrollments/${encodeURIComponent(enrollmentId)}`;
 return _apiRequest(endpoint,{method:'PATCH',body:JSON.stringify({status:payload.status,progress:payload.progress})});
 }
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
 FlowApp.toast(' Plan del día generado', 'success');
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
 prepareUserSession();
 _addToHistory('user', userMessage);
 // Las órdenes sencillas se resuelven localmente. Así siguen funcionando
 // aunque un modelo pequeño responda con SQL o no respete el formato action.
 const direct = await _runDirectCommand(userMessage);
 if (direct) {
 _addToHistory('assistant', direct.text);
 return { text: direct.text, actions: [direct.result] };
 }
 const history = (FlowState.get('ai.chatHistory') || [])
 .slice(-6)
 .map((m) => ({ role: m.role, content: String(m.content||'').slice(0,1400) }));
 try {
 const text = await _call(history, _systemPrompt('assistant'), 1000);
 const { text: clean, actions } = await _executeActions(text);
 _addToHistory('assistant', clean);
 return { text: clean, actions };
 } catch (e) {
 _addToHistory('assistant', ` ${e.message}`);
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
 return { text: ` Listo: creé la tarea “${task.title}”${task.dueDate ? ` para ${task.dueDate}` : ''}.`, result: task };
 }

 const habitMatch = value.match(/\b(?:crea|crear|agrega|agregar|añade|añadir)\s+(?:un\s+)?hábito(?:\s+(?:de|:))?\s+(.+)/i);
 if (habitMatch) {
 const habit = await FlowHabits.create({ name: _cleanCommandTitle(habitMatch[1]) || 'Nuevo hábito' });
 return { text: ` Listo: creé el hábito “${habit.name}”.`, result: habit };
 }

 const goalMatch = value.match(/\b(?:crea|crear|agrega|agregar|añade|añadir)\s+(?:una\s+)?meta(?:\s+(?:de|:))?\s+(.+)/i);
 if (goalMatch) {
 const goal = await FlowGoals.create({ title: _cleanCommandTitle(goalMatch[1]) || 'Nueva meta' });
 return { text: ` Listo: creé la meta “${goal.title}”.`, result: goal };
 }

 const projectMatch = value.match(/\b(?:crea|crear|agrega|agregar|añade|añadir)\s+(?:un\s+)?proyecto(?:\s+(?:de|:))?\s+(.+)/i);
 if (projectMatch) {
 const project = await FlowProjects.create({ name: _cleanCommandTitle(projectMatch[1]) || 'Nuevo proyecto' });
 return { text: ` Listo: creé el proyecto “${project.name}”.`, result: project };
 }

 if (/\b(?:inicia|iniciar|empieza|empezar)\b.*\b(pomodoro|cronómetro|cronometro)\b/i.test(normalized)) {
 const isPomodoro = /\bpomodoro\b/i.test(normalized);
 const result = isPomodoro ? FlowTimer.startPomodoro() : FlowTimer.startStopwatch();
 return { text: `▶ ${isPomodoro ? 'Pomodoro' : 'Cronómetro'} iniciado.`, result };
 }
 if (/\b(?:pausa|pausar)\b.*\b(pomodoro|cronómetro|cronometro|temporizador)\b/i.test(normalized)) {
 const result = FlowTimer.pauseTimer();
 return { text: '⏸ Temporizador pausado.', result };
 }
 if (/\b(?:detén|detener|para|parar)\b.*\b(pomodoro|cronómetro|cronometro|temporizador)\b/i.test(normalized)) {
 const result = await FlowTimer.stopTimer();
 return { text: '⏹ Temporizador detenido y tiempo guardado.', result };
 }
 return null;
 }

 function _addToHistory(role, content) {
 const history = FlowState.get('ai.chatHistory') || [];
 const entry = { role, content, ts: new Date().toISOString(), id: FlowStorage.generateId('msg_') };
 FlowState.set('ai.chatHistory', [...history, entry].slice(-100));
 }

 function prepareUserSession() {
 const userId=String(FlowState.get('user.id')||'');
 if(FlowState.get('ai.chatHistoryOwner')!==userId){
  FlowState.set('ai.chatHistory',[]);
  FlowState.set('ai.chatHistoryOwner',userId);
  FlowState.persist();
 }
 }

 function clearHistory() {
 FlowState.set('ai.chatHistory', []);
 FlowState.set('ai.chatHistoryOwner', String(FlowState.get('user.id')||''));
 }

 function getSuggestions() {
 return FlowState.get('ai.suggestions') || [];
 }

 /** Devuelve true si hay una URL de servidor configurada y un modelo seleccionado */
 function isConfigured() {
 return !!FlowState.get('user.id') || !!FlowState.get('user.email');
 }

 /** Guardar configuración del servidor local */
 function saveConfig(config) {
 FlowState.batch(() => {
 if (config.provider) FlowState.set('ai.provider', config.provider);
 if (config.baseUrl !== undefined) FlowState.set('ai.baseUrl', _normalizeBaseUrl(config.baseUrl));
 if (config.model !== undefined) FlowState.set('ai.model', String(config.model).trim());
 if (config.temperature !== undefined) FlowState.set('ai.temperature', config.temperature);
 if (config.maxTokens) FlowState.set('ai.maxTokens', config.maxTokens);
 if (config.timeout) FlowState.set('ai.timeout', config.timeout);
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
 chat, planDay, estimateTask, sanitizeAssistantText: _stripInternalActionMarkup,
 detectOverload, suggestPriorities, dailySummary,
 analyzeDayContext, clearHistory, prepareUserSession, getSuggestions,
 };

})();
