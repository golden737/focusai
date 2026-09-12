// ── FocusAI Validators ───────────────────────────────────────────────────────

window.FlowValidators = (() => {

  // ── Primitivos ────────────────────────────────────────────────────────────

  const required  = (v, msg = 'Este campo es obligatorio') => (!v || !String(v).trim()) ? msg : null;
  const minLength = (min) => (v, msg) => v && v.length < min ? (msg || `Mínimo ${min} caracteres`) : null;
  const maxLength = (max) => (v, msg) => v && v.length > max ? (msg || `Máximo ${max} caracteres`) : null;
  const isEmail   = (v) => v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Email inválido' : null;
  const isURL     = (v) => { try { new URL(v); return null; } catch { return 'URL inválida'; } };
  const isNumber  = (v) => isNaN(Number(v)) ? 'Debe ser un número' : null;
  const isPositive= (v) => Number(v) <= 0 ? 'Debe ser mayor a 0' : null;
  const isDate    = (v) => v && isNaN(new Date(v)) ? 'Fecha inválida' : null;
  const isTime    = (v) => v && !/^\d{2}:\d{2}$/.test(v) ? 'Hora inválida (HH:MM)' : null;

  const isFuture  = (v) => {
    if (!v) return null;
    return new Date(v) < new Date() ? 'La fecha debe ser futura' : null;
  };

  const dateAfter = (other) => (v) => {
    if (!v || !other) return null;
    return new Date(v) <= new Date(other) ? 'La fecha fin debe ser posterior a la fecha inicio' : null;
  };

  // ── Validador de formulario ───────────────────────────────────────────────

  /**
   * validate({ title: 'Mi tarea', dueDate: '' }, {
   *   title:   [required, minLength(3)],
   *   dueDate: [isDate],
   * })
   * → { valid: true/false, errors: { title: 'mensaje' | null, ... } }
   */
  function validate(data, rules) {
    const errors = {};
    let valid = true;
    for (const [field, fieldRules] of Object.entries(rules)) {
      const value = data[field];
      let error   = null;
      for (const rule of (Array.isArray(fieldRules) ? fieldRules : [fieldRules])) {
        const result = rule(value);
        if (result) { error = result; break; }
      }
      errors[field] = error;
      if (error) valid = false;
    }
    return { valid, errors };
  }

  /**
   * Aplicar errores a un formulario DOM.
   * Busca elementos con name=field y añade clase 'field-error' + mensaje.
   */
  function applyErrors(form, errors) {
    // Limpiar errores previos
    form.querySelectorAll('.field-error-msg').forEach((el) => el.remove());
    form.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));

    for (const [field, msg] of Object.entries(errors)) {
      if (!msg) continue;
      const input = form.querySelector(`[name="${field}"]`);
      if (!input) continue;
      input.classList.add('field-error');
      const span = document.createElement('span');
      span.className   = 'field-error-msg';
      span.textContent = msg;
      input.parentNode.appendChild(span);
    }
  }

  // ── Reglas de dominio ─────────────────────────────────────────────────────

  const taskRules = {
    title:        [required, minLength(1), maxLength(200)],
    dueDate:      [isDate],
    estimatedMin: [(v) => v ? isPositive(v) : null],
  };

  const habitRules = {
    name:         [required, minLength(2), maxLength(100)],
    reminderTime: [isTime],
  };

  const goalRules = {
    title:      [required, minLength(3), maxLength(200)],
    targetDate: [isDate],
  };

  const projectRules = {
    name: [required, minLength(2), maxLength(100)],
  };

  const eventRules = {
    title:     [required, maxLength(200)],
    startDate: [required, isDate],
    endDate:   [isDate],
    startTime: [isTime],
    endTime:   [isTime],
  };

  const journalRules = {
    content: [(v) => v && v.length > 10000 ? 'Entrada demasiado larga (máx 10.000 caracteres)' : null],
  };

  const aiConfigRules = {
    baseUrl: [required, isURL],
    model:   [required],
  };

  // ── Helpers de formulario ────────────────────────────────────────────────

  function getFormData(form) {
    const fd   = new FormData(form);
    const data = {};
    fd.forEach((val, key) => {
      // Manejar múltiples valores (checkboxes)
      if (data[key] !== undefined) {
        data[key] = Array.isArray(data[key]) ? [...data[key], val] : [data[key], val];
      } else {
        data[key] = val;
      }
    });
    // Checkboxes desmarcados → false
    form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      if (!data[cb.name]) data[cb.name] = false;
    });
    return data;
  }

  function bindLiveValidation(form, rules) {
    Object.keys(rules).forEach((field) => {
      const input = form.querySelector(`[name="${field}"]`);
      if (!input) return;
      const validate = FlowHelpers.debounce(() => {
        const { errors } = module.validate({ [field]: input.value }, { [field]: rules[field] });
        const prev = form.querySelector(`.field-error-msg[data-field="${field}"]`);
        if (prev) prev.remove();
        input.classList.remove('field-error');
        if (errors[field]) {
          input.classList.add('field-error');
          const span = document.createElement('span');
          span.className         = 'field-error-msg';
          span.dataset.field     = field;
          span.textContent       = errors[field];
          input.parentNode.appendChild(span);
        }
      }, 400);
      input.addEventListener('input', validate);
      input.addEventListener('blur',  validate);
    });
  }

  const module = {
    // Primitivos
    required, minLength, maxLength,
    isEmail, isURL, isNumber, isPositive, isDate, isTime, isFuture, dateAfter,
    // Formulario
    validate, applyErrors, getFormData, bindLiveValidation,
    // Reglas de dominio
    taskRules, habitRules, goalRules, projectRules, eventRules, journalRules, aiConfigRules,
  };

  return module;

})();
