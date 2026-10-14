// ── FocusAI Date Utils ───────────────────────────────────────────────────────

window.FlowDate = (() => {

  const DAYS_ES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MONTHS_ES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // ── Formato ───────────────────────────────────────────────────────────────

  function format(date, pattern = 'DD/MM/YYYY') {
    const d = _toDate(date);
    if (!d || isNaN(d)) return '';
    const map = {
      YYYY:  d.getFullYear(),
      YY:    String(d.getFullYear()).slice(-2),
      MM:    _pad(d.getMonth() + 1),
      M:     d.getMonth() + 1,
      DD:    _pad(d.getDate()),
      D:     d.getDate(),
      HH:    _pad(d.getHours()),
      H:     d.getHours(),
      mm:    _pad(d.getMinutes()),
      ss:    _pad(d.getSeconds()),
      ddd:   DAYS_SHORT[d.getDay()],
      dddd:  DAYS_ES[d.getDay()],
      MMM:   MONTHS_SHORT[d.getMonth()],
      MMMM:  MONTHS_ES[d.getMonth()],
    };
    return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|H|mm|ss|dddd|ddd/g, (k) => map[k] ?? k);
  }

  function formatRelative(date) {
    const d    = _toDate(date);
    if (!d || isNaN(d)) return '';
    const now  = new Date();
    const diff = Math.round((d - now) / 86400000); // días

    if (diff === 0)  return 'Hoy';
    if (diff === 1)  return 'Mañana';
    if (diff === -1) return 'Ayer';
    if (diff > 1 && diff <= 6) return `En ${diff} días`;
    if (diff < -1 && diff >= -6) return `Hace ${-diff} días`;

    const diffSec = Math.round((d - now) / 1000);
    if (Math.abs(diffSec) < 3600)  return diffSec > 0 ? `En ${Math.round(diffSec/60)} min` : `Hace ${Math.round(-diffSec/60)} min`;

    return format(d, 'DD MMM YYYY');
  }

  function formatDateTime(date) {
    const d = _toDate(date);
    if (!d) return '';
    const fmt = FlowState.get('settings.timeFormat') === '12h' ? 'h:mm a' : 'HH:mm';
    return `${format(d, 'DD/MM/YYYY')} ${formatTime(d)}`;
  }

  function formatTime(date) {
    const d = _toDate(date);
    if (!d) return '';
    if (FlowState.get('settings.timeFormat') === '12h') {
      const h   = d.getHours();
      const m   = _pad(d.getMinutes());
      const ampm = h >= 12 ? 'pm' : 'am';
      return `${h % 12 || 12}:${m} ${ampm}`;
    }
    return `${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
  }

  function formatDuration(minutes) {
    if (!minutes || minutes < 1) return '0 min';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // ── Operaciones ───────────────────────────────────────────────────────────

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function todayDate() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    const d = _toDate(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  function addMonths(date, months) {
    const d = _toDate(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }

  function diffDays(a, b) {
    const da = _toDate(a);
    const db = _toDate(b || new Date());
    return Math.round((da - db) / 86400000);
  }

  function startOfWeek(date) {
    const d   = _toDate(date || new Date());
    const day = d.getDay() || 7; // lunes = 1
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().split('T')[0];
  }

  function endOfWeek(date) {
    return addDays(startOfWeek(date), 6);
  }

  function startOfMonth(date) {
    const d = _toDate(date || new Date());
    return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-01`;
  }

  function endOfMonth(date) {
    const d = _toDate(date || new Date());
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().split('T')[0];
  }

  function isToday(date) {
    return _toISODate(date) === today();
  }

  function isPast(date) {
    return _toISODate(date) < today();
  }

  function isFuture(date) {
    return _toISODate(date) > today();
  }

  function isThisWeek(date) {
    const d = _toISODate(date);
    return d >= startOfWeek() && d <= endOfWeek();
  }

  // Generar array de fechas entre dos fechas
  function range(start, end) {
    const dates = [];
    let   cur   = _toDate(start);
    const last  = _toDate(end);
    while (cur <= last) {
      dates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  // Días de un mes como grid (para calendario mensual)
  function monthGrid(year, month) {
    const firstDay  = new Date(year, month - 1, 1);
    const lastDay   = new Date(year, month, 0);
    const startDow  = (firstDay.getDay() || 7) - 1; // 0=lun
    const grid      = [];

    // Días del mes anterior para completar primera fila
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(firstDay);
      d.setDate(d.getDate() - i - 1);
      grid.push({ date: d.toISOString().split('T')[0], currentMonth: false });
    }
    // Días del mes
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = `${year}-${_pad(month)}-${_pad(d)}`;
      grid.push({ date, currentMonth: true, isToday: date === today() });
    }
    // Completar última fila
    while (grid.length % 7 !== 0) {
      const last = grid[grid.length - 1];
      grid.push({ date: addDays(last.date, 1), currentMonth: false });
    }
    return grid;
  }

  function getWeekDays(mondayDate) {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(mondayDate || startOfWeek(), i);
      return { date, label: DAYS_SHORT[new Date(date + 'T12:00:00').getDay()], isToday: date === today() };
    });
  }

  // ── Helpers internos ──────────────────────────────────────────────────────

  function _toDate(val) {
    if (!val) return new Date();
    if (val instanceof Date) return new Date(val);
    if (typeof val === 'string' && val.length === 10) return new Date(val + 'T12:00:00');
    return new Date(val);
  }

  function _toISODate(val) {
    return _toDate(val).toISOString().split('T')[0];
  }

  function _pad(n) { return String(n).padStart(2, '0'); }

  return {
    DAYS_ES, DAYS_SHORT, MONTHS_ES, MONTHS_SHORT,
    format, formatRelative, formatDateTime, formatTime, formatDuration,
    today, todayDate, addDays, addMonths, diffDays,
    startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    isToday, isPast, isFuture, isThisWeek,
    range, monthGrid, getWeekDays,
  };

})();
