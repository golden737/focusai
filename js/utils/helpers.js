// ── FocusAI Helpers ──────────────────────────────────────────────────────────

window.FlowHelpers = (() => {

  // ── Funciones de tiempo ───────────────────────────────────────────────────

  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function throttle(fn, limit = 200) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= limit) { last = now; fn(...args); }
    };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Objetos y arrays ──────────────────────────────────────────────────────

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function deepMerge(target, source) {
    const out = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        out[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        out[key] = source[key];
      }
    }
    return out;
  }

  function groupBy(array, key) {
    return array.reduce((acc, item) => {
      const k = typeof key === 'function' ? key(item) : item[key];
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  }

  function sortBy(array, key, dir = 'asc') {
    return [...array].sort((a, b) => {
      const va = typeof key === 'function' ? key(a) : a[key];
      const vb = typeof key === 'function' ? key(b) : b[key];
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function unique(array, key) {
    if (!key) return [...new Set(array)];
    const seen = new Set();
    return array.filter((item) => {
      const k = typeof key === 'function' ? key(item) : item[key];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
    return chunks;
  }

  function flatten(array, depth = 1) {
    return array.flat(depth);
  }

  // ── Strings ───────────────────────────────────────────────────────────────

  function truncate(str, length = 50, suffix = '…') {
    if (!str || str.length <= length) return str || '';
    return str.substring(0, length - suffix.length) + suffix;
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function titleCase(str) {
    return str?.replace(/\w\S*/g, (w) => capitalize(w)) || '';
  }

  function slugify(str) {
    return str?.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || '';
  }

  function nl2br(str) {
    return str?.replace(/\n/g, '<br>') || '';
  }

  function escapeHTML(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str?.replace(/[&<>"']/g, (c) => map[c]) || '';
  }

  function countWords(str) {
    return str?.trim().split(/\s+/).filter(Boolean).length || 0;
  }

  function highlight(text, query) {
    if (!query || !text) return escapeHTML(text);
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHTML(text).replace(re, '<mark>$1</mark>');
  }

  // ── Números ───────────────────────────────────────────────────────────────

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function round(val, decimals = 2) {
    return Math.round(val * 10 ** decimals) / 10 ** decimals;
  }

  function formatNumber(n, locale = 'es') {
    return new Intl.NumberFormat(locale).format(n);
  }

  function percentage(value, total) {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  }

  // ── Colores ───────────────────────────────────────────────────────────────

  function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
  }

  function hexToRgba(hex, alpha = 1) {
    const rgb = hexToRgb(hex);
    return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})` : hex;
  }

  function isDarkColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return true;
    // Luminancia relativa
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return lum < 0.5;
  }

  function priorityColor(priority) {
    return { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6', none: '#64748b' }[priority] || '#64748b';
  }

  function priorityBg(priority) {
    return { high: 'rgba(239,68,68,0.12)', medium: 'rgba(245,158,11,0.12)', low: 'rgba(59,130,246,0.12)', none: 'rgba(100,116,139,0.08)' }[priority] || 'transparent';
  }

  // ── DOM ───────────────────────────────────────────────────────────────────

  function qs(selector, parent = document) {
    return parent.querySelector(selector);
  }

  function qsa(selector, parent = document) {
    return [...parent.querySelectorAll(selector)];
  }

  function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    });
    children.forEach((child) => {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child instanceof Node) el.appendChild(child);
    });
    return el;
  }

  function setHTML(selector, html, parent = document) {
    const el = parent.querySelector(selector);
    if (el) el.innerHTML = html;
    return el;
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function toggle(el, force) { if (el) el.hidden = force !== undefined ? !force : !el.hidden; }

  function animateIn(el, cls = 'fade-in') {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // reflow
    el.classList.add(cls);
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      FlowApp.toast('Copiado al portapapeles', 'success', { duration: 2000 });
      return true;
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    }
  }

  // ── Descarga de archivo ───────────────────────────────────────────────────

  function downloadJSON(data, filename = 'export.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    _downloadBlob(blob, filename);
  }

  function downloadCSV(csvString, filename = 'export.csv') {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    _downloadBlob(blob, filename);
  }

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  function generateColor(seed) {
    // Color determinístico basado en un string (para avatares/etiquetas)
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    const h = ((hash % 360) + 360) % 360;
    return `hsl(${h}, 65%, 55%)`;
  }

  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function isOnline() {
    return navigator.onLine;
  }

  return {
    debounce, throttle, sleep,
    deepClone, deepMerge, groupBy, sortBy, unique, chunk, flatten,
    truncate, capitalize, titleCase, slugify, nl2br, escapeHTML, countWords, highlight,
    clamp, round, formatNumber, percentage,
    hexToRgb, hexToRgba, isDarkColor, priorityColor, priorityBg,
    qs, qsa, createElement, setHTML, show, hide, toggle, animateIn,
    copyToClipboard, downloadJSON, downloadCSV,
    generateColor, isMobile, isOnline,
  };

})();
