// ── FocusAI Router ───────────────────────────────────────────────────────────
// Router basado en hash (#dashboard, #tasks, etc.)
// Carga vistas HTML desde /views/, ejecuta hooks de ciclo de vida y
// actualiza el estado de navegación en FlowState.

window.FlowRouter = (() => {

  // ── Rutas registradas ─────────────────────────────────────────────────────
  // Cada ruta puede tener: view (archivo HTML), onEnter, onLeave, title, guards
  const _routes = new Map();

  // Rutas por defecto de la app
  const DEFAULT_ROUTES = [
    { path: 'dashboard',    view: 'views/dashboard.html',    title: 'Dashboard',      icon: '⬛' },
    { path: 'tasks',        view: 'views/tasks.html',        title: 'Tareas',         icon: '✅' },
    { path: 'calendar',     view: 'views/calendar.html',     title: 'Calendario',     icon: '📅' },
    { path: 'timer',        view: 'views/timer.html',        title: 'Tiempo',         icon: '⏱' },
    { path: 'habits',       view: 'views/habits.html',       title: 'Hábitos',        icon: '⭐' },
    { path: 'goals',        view: 'views/goals.html',        title: 'Objetivos',      icon: '🎯' },
    { path: 'projects',     view: 'views/projects.html',     title: 'Proyectos',      icon: '📁' },
    { path: 'stats',        view: 'views/stats.html',        title: 'Estadísticas',   icon: '📊' },
    { path: 'focus',        view: 'views/focus.html',        title: 'Enfoque',        icon: '🌟' },
    { path: 'personal',     view: 'views/personal.html',     title: 'Personal',       icon: '💚' },
    { path: 'gamification', view: 'views/gamification.html', title: 'Logros',         icon: '🏆' },
    { path: 'settings',     view: 'views/settings.html',     title: 'Ajustes',        icon: '⚙️' },
    { path: 'login',         view: 'views/login.html',         title: 'Iniciar sesión', icon: '🔐' },
    { path: 'teams',         view: 'views/teams.html',         title: 'Equipos',        icon: '👥' },
  ];

  // Cache de vistas ya cargadas (evita fetches repetidos)
  const _viewCache = new Map();

  // Estado de navegación
  let _currentPath  = null;
  let _currentQuery = {};
  let _isNavigating = false;
  let _history      = [];

  // ── Registro de rutas ─────────────────────────────────────────────────────

  function register(path, config = {}) {
    _routes.set(path, {
      path,
      view:    config.view    || null,
      title:   config.title   || path,
      icon:    config.icon    || '',
      onEnter: config.onEnter || null,   // fn(params, query) → puede ser async
      onLeave: config.onLeave || null,   // fn() → puede retornar false para bloquear
      guards:  config.guards  || [],     // Array<fn> → cada guard retorna bool
      cache:   config.cache   !== false, // cachear el HTML de la vista por defecto
    });
  }

  // Registrar todas las rutas por defecto
  DEFAULT_ROUTES.forEach((r) => register(r.path, r));

  // ── Parseo de URL hash ────────────────────────────────────────────────────

  function _parseHash(hash = '') {
    const clean = hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = clean.split('?');
    const query = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((v, k) => { query[k] = v; });
    }
    return { path: pathPart || 'dashboard', query };
  }

  // ── Carga de vistas ───────────────────────────────────────────────────────

    async function _loadView(route) {
    if (!route.path) return '';

    // Las vistas viven en /views. Mantener una única fuente evita que una
    // corrección quede oculta por una copia antigua dentro de index.html.
    if (!route.view) return '';
    if (route.cache && _viewCache.has(route.path)) return _viewCache.get(route.path);
    try {
      const res = await fetch(route.view);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (route.cache) _viewCache.set(route.path, html);
      return html;
    } catch (err) {
      console.error(`[Router] Error cargando vista "${route.view}":`, err);
      return _errorView(route.path, err.message);
    }
  }

  function _errorView(path, message) {
    return `
      <div class="view-error">
        <div class="view-error-icon">⚠️</div>
        <h2>No se pudo cargar la vista</h2>
        <p class="text-muted">Ruta: <code>${path}</code></p>
        <p class="text-muted">${message}</p>
        <button class="btn btn-primary" onclick="FlowRouter.navigate('dashboard')">
          Volver al Dashboard
        </button>
      </div>`;
  }

  // ── Navegación principal ──────────────────────────────────────────────────

  async function navigate(path, query = {}, options = {}) {
    if (_isNavigating) return;

    const { replace = false, silent = false } = options;

    // Normalizar path
    path = path.replace(/^#\/?/, '') || 'dashboard';

    // Misma ruta → sólo actualizar query si es diferente
    if (path === _currentPath && !options.force) {
      if (Object.keys(query).length) _updateQuery(query);
      return;
    }

    const route = _routes.get(path);
    if (!route) {
      console.warn(`[Router] Ruta no encontrada: "${path}". Redirigiendo a dashboard.`);
      return navigate('dashboard');
    }

    _isNavigating = true;

    // ① Guards: si alguno retorna false, cancelar navegación
    for (const guard of route.guards) {
      const pass = await guard(path, query);
      if (!pass) { _isNavigating = false; return; }
    }

    // ② Guard: si no hay usuario, redirigir a login
    if (path !== 'login' && !FlowState.get('user.id')) {
      _isNavigating = false;
      return navigate('login');
    }

    // ③ onLeave de la ruta actual
    if (_currentPath) {
      const currentRoute = _routes.get(_currentPath);
      if (currentRoute?.onLeave) {
        const canLeave = await currentRoute.onLeave();
        if (canLeave === false) { _isNavigating = false; return; }
      }
    }

    // ④ Mostrar loading en la vista
    _setLoading(true);

    // ⑤ Cargar HTML de la vista
    const html = await _loadView(route);

    // ⑥ Inyectar en el DOM
    const container = document.getElementById('view-container');
    if (container) {
      // Fade out
      container.style.opacity = '0';
      container.style.transform = 'translateY(6px)';

      await _sleep(80);

      container.innerHTML = html;

      // Ejecutar scripts inline en scope global
      const scripts = container.querySelectorAll('script');
      scripts.forEach((script) => {
        try {
          // eslint-disable-next-line no-eval
          window.eval(script.textContent);
        } catch (e) {
          console.warn('[Router] Error en script de vista:', e.message);
        }
      });

      // Fade in
      requestAnimationFrame(() => {
        container.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        container.style.opacity    = '1';
        container.style.transform  = 'translateY(0)';
        setTimeout(() => { container.style.transition = ''; }, 200);
      });
    }

    // ⑦ Actualizar estado y URL
    _history.push({ path: _currentPath, query: _currentQuery });
    if (_history.length > 50) _history.shift();

    _currentPath  = path;
    _currentQuery = query;

    if (!silent) {
      const hashQuery = Object.keys(query).length
        ? '?' + new URLSearchParams(query).toString()
        : '';
      const newHash = `#${path}${hashQuery}`;
      if (replace) {
        history.replaceState({ path, query }, '', newHash);
      } else {
        history.pushState({ path, query }, '', newHash);
      }
    }

    // ⑧ Actualizar título de la página
    document.title = `${route.title} — FocusAI`;

    // ⑨ Actualizar nav activo en sidebar
    _updateNavActive(path);

    // ⑩ Actualizar estado global
    FlowState.batch(() => {
      FlowState.set('ui.previousView', FlowState.get('ui.currentView'));
      FlowState.set('ui.currentView', path);
    });

    // ⑪ onEnter del nuevo route
    if (route.onEnter) {
      try { await route.onEnter(_parseParams(path), query); }
      catch (e) { console.error(`[Router] onEnter error en "${path}":`, e); }
    }

    _setLoading(false);
    _isNavigating = false;

    // Emitir evento de navegación por si algún módulo necesita reaccionar
    window.dispatchEvent(new CustomEvent('flowrouter:navigate', {
      detail: { path, query, route }
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _updateNavActive(path) {
    document.querySelectorAll('.nav-item').forEach((el) => {
      const view = el.dataset.view;
      el.classList.toggle('active', view === path);
      el.setAttribute('aria-current', view === path ? 'page' : 'false');
    });
  }

  function _updateQuery(query) {
    _currentQuery = { ..._currentQuery, ...query };
    const hashQuery = Object.keys(_currentQuery).length
      ? '?' + new URLSearchParams(_currentQuery).toString()
      : '';
    history.replaceState({ path: _currentPath, query: _currentQuery }, '', `#${_currentPath}${hashQuery}`);
  }

  function _setLoading(state) {
    FlowState.set('ui.loading', state);
    const container = document.getElementById('view-container');
    if (container) container.classList.toggle('loading', state);
  }

  function _parseParams(path) {
    // Soporte futuro para rutas con parámetros tipo :id
    return {};
  }

  function _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── API de navegación adicional ───────────────────────────────────────────

  function back() {
    const prev = _history.pop();
    if (prev?.path) navigate(prev.path, prev.query, { replace: true });
    else navigate('dashboard');
  }

  function getCurrentPath() { return _currentPath; }
  function getCurrentQuery() { return { ..._currentQuery }; }
  function getQuery(key) { return _currentQuery[key] ?? null; }

  function addGuard(path, guardFn) {
    const route = _routes.get(path);
    if (route) route.guards.push(guardFn);
  }

  function on(path, hook, fn) {
    const route = _routes.get(path);
    if (!route) return;
    if (hook === 'enter') route.onEnter = fn;
    if (hook === 'leave') route.onLeave = fn;
  }

  // Invalidar caché de una vista (forzar recarga del HTML)
  function invalidate(path) {
    _viewCache.delete(path);
  }

  // Invalidar todas las vistas
  function invalidateAll() {
    _viewCache.clear();
  }

  // ── Inicio del router ─────────────────────────────────────────────────────

  function init() {
    // Escuchar cambios de hash (navegación con botones del navegador)
    window.addEventListener('hashchange', () => {
      const { path, query } = _parseHash(location.hash);
      navigate(path, query, { silent: true });
    });

    // Interceptar clicks en enlaces internos
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-view], a[href^="#"]');
      if (!link) return;
      e.preventDefault();
      const view  = link.dataset.view;
      const href  = link.getAttribute('href');
      const target = view || _parseHash(href).path;
      if (target) navigate(target);
    });

    // Navegar a la ruta inicial
    const { path, query } = _parseHash(location.hash);
    navigate(path, query, { replace: true });
  }

  return {
    init,
    navigate,
    back,
    register,
    on,
    addGuard,
    invalidate,
    invalidateAll,
    getCurrentPath,
    getCurrentQuery,
    getQuery,
  };

})();
