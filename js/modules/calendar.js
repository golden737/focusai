// ── FocusAI Calendar ─────────────────────────────────────────────────────────
// Vistas día/semana/mes, drag & drop, time blocking, eventos recurrentes.

window.FlowCalendar = (() => {

  // ── CRUD de eventos ───────────────────────────────────────────────────────

  async function createEvent(data = {}) {
    const now   = new Date().toISOString();
    const event = {
      id:          FlowStorage.generateId('evt_'),
      title:       data.title       || 'Nuevo evento',
      description: data.description || '',
      type:        data.type        || 'event',  // 'event'|'meeting'|'block'|'reminder'
      color:       data.color       || '#6366f1',
      allDay:      data.allDay      || false,
      startDate:   data.startDate   || now.split('T')[0],
      startTime:   data.startTime   || '09:00',
      endDate:     data.endDate     || data.startDate || now.split('T')[0],
      endTime:     data.endTime     || '10:00',
      location:    data.location    || '',
      url:         data.url         || '',
      recurrence:  data.recurrence  || null,
      parentId:    data.parentId    || null,
      taskId:      data.taskId      || null,
      projectId:   data.projectId   || null,
      attendees:   data.attendees   || [],
      reminder:    data.reminder    ?? 15,       // minutos antes
      createdAt:   now,
      updatedAt:   now,
    };

    await FlowStorage.save('events', event);
    FlowState.array.push('calendar.events', event);

    if (event.recurrence) await _expandRecurring(event);

    return event;
  }

  async function updateEvent(id, changes = {}) {
    const event   = _findById(id);
    if (!event) return;
    const updated = { ...event, ...changes, id, updatedAt: new Date().toISOString() };
    await FlowStorage.save('events', updated);
    FlowState.array.updateItem('calendar.events', (e) => e.id === id, updated);
    return updated;
  }

  async function deleteEvent(id, deleteRecurring = false) {
    const event = _findById(id);
    if (!event) return;
    if (deleteRecurring && event.parentId) {
      // Eliminar todas las instancias de la serie
      const all = (FlowState.get('calendar.events') || []).filter((e) => e.parentId === event.parentId || e.id === event.parentId);
      await Promise.all(all.map((e) => FlowStorage.remove('events', e.id)));
      FlowState.array.remove('calendar.events', (e) => e.parentId === event.parentId || e.id === event.parentId);
    } else {
      await FlowStorage.remove('events', id);
      FlowState.array.remove('calendar.events', (e) => e.id === id);
    }
  }

  // ── Expandir eventos recurrentes ──────────────────────────────────────────

  async function _expandRecurring(parent, weeksAhead = 8) {
    if (!parent.recurrence) return;
    const instances = FlowRecurrence.expandEvent(parent, weeksAhead);
    for (const inst of instances) {
      const exists = (FlowState.get('calendar.events') || []).some(
        (e) => e.parentId === parent.id && e.startDate === inst.startDate
      );
      if (!exists) {
        await FlowStorage.save('events', inst);
        FlowState.array.push('calendar.events', inst);
      }
    }
  }

  // ── Consultas por vista ───────────────────────────────────────────────────

  function getEventsForDay(date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return (FlowState.get('calendar.events') || [])
      .filter((e) => e.startDate === dateStr || (e.allDay && e.endDate >= dateStr && e.startDate <= dateStr))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }

  function getEventsForWeek(mondayDate) {
    const monday = typeof mondayDate === 'string' ? mondayDate : mondayDate.toISOString().split('T')[0];
    const sunday = _addDays(monday, 6);
    return (FlowState.get('calendar.events') || [])
      .filter((e) => e.startDate >= monday && e.startDate <= sunday)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime || '').localeCompare(b.startTime || ''));
  }

  function getEventsForMonth(year, month) {
    const pad   = (n) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month)}-01`;
    const end   = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
    return (FlowState.get('calendar.events') || [])
      .filter((e) => e.startDate >= start && e.startDate <= end);
  }

  // ── Bloques de tiempo ─────────────────────────────────────────────────────

  async function createTimeBlock(date, startTime, endTime, title, taskId = null) {
    return createEvent({
      title,
      type:      'block',
      color:     '#8b5cf6',
      startDate: date,
      endDate:   date,
      startTime,
      endTime,
      taskId,
    });
  }

  async function autoSchedule(taskIds, date) {
    // Colocar tareas en bloques de tiempo disponibles del día
    const events   = getEventsForDay(date);
    const occupied = events.map((e) => ({ start: _timeToMin(e.startTime), end: _timeToMin(e.endTime) }));

    let cursor = 9 * 60; // Empezar a las 9:00
    const created = [];

    for (const taskId of taskIds) {
      const task     = FlowState.array.find('tasks.items', (t) => t.id === taskId);
      if (!task) continue;
      const duration = task.estimatedMin || 30;

      // Buscar hueco libre
      while (_isOccupied(cursor, cursor + duration, occupied)) {
        cursor += 30;
        if (cursor + duration > 21 * 60) break; // No más allá de las 21:00
      }

      if (cursor + duration <= 21 * 60) {
        const block = await createTimeBlock(
          date,
          _minToTime(cursor),
          _minToTime(cursor + duration),
          task.title,
          taskId
        );
        occupied.push({ start: cursor, end: cursor + duration });
        cursor += duration + 15; // 15 min de buffer
        created.push(block);
      }
    }

    return created;
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  async function reschedule(eventId, newDate, newStartTime = null) {
    const event    = _findById(eventId);
    if (!event) return;
    const duration = _timeToMin(event.endTime) - _timeToMin(event.startTime);
    const changes  = { startDate: newDate, endDate: newDate };
    if (newStartTime) {
      changes.startTime = newStartTime;
      changes.endTime   = _minToTime(_timeToMin(newStartTime) + duration);
    }
    await updateEvent(eventId, changes);
    // Sincronizar tarea vinculada si existe
    if (event.taskId) await FlowTasks.update(event.taskId, { dueDate: newDate });
    return updateEvent(eventId, changes);
  }

  async function resize(eventId, newEndTime) {
    await updateEvent(eventId, { endTime: newEndTime });
  }

  // ── Vista actual ──────────────────────────────────────────────────────────

  function setView(mode) {
    FlowState.set('calendar.viewMode', mode);
  }

  function navigate(direction) {
    const current = new Date(FlowState.get('calendar.currentDate'));
    const mode    = FlowState.get('calendar.viewMode');
    if (mode === 'day')   current.setDate(current.getDate() + direction);
    if (mode === 'week')  current.setDate(current.getDate() + direction * 7);
    if (mode === 'month') current.setMonth(current.getMonth() + direction);
    FlowState.set('calendar.currentDate', current.toISOString());
  }

  function goToToday() {
    FlowState.set('calendar.currentDate', new Date().toISOString());
  }

  // ── Exportar a iCal ───────────────────────────────────────────────────────

  function exportICS(events) {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FocusAI//EN', 'CALSCALE:GREGORIAN',
    ];
    events.forEach((e) => {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@focusai`);
      lines.push(`SUMMARY:${e.title}`);
      lines.push(`DTSTART:${e.startDate.replace(/-/g,'')}T${(e.startTime||'090000').replace(/:/g,'')}00`);
      lines.push(`DTEND:${e.endDate.replace(/-/g,'')}T${(e.endTime||'100000').replace(/:/g,'')}00`);
      if (e.description) lines.push(`DESCRIPTION:${e.description}`);
      if (e.location)    lines.push(`LOCATION:${e.location}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _findById(id) {
    return FlowState.array.find('calendar.events', (e) => e.id === id);
  }

  function _timeToMin(time = '00:00') {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function _minToTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  function _isOccupied(start, end, occupied) {
    return occupied.some((o) => start < o.end && end > o.start);
  }

  function _addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  return {
    createEvent, updateEvent, deleteEvent,
    getEventsForDay, getEventsForWeek, getEventsForMonth,
    createTimeBlock, autoSchedule,
    reschedule, resize,
    setView, navigate, goToToday,
    exportICS,
  };

})();
