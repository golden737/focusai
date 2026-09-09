// ── FocusAI Focus ────────────────────────────────────────────────────────────
// Modo enfoque, bloqueador de distracciones, música y estadísticas.

window.FlowFocus = (() => {

  let _sessionTimer = null;
  let _sessionStart = null;

  // ── Iniciar / detener sesión de enfoque ───────────────────────────────────

  async function start(mode = 'deep', durationMin = null) {
    if (FlowState.get('focus.active')) return;

    _sessionStart = Date.now();
    FlowState.batch(() => {
      FlowState.set('focus.active',       true);
      FlowState.set('focus.sessionStart', new Date().toISOString());
      FlowState.set('focus.mode',         mode);
    });

    // Notificación de inicio
    FlowNotifications.pushLocal('🌟 Modo Enfoque activado', _modeLabel(mode));
    FlowApp.toast(`🌟 Sesión de ${_modeLabel(mode)} iniciada`, 'success');

    // Temporizador automático si se indica duración
    if (durationMin) {
      _sessionTimer = setTimeout(() => end(true), durationMin * 60 * 1000);
    }

    // Aplicar estilos de enfoque al documento
    document.documentElement.classList.add('focus-mode', `focus-${mode}`);
  }

  async function end(auto = false) {
    if (!FlowState.get('focus.active')) return;

    clearTimeout(_sessionTimer);
    _sessionTimer = null;

    const durationMin = _sessionStart
      ? Math.round((Date.now() - _sessionStart) / 60000)
      : 0;

    // Guardar estadísticas
    const stats = FlowState.get('focus.stats') || { todaySessions: 0, todayMinutes: 0, weekSessions: 0 };
    FlowState.update('focus.stats', {
      todaySessions: stats.todaySessions + 1,
      todayMinutes:  stats.todayMinutes  + durationMin,
      weekSessions:  stats.weekSessions  + 1,
    });

    // Guardar log en IndexedDB
    if (durationMin >= 1) {
      await FlowStorage.save('focus_logs', {
        id:          FlowStorage.generateId('foc_'),
        date:        new Date().toISOString().split('T')[0],
        mode:        FlowState.get('focus.mode'),
        durationMin,
        auto,
        createdAt:   new Date().toISOString(),
      });
    }

    // XP por sesión de enfoque
    if (durationMin >= 25) FlowGamification.addXP(20, 'focus_session');

    FlowState.batch(() => {
      FlowState.set('focus.active',       false);
      FlowState.set('focus.sessionStart', null);
    });

    document.documentElement.classList.remove('focus-mode', 'focus-deep', 'focus-light', 'focus-custom');
    _sessionStart = null;

    if (auto) {
      FlowNotifications.pushLocal('✅ Sesión de enfoque completada', `${durationMin} minutos de trabajo profundo`);
      FlowApp.toast(`✅ Sesión completada · ${durationMin} min`, 'success', { duration: 5000 });
    } else {
      FlowApp.toast(`Sesión terminada · ${durationMin} min`, 'info');
    }
  }

  function toggle() {
    FlowState.get('focus.active') ? end() : start();
  }

  // ── Configuración de sitios bloqueados ────────────────────────────────────

  function addBlockedSite(url) {
    const sites = FlowState.get('focus.blockedSites') || [];
    const clean = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    if (!sites.includes(clean)) {
      FlowState.set('focus.blockedSites', [...sites, clean]);
      FlowState.persist();
      FlowApp.toast(`Sitio "${clean}" bloqueado durante el enfoque`, 'info');
    }
  }

  function removeBlockedSite(url) {
    const sites = FlowState.get('focus.blockedSites') || [];
    FlowState.set('focus.blockedSites', sites.filter((s) => s !== url));
    FlowState.persist();
  }

  function getBlockedSites() {
    return FlowState.get('focus.blockedSites') || [];
  }

  // Nota: el bloqueo real de sitios requiere una extensión de navegador.
  // Esta función exporta la lista para que una extensión compañera la consuma.
  function exportBlocklist() {
    return JSON.stringify({
      sites:    getBlockedSites(),
      active:   FlowState.get('focus.active'),
      updatedAt: new Date().toISOString(),
    });
  }

  // ── Música para concentración ─────────────────────────────────────────────

  const MUSIC_TRACKS = [
    { id: 'lofi',        name: 'Lo-Fi Hip Hop',      emoji: '🎵', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
    { id: 'nature',      name: 'Lluvia y naturaleza', emoji: '🌧️', url: 'https://www.youtube.com/watch?v=q76bMs-NwRk' },
    { id: 'binaural',    name: 'Binaural 40Hz',       emoji: '🧠', url: 'https://www.youtube.com/watch?v=WPni755-Krg' },
    { id: 'classical',   name: 'Clásica para estudio',emoji: '🎹', url: 'https://www.youtube.com/watch?v=mDLP2SxoBo4' },
    { id: 'white_noise', name: 'Ruido blanco',         emoji: '〰️', url: null },  // generado localmente
    { id: 'brown_noise', name: 'Ruido marrón',         emoji: '🟤', url: null },
  ];

  let _noiseNode   = null;
  let _audioCtx    = null;

  function getTracks() { return MUSIC_TRACKS; }

  function playTrack(id) {
    const track = MUSIC_TRACKS.find((t) => t.id === id);
    if (!track) return;
    FlowState.set('focus.musicTrack', id);

    if (track.url) {
      // Abrir en nueva pestaña (sin necesidad de API de YouTube)
      window.open(track.url, '_blank', 'width=400,height=200');
      return;
    }

    // Ruido generado localmente con Web Audio API
    if (id === 'white_noise') _playNoise('white');
    if (id === 'brown_noise') _playNoise('brown');
  }

  function stopMusic() {
    FlowState.set('focus.musicTrack', null);
    if (_noiseNode) { try { _noiseNode.stop(); } catch {} _noiseNode = null; }
    if (_audioCtx)  { try { _audioCtx.close(); } catch {} _audioCtx = null; }
  }

  function _playNoise(type) {
    stopMusic();
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 4096;
    const buffer     = _audioCtx.createBuffer(1, _audioCtx.sampleRate * 2, _audioCtx.sampleRate);
    const data       = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } else {
      // Brown noise: integración del ruido blanco
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * white) / 1.02;
        last = data[i];
        data[i] *= 3.5;
      }
    }

    const source = _audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop   = true;

    const gain = _audioCtx.createGain();
    gain.gain.value = 0.3;
    source.connect(gain);
    gain.connect(_audioCtx.destination);
    source.start();
    _noiseNode = source;
  }

  // ── Estadísticas de enfoque ───────────────────────────────────────────────

  async function getStats(days = 7) {
    const logs = await FlowStorage.getAll('focus_logs') || [];
    const result = {};
    for (let i = days - 1; i >= 0; i--) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const day = logs.filter((l) => l.date === key);
      result[key] = {
        sessions:   day.length,
        minutes:    day.reduce((s, l) => s + l.durationMin, 0),
        deepWork:   day.filter((l) => l.mode === 'deep').reduce((s, l) => s + l.durationMin, 0),
      };
    }
    return result;
  }

  function getCurrentDuration() {
    if (!_sessionStart) return 0;
    return Math.round((Date.now() - _sessionStart) / 60000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _modeLabel(mode) {
    return { deep: 'Trabajo profundo', light: 'Trabajo ligero', custom: 'Modo personalizado' }[mode] || mode;
  }

  return {
    start, end, toggle,
    addBlockedSite, removeBlockedSite, getBlockedSites, exportBlocklist,
    getTracks, playTrack, stopMusic,
    getStats, getCurrentDuration,
  };

})();
