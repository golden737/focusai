// ── FocusAI App ──────────────────────────────────────────────────────────────
// Punto de entrada principal. Orquesta la inicialización de todos los módulos,
// conecta el sidebar, el panel IA, los toasts y arranca el router.

// Modal global disponible desde el inicio
window.showGlobalModal = function({ title = '', content = '', size = 'md', onConfirm, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar' } = {}) {
  const existing = document.getElementById('global-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('dialog');
  dialog.id = 'global-dialog';
  dialog.className = 'native-dialog';
  dialog.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">${title}</h2>
      <button class="icon-btn" onclick="document.getElementById('global-dialog').close()">✕</button>
    </div>
    <div class="modal-body">${content}</div>
    ${onConfirm ? `
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="document.getElementById('global-dialog').close()">${cancelLabel}</button>
      <button class="btn btn-primary" id="dialog-confirm-btn">${confirmLabel}</button>
    </div>` : ''}`;

  document.body.appendChild(dialog);
  dialog.showModal();

  dialog.querySelector('#dialog-confirm-btn')?.addEventListener('click', () => {
    onConfirm();
    dialog.close();
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
};

window.closeGlobalModal = function() {
  const d = document.getElementById('global-dialog');
  if (d) d.close();
};

window.FlowApp = (() => {

  // ── Inicialización ────────────────────────────────────────────────────────

  async function init() {
    try {
      _showLoader('Iniciando FocusAI…');

      // 1. Restaurar preferencias del usuario (tema, sidebar, apiKey…)
      FlowState.restore();

      // 2. Aplicar tema y color antes de renderizar
      _applyTheme(FlowState.get('user.theme') || 'dark');
      const savedColor = FlowState.get('user.accentColor');
      if (savedColor) document.documentElement.style.setProperty('--accent', savedColor);

      // 3. Inicializar base de datos (IndexedDB)
      _showLoader('Cargando datos…');
      await FlowStorage.init();

      // 4. Cargar datos desde IndexedDB al estado global
      _showLoader('Sincronizando…');
      await _loadAllData();

      // 5. Inicializar módulos en paralelo (los que no dependen de la UI)
      await Promise.allSettled([
        FlowNotifications.init(),
        FlowGamification.init(),
        FlowRecurrence.expandUpcoming(),
      ]);

      // 6. Montar componentes globales de la UI
      _mountSidebar();
      _mountAIPanel();
      _mountToasts();
      _bindGlobalShortcuts();
      _bindServiceWorkerMessages();

      // 7. Generar badges de tareas pendientes
      _updateTaskBadge();

      // 7.5 Inicializar auth
      _initAuth();

      // 8. Arrancar el router (navega a la vista inicial)
      FlowRouter.init();

      // 9. Si tiene API key, pedir a la IA que analice el día
      if (FlowState.get('ai.apiKey')) {
        setTimeout(() => FlowAI.analyzeDayContext(), 1500);
      }

      // 10. Ocultar loader y mostrar app
      _hideLoader();



    } catch (err) {
      console.error('[App] Error en inicialización:', err);
      _showLoaderError(err.message);
    }
  }

  // ── Carga de datos al arranque ────────────────────────────────────────────

  async function _loadAllData() {
    const [tasks, events, habits, habitLogs, goals, projects, timeLogs, entries, moodLogs, gamification] =
      await Promise.allSettled([
        FlowStorage.getAll('tasks'),
        FlowStorage.getAll('events'),
        FlowStorage.getAll('habits'),
        FlowStorage.getAll('habit_logs'),
        FlowStorage.getAll('goals'),
        FlowStorage.getAll('projects'),
        FlowStorage.getAll('time_logs'),
        FlowStorage.getAll('journal'),
        FlowStorage.getAll('mood_logs'),
        FlowStorage.get('meta', 'gamification'),
      ]);

    FlowState.batch(() => {
      if (tasks.status       === 'fulfilled') FlowState.set('tasks.items',        tasks.value       || []);
      if (events.status      === 'fulfilled') FlowState.set('calendar.events',    events.value      || []);
      if (habits.status      === 'fulfilled') FlowState.set('habits.items',       habits.value      || []);
      if (habitLogs.status   === 'fulfilled') FlowState.set('habits.logs',        habitLogs.value   || []);
      if (goals.status       === 'fulfilled') FlowState.set('goals.items',        goals.value       || []);
      if (projects.status    === 'fulfilled') FlowState.set('projects.items',     projects.value    || []);
      if (timeLogs.status    === 'fulfilled') FlowState.set('timer.logs',         timeLogs.value    || []);
      if (entries.status     === 'fulfilled') FlowState.set('personal.entries',   entries.value     || []);
      if (moodLogs.status    === 'fulfilled') FlowState.set('personal.moodLogs',  moodLogs.value    || []);
      if (gamification.value)                FlowState.update('gamification',     gamification.value);
    });
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────

  function _mountSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle  = document.getElementById('sidebar-toggle');
    const mobileToggle = document.getElementById('mobile-nav-toggle');
    if (!sidebar || !toggle) return;

    // Restaurar estado colapsado
    const collapsed = FlowState.get('ui.sidebarCollapsed');
    if (collapsed) sidebar.classList.add('collapsed');

    toggle.addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('collapsed');
      FlowState.set('ui.sidebarCollapsed', isCollapsed);
      toggle.setAttribute('aria-label', isCollapsed ? 'Expandir menú' : 'Colapsar menú');
    });

    mobileToggle?.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('mobile-open');
      mobileToggle.setAttribute('aria-expanded', String(isOpen));
      mobileToggle.setAttribute('aria-label', isOpen ? 'Cerrar navegación' : 'Abrir navegación');
    });

    sidebar.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      mobileToggle?.setAttribute('aria-expanded', 'false');
      mobileToggle?.setAttribute('aria-label', 'Abrir navegación');
    }));

    // Actualizar nombre y avatar del usuario
    FlowState.subscribe('user.name', (name) => {
      const el = document.getElementById('user-name');
      if (el) el.textContent = name || 'Usuario';
      const av = document.getElementById('user-avatar');
      if (av) av.textContent = (name || 'FM').substring(0, 2).toUpperCase();
    });

    // Actualizar XP bar y nivel
    FlowState.subscribe('gamification', (g) => {
      _updateXPBar(g);
    });

    _updateXPBar(FlowState.get('gamification'));

    // Suscribir badge de tareas
    FlowState.subscribe('tasks.items', _updateTaskBadge);
  }

  function _updateXPBar(g) {
    if (!g) return;
    const xpFill    = document.getElementById('xp-fill');
    const levelText = document.getElementById('user-level-text');
    const xpNeeded  = g.level * 100;
    const pct       = Math.min(100, (g.xp / xpNeeded) * 100);
    if (xpFill)    xpFill.style.width = `${pct}%`;
    if (levelText) levelText.textContent = `Nivel ${g.level} · ${g.xp}/${xpNeeded} XP`;
  }

  function _updateTaskBadge() {
    const tasks   = FlowState.get('tasks.items') || [];
    const pending = tasks.filter((t) => !t.completed && !t.archived).length;
    const badge   = document.getElementById('badge-tasks');
    if (!badge) return;
    badge.textContent = pending > 99 ? '99+' : String(pending);
    badge.hidden = pending === 0;
  }

  // ── Panel IA ──────────────────────────────────────────────────────────────

  function _mountAIPanel() {
    const fab   = document.getElementById('ai-fab');
    const panel = document.getElementById('ai-panel');
    if (!fab || !panel) return;

    fab.addEventListener('click', () => _toggleAIPanel());

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && FlowState.get('ai.panelOpen')) {
        _toggleAIPanel(false);
      }
    });

    // Suscribir estado del panel
    FlowState.subscribe('ai.panelOpen', (open) => {
      panel.hidden = !open;
      fab.classList.toggle('active', open);
      fab.setAttribute('aria-label', open ? 'Cerrar asistente IA' : 'Abrir asistente IA');
      if (open) {
        // Cargar el componente de chat si aún no está montado
        _ensureAIChatLoaded();
      }
    });

    // Pulso animado si tiene sugerencias
    FlowState.subscribe('ai.suggestions', (suggestions) => {
      const pulse = fab.querySelector('.ai-fab-pulse');
      if (pulse) pulse.style.display = suggestions?.length ? 'block' : 'none';
    });
  }

  function _toggleAIPanel(force) {
    const current = FlowState.get('ai.panelOpen');
    FlowState.set('ai.panelOpen', force !== undefined ? force : !current);
  }

  async function _ensureAIChatLoaded() {
    const inner = document.getElementById('ai-panel-inner');
    if (!inner || inner.children.length > 0) return;
    try {
      const res  = await fetch('components/ai-chat.html');
      const html = await res.text();
      inner.innerHTML = html;
      // Ejecutar scripts del componente
      inner.querySelectorAll('script').forEach((old) => {
        const s = document.createElement('script');
        s.textContent = old.textContent;
        old.replaceWith(s);
      });
    } catch (e) {
      console.error('[App] Error cargando ai-chat:', e);
    }
  }

  // ── Sistema de Toasts ─────────────────────────────────────────────────────

  function _mountToasts() {
    // Escuchar peticiones de toasts desde cualquier módulo
    window.addEventListener('focusai:toast', (e) => {
      _renderToast(e.detail);
    });
  }

  function _renderToast({ message, type = 'info', duration = 3500, action }) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
      ${action ? `<button class="toast-action" data-action>${action.label}</button>` : ''}
      <button class="toast-close" aria-label="Cerrar">✕</button>
    `;

    if (action) {
      toast.querySelector('[data-action]').addEventListener('click', () => {
        action.fn();
        _dismissToast(toast);
      });
    }

    toast.querySelector('.toast-close').addEventListener('click', () => _dismissToast(toast));

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));

    const timer = setTimeout(() => _dismissToast(toast), duration);
    toast._timer = timer;
  }

  function _dismissToast(toast) {
    clearTimeout(toast._timer);
    toast.classList.remove('visible');
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }


  // ── Tema ─────────────────────────────────────────────────────────────────

  function _applyTheme(theme) {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  // ── Loader de arranque ────────────────────────────────────────────────────

  function _showLoader(msg = '') {
    const loader = document.getElementById('app-loader');
    if (!loader) return;
    const sub = loader.querySelector('.loader-name');
    // Animar barra de progreso
    const fill = loader.querySelector('.loader-fill');
    if (fill) {
      const pct = { 'Iniciando FocusAI…': 20, 'Cargando datos…': 55, 'Sincronizando…': 80 };
      fill.style.width = (pct[msg] || 90) + '%';
    }
  }

  function _hideLoader() {
    const loader = document.getElementById('app-loader');
    const app    = document.getElementById('app');
    if (!loader || !app) return;
    const fill = loader.querySelector('.loader-fill');
    if (fill) fill.style.width = '100%';
    setTimeout(() => {
      loader.style.opacity    = '0';
      loader.style.transform  = 'scale(0.98)';
      loader.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      app.hidden = false;
      requestAnimationFrame(() => {
        app.style.opacity   = '0';
        app.style.transform = 'translateY(4px)';
        app.style.transition = 'opacity 0.3s ease 0.1s, transform 0.3s ease 0.1s';
        requestAnimationFrame(() => {
          app.style.opacity   = '1';
          app.style.transform = 'translateY(0)';
        });
      });
      setTimeout(() => loader.remove(), 400);
    }, 300);
  }

  function _showLoaderError(message) {
    const loader = document.getElementById('app-loader');
    if (!loader) return;
    loader.innerHTML = `
      <div style="text-align:center;padding:2rem">
        <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
        <h2 style="color:#fff;margin-bottom:.5rem">Error al iniciar</h2>
        <p style="color:#999;margin-bottom:1.5rem;font-size:.9rem">${message}</p>
        <button onclick="location.reload()" style="padding:.6rem 1.4rem;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9rem">
          Reintentar
        </button>
      </div>`;
  }


  // ── Atajos de teclado globales ────────────────────────────────────────────

  function _bindGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ignorar si estamos en un input / textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'k') { e.preventDefault(); FlowSearch.openGlobal(); }
      if (mod && e.key === 'n') { e.preventDefault(); FlowTasks.openNewTaskModal(); }
      if (mod && e.key === '/') { e.preventDefault(); _toggleAIPanel(); }
      if (mod && e.key === 'f') { e.preventDefault(); FlowRouter.navigate('focus'); }

      // Navegación con teclas numéricas (1-9)
      if (!mod && !e.shiftKey && !e.altKey) {
        const views = ['dashboard','tasks','calendar','timer','habits','goals','projects','stats','focus'];
        const idx   = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < views.length) FlowRouter.navigate(views[idx]);
      }
    });
  }

  // ── Mensajes del Service Worker ───────────────────────────────────────────

  function _bindServiceWorkerMessages() {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.addEventListener('message', (e) => {
      const { type, taskId, minutes, dataType } = e.data || {};
      if (type === 'COMPLETE_TASK' && taskId) FlowTasks.complete(taskId);
      if (type === 'SNOOZE_TASK'   && taskId) FlowNotifications.snooze(taskId, minutes);
      if (type === 'BACKGROUND_SYNC')         FlowSync.syncNow(dataType);
    });
  }

  // ── API pública ───────────────────────────────────────────────────────────

  function toast(message, type = 'info', options = {}) {
    window.dispatchEvent(new CustomEvent('focusai:toast', {
      detail: { message, type, ...options }
    }));
  }

 
  function setTheme(theme) {
    FlowState.set('user.theme', theme);
    _applyTheme(theme);
    // Escuchar cambios del sistema si es 'system'
    if (theme === 'system') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      });
    }
  }

  function reload(clearCache = false) {
    if (clearCache) FlowRouter.invalidateAll();
    window.location.reload();
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  function _initAuth() {
    // Escuchar cambios de autenticación de Supabase
    if (FlowSupabase.isConfigured()) {
      FlowSupabase.onAuthChange((event, user) => {
        if (event === 'SIGNED_OUT' || !user) {
          FlowState.set('user.id', null);
          FlowRouter.navigate('login');
        } else if (user) {
          FlowState.update('user', {
            id:    user.id,
            email: user.email,
            name:  user.user_metadata?.name || user.email?.split('@')[0],
          });
        }
      });
    }
  }

  async function logout() {
    if (FlowSupabase.isConfigured()) {
      await FlowSupabase.signOut();
    }
    FlowState.set('user.id', null);
    FlowState.set('user.name', null);
    FlowState.set('user.email', null);
    localStorage.clear();
    FlowRouter.navigate('login');
  }

  // ── Arrancar cuando el DOM esté listo ────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function showModal({ title = '', content = '', size = 'md', onConfirm, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar' } = {}) {
    const existing = document.getElementById('global-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'global-dialog';
    dialog.className = 'native-dialog';
    dialog.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="icon-btn" id="dialog-close-btn">✕</button>
      </div>
      <div class="modal-body">${content}</div>
      ${onConfirm ? `
      <div class="modal-footer">
        <button class="btn btn-ghost" id="dialog-cancel-btn">${cancelLabel}</button>
        <button class="btn btn-primary" id="dialog-confirm-btn">${confirmLabel}</button>
      </div>` : ''}`;

    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.querySelector('#dialog-close-btn').addEventListener('click', () => dialog.close());
    dialog.querySelector('#dialog-cancel-btn')?.addEventListener('click', () => dialog.close());
    dialog.querySelector('#dialog-confirm-btn')?.addEventListener('click', () => {
      onConfirm();
      dialog.close();
    });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  function closeModal() {
    const dialog = document.getElementById('global-dialog');
    if (dialog) dialog.close();
  }

 return { 
  toast, 
  showModal: window.showGlobalModal, 
  closeModal: window.closeGlobalModal, 
  setTheme, 
  reload,
  logout
};

})();
