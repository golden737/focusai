(() => {
  const params = new URLSearchParams(location.search);
  const meetingId = params.get('meetingId') || '';
  const roomName = params.get('room') || '';
  const title = params.get('title') || 'Llamada FocusAI';
  const isHost = params.get('host') === '1';
  const room = document.getElementById('jitsi-room');
  const message = document.getElementById('call-message');
  const finishButton = document.getElementById('finish-call');
  document.title = `${title} · FocusAI`;
  document.getElementById('call-title').textContent = title;
  finishButton.hidden = !isHost;
  let api = null, ended = false, poll = null, finishing = false;
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
    return data;
  }
  function closeCallWindow(text = 'La llamada ha terminado.') {
    if (ended) return;
    ended = true;
    if (poll) clearInterval(poll);
    // Quitar el iframe inmediatamente: Jitsi puede mostrar una pantalla promocional
    // después del botón rojo. No dejar que esa pantalla quede visible en la ventana.
    try { room.replaceChildren(); } catch {}
    try { api?.dispose(); } catch {}
    api = null;
    message.hidden = false;
    message.replaceChildren();
    const content = document.createElement('div');
    content.style.cssText = 'display:grid;gap:12px;justify-items:center;text-align:center;max-width:420px';
    const paragraph = document.createElement('p'); paragraph.textContent = text;
    const close = document.createElement('button'); close.textContent = 'Cerrar ventana';
    close.addEventListener('click', () => window.close());
    content.append(paragraph, close); message.append(content);
    // La ventana fue abierta por FocusAI, por lo que el navegador normalmente permite cerrarla.
    setTimeout(() => { try { window.close(); } catch {} }, 250);
  }
  async function finishForEveryone() {
    if (finishing || ended) return;
    finishing = true; finishButton.disabled = true; finishButton.textContent = 'Finalizando…';
    try {
      await request(`/api/meetings/${encodeURIComponent(meetingId)}/finish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      closeCallWindow('El anfitrión ha finalizado la llamada.');
    } catch (error) {
      finishing = false; finishButton.disabled = false; finishButton.textContent = 'Finalizar para todos';
      alert(`No se pudo finalizar la reunión: ${error.message}`);
    }
  }
  function start() {
    if (!meetingId || !roomName) { closeCallWindow('El enlace de la llamada no es válido.'); return; }
    if (!window.JitsiMeetExternalAPI) { closeCallWindow('No se pudo cargar Jitsi. Comprueba la conexión e inténtalo de nuevo.'); return; }
    message.hidden = true;
    api = new window.JitsiMeetExternalAPI('meet.jit.si', {
      roomName, width: '100%', height: '100%', parentNode: room, lang: 'es',
      configOverwrite: { prejoinPageEnabled: false, enableWelcomePage: false, disableDeepLinking: true, enableLobby: false },
      interfaceConfigOverwrite: { APP_NAME: 'FocusAI', SHOW_JITSI_WATERMARK: true, SHOW_BRAND_WATERMARK: false, SHOW_POWERED_BY: false }
    });
    api.addEventListener('readyToClose', () => {
      // Responder al botón rojo de Jitsi sin esperar la llamada al backend antes de retirar el iframe.
      if (isHost) {
        if (finishing || ended) return;
        finishing = true; finishButton.disabled = true;
        closeCallWindow('Llamada cerrada.');
        request(`/api/meetings/${encodeURIComponent(meetingId)}/finish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      } else closeCallWindow('La llamada se ha cerrado.');
    });
    finishButton.addEventListener('click', finishForEveryone);
    poll = setInterval(async () => {
      if (ended) return;
      try {
        const meetings = await request('/api/meetings');
        const meeting = meetings.find(item => String(item.id) === String(meetingId));
        if (!meeting || meeting.status !== 'in_progress') closeCallWindow('El anfitrión finalizó la llamada.');
      } catch {}
    }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  window.addEventListener('beforeunload', () => { if (poll) clearInterval(poll); try { api?.dispose(); } catch {} });
})();
