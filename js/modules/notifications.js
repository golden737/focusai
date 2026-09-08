// ── FocusAI Notifications ────────────────────────────────────────────────────
// Notificaciones push, recordatorios inteligentes, alertas de vencimiento.

window.FlowNotifications = (() => {

  const _scheduled = new Map(); // id → timeoutId

  async function init() {
    const perm = await _checkPermission();
    FlowState.set('notifications.permission', perm);

    // Escuchar mensajes del SW para acciones push
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'NOTIFICATION_ACTION') _handleAction(e.data);
      });
    }

    // Programar recordatorios de las tareas ya cargadas
    const tasks = FlowState.get('tasks.items') || [];
    tasks.filter((t) => t.reminder && !t.reminderSent && !t.completed).forEach(schedule);

    // Verificar tareas vencidas cada 5 minutos
    setInterval(_checkOverdue, 5 * 60 * 1000);
    _checkOverdue();
  }

  // ── Permisos ──────────────────────────────────────────────────────────────

  async function requestPermission() {
    if (!('Notification' in window)) return 'denied';
    const perm = await Notification.requestPermission();
    FlowState.set('notifications.permission', perm);
    return perm;
  }

  async function _checkPermission() {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  // ── Programar recordatorios de tareas ────────────────────────────────────

  function schedule(task) {
    if (!task.reminder) return;
    const ms = new Date(task.reminder) - Date.now();
    if (ms <= 0) return;

    cancel(`task_${task.id}`);

    const timeoutId = setTimeout(async () => {
      await _send({
        title:   `⏰ Recordatorio: ${task.title}`,
        body:    task.dueDate ? `Vence: ${task.dueDate}${task.dueTime ? ' a las ' + task.dueTime : ''}` : 'Tienes una tarea pendiente.',
        tag:     `task_${task.id}`,
        data:    { taskId: task.id, view: 'tasks' },
        actions: [
          { action: 'complete', title: '✓ Completar' },
          { action: 'snooze',   title: '⏱ +15 min' },
        ],
      });
      await FlowTasks.update(task.id, { reminderSent: true });
    }, ms);

    _scheduled.set(`task_${task.id}`, timeoutId);
  }

  function scheduleHabit(habit) {
    if (!habit.reminderTime) return;
    cancel(`habit_${habit.id}`);

    // Calcular ms hasta la hora del recordatorio de hoy
    const [h, m]  = habit.reminderTime.split(':').map(Number);
    const now     = new Date();
    const target  = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1); // mañana si ya pasó
    const ms = target - now;

    const timeoutId = setTimeout(async () => {
      await _send({
        title: `${habit.icon} Recordatorio de hábito`,
        body:  `No olvides: ${habit.name}${habit.streak > 1 ? ` · Racha: ${habit.streak} días 🔥` : ''}`,
        tag:   `habit_${habit.id}`,
        data:  { habitId: habit.id, view: 'habits' },
      });
      // Re-programar para mañana
      scheduleHabit(habit);
    }, ms);

    _scheduled.set(`habit_${habit.id}`, timeoutId);
  }

  function snooze(taskId, minutes = 15) {
    const task = FlowState.array.find('tasks.items', (t) => t.id === taskId);
    if (!task) return;
    const newReminder = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    FlowTasks.update(taskId, { reminder: newReminder, reminderSent: false });
    schedule({ ...task, reminder: newReminder });
    FlowApp.toast(`Recordatorio pospuesto ${minutes} min`, 'info');
  }

  function cancel(id) {
    const tid = _scheduled.get(id);
    if (tid !== undefined) { clearTimeout(tid); _scheduled.delete(id); }
  }

  // ── Alertas de vencimiento ────────────────────────────────────────────────

  function _checkOverdue() {
    const settings = FlowState.get('notifications.settings');
    if (!settings?.taskReminders) return;

    const today   = new Date().toISOString().split('T')[0];
    const tasks   = FlowState.get('tasks.items') || [];
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !t.completed && !t.archived);

    if (overdue.length > 0 && FlowState.get('notifications.permission') === 'granted') {
      _send({
        title: `⚠️ Tienes ${overdue.length} tarea${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''}`,
        body:  overdue.slice(0, 3).map((t) => `• ${t.title}`).join('\n'),
        tag:   'overdue-alert',
        data:  { view: 'tasks', filter: 'overdue' },
      });
    }
  }

  // ── Notificación local inmediata ──────────────────────────────────────────

  async function pushLocal(title, body, options = {}) {
    await _send({ title, body, tag: options.tag || 'local', ...options });
  }

  async function _send({ title, body, tag, data = {}, actions = [], requireInteraction = false }) {
    if (FlowState.get('notifications.permission') !== 'granted') return;

    const payload = {
      body, tag, data,
      icon:    '/assets/icons/icon-192.png',
      badge:   '/assets/icons/icon-96.png',
      vibrate: [100, 50, 100],
      actions,
      requireInteraction,
    };

    // Intentar via Service Worker (permite acciones)
    if (navigator.serviceWorker?.controller) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, payload);
        return;
      } catch {}
    }

    // Fallback: Notification API directa
    try { new Notification(title, payload); } catch {}
  }

  function _handleAction({ action, taskId, habitId }) {
    if (action === 'complete' && taskId) FlowTasks.complete(taskId);
    if (action === 'snooze'   && taskId) snooze(taskId, 15);
  }

  // ── Reporte semanal por email (simulado / webhook) ────────────────────────

  async function sendWeeklyReport() {
    const settings = FlowState.get('notifications.settings');
    if (!settings?.emailEnabled || !settings?.emailAddress) return;

    const report  = await FlowStats.generateReport('week');
    const payload = {
      to:      settings.emailAddress,
      subject: `FocusAI — Tu resumen semanal 📊`,
      body:    report,
    };

    // En producción: llamar a tu propio backend o servicio de email
    console.info('[Notifications] Reporte semanal listo para enviar:', payload);
    FlowApp.toast('Reporte semanal generado', 'success');
    return payload;
  }

  // ── API pública extra ─────────────────────────────────────────────────────

  function getQueue() {
    return FlowState.get('notifications.queue') || [];
  }

  function updateSettings(changes) {
    FlowState.update('notifications.settings', changes);
  }

  return {
    init,
    requestPermission,
    schedule, scheduleHabit, snooze, cancel,
    pushLocal,
    sendWeeklyReport,
    getQueue, updateSettings,
  };

})();
