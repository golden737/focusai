// ── FocusAI Charts ───────────────────────────────────────────────────────────
// Wrapper de Chart.js con defaults de diseño y factory functions.

window.FlowCharts = (() => {

  // Paleta de colores de la app
  const COLORS = {
    primary:   '#6366f1',
    secondary: '#8b5cf6',
    success:   '#22c55e',
    warning:   '#f59e0b',
    danger:    '#ef4444',
    info:      '#3b82f6',
    muted:     '#64748b',
    palette: ['#6366f1','#22c55e','#f59e0b','#3b82f6','#ec4899','#14b8a6','#f97316','#a855f7'],
  };

  // ── Defaults globales de Chart.js ─────────────────────────────────────────

  function applyGlobalDefaults() {
    if (!window.Chart) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor   = isDark ? '#94a3b8' : '#64748b';
    const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const bgColor     = isDark ? '#1a1a1f' : '#ffffff';

    Chart.defaults.color              = textColor;
    Chart.defaults.borderColor        = gridColor;
    Chart.defaults.backgroundColor    = bgColor;
    Chart.defaults.font.family        = "'DM Sans', system-ui, sans-serif";
    Chart.defaults.font.size          = 12;
    Chart.defaults.plugins.legend.labels.color     = textColor;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = isDark ? '#1e1e24' : '#ffffff';
    Chart.defaults.plugins.tooltip.titleColor      = isDark ? '#f1f5f9' : '#0f172a';
    Chart.defaults.plugins.tooltip.bodyColor       = textColor;
    Chart.defaults.plugins.tooltip.borderColor     = isDark ? '#2a2a35' : '#e2e8f0';
    Chart.defaults.plugins.tooltip.borderWidth     = 1;
    Chart.defaults.plugins.tooltip.padding         = 12;
    Chart.defaults.plugins.tooltip.cornerRadius    = 8;
    Chart.defaults.scale.grid.color   = gridColor;
    Chart.defaults.scale.ticks.color  = textColor;
  }

  // ── Factory: gráfico de barras ────────────────────────────────────────────

  function bar(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    _destroyExisting(canvasId);

    return new Chart(canvas, {
      type: 'bar',
      data: _applyColorDefaults(data),
      options: _mergeOptions({
        responsive:          true,
        maintainAspectRatio: false,
        plugins: { legend: { display: data.datasets.length > 1 } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      }, options),
    });
  }

  // ── Factory: gráfico de líneas ────────────────────────────────────────────

  function line(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    _destroyExisting(canvasId);

    const coloredData = {
      ...data,
      datasets: data.datasets.map((ds, i) => ({
        borderColor:     ds.borderColor || COLORS.palette[i % COLORS.palette.length],
        backgroundColor: ds.backgroundColor || FlowHelpers.hexToRgba(COLORS.palette[i % COLORS.palette.length], 0.1),
        borderWidth:     2,
        pointRadius:     4,
        pointHoverRadius:6,
        tension:         0.4,
        fill:            ds.fill ?? false,
        ...ds,
      })),
    };

    return new Chart(canvas, {
      type: 'line',
      data: coloredData,
      options: _mergeOptions({
        responsive:          true,
        maintainAspectRatio: false,
        plugins: { legend: { display: data.datasets.length > 1 } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true },
        },
      }, options),
    });
  }

  // ── Factory: gráfico de dona / pie ────────────────────────────────────────

  function doughnut(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    _destroyExisting(canvasId);

    return new Chart(canvas, {
      type: 'doughnut',
      data: _applyColorDefaults(data),
      options: _mergeOptions({
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '65%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16 } },
        },
      }, options),
    });
  }

  function pie(canvasId, data, options = {}) {
    return doughnut(canvasId, data, { ...options, cutout: '0%' });
  }

  // ── Factory: gráfico de área ──────────────────────────────────────────────

  function area(canvasId, data, options = {}) {
    return line(canvasId, {
      ...data,
      datasets: data.datasets.map((ds) => ({ ...ds, fill: true })),
    }, options);
  }

  // ── Factory: gráfico de radar ─────────────────────────────────────────────

  function radar(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    _destroyExisting(canvasId);

    return new Chart(canvas, {
      type: 'radar',
      data: {
        ...data,
        datasets: data.datasets.map((ds, i) => ({
          borderColor:     COLORS.palette[i],
          backgroundColor: FlowHelpers.hexToRgba(COLORS.palette[i], 0.2),
          pointBackgroundColor: COLORS.palette[i],
          borderWidth: 2,
          ...ds,
        })),
      },
      options: _mergeOptions({
        responsive:          true,
        maintainAspectRatio: false,
        scales: { r: { beginAtZero: true, ticks: { stepSize: 20 } } },
      }, options),
    });
  }

  // ── Mini sparkline (sin ejes, inline) ─────────────────────────────────────

  function sparkline(canvasId, values, color = COLORS.primary) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    _destroyExisting(canvasId);

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels:   values.map(() => ''),
        datasets: [{
          data:            values,
          borderColor:     color,
          backgroundColor: FlowHelpers.hexToRgba(color, 0.15),
          borderWidth:     2,
          pointRadius:     0,
          fill:            true,
          tension:         0.4,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales:  { x: { display: false }, y: { display: false } },
      },
    });
  }

  // ── Actualizar datos de un chart existente ────────────────────────────────

  function update(chart, newData) {
    if (!chart) return;
    chart.data = newData;
    chart.update('active');
  }

  function updateDataset(chart, index, newValues) {
    if (!chart) return;
    chart.data.datasets[index].data = newValues;
    chart.update('active');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const _instances = new Map();

  function _destroyExisting(id) {
    const existing = _instances.get(id);
    if (existing) { existing.destroy(); _instances.delete(id); }
    // También buscar por canvas
    const canvas  = document.getElementById(id);
    if (canvas && Chart.getChart(canvas)) Chart.getChart(canvas).destroy();
  }

  function _applyColorDefaults(data) {
    return {
      ...data,
      datasets: data.datasets.map((ds, i) => ({
        backgroundColor: ds.backgroundColor || COLORS.palette.map((c) => FlowHelpers.hexToRgba(c, 0.85)),
        borderColor:     ds.borderColor     || COLORS.palette[i % COLORS.palette.length],
        borderWidth:     ds.borderWidth     ?? 0,
        borderRadius:    ds.borderRadius    ?? 6,
        ...ds,
      })),
    };
  }

  function _mergeOptions(defaults, overrides) {
    return FlowHelpers.deepMerge(defaults, overrides);
  }

  // Reaplicar defaults cuando cambia el tema
  window.addEventListener('focusai:theme', applyGlobalDefaults);
  document.addEventListener('DOMContentLoaded', () => {
    if (window.Chart) applyGlobalDefaults();
  });

  return {
    COLORS,
    applyGlobalDefaults,
    bar, line, area, doughnut, pie, radar, sparkline,
    update, updateDataset,
  };

})();
