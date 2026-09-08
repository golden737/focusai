// ── FocusAI Seed ─────────────────────────────────────────────────────────────
// Datos de ejemplo para el onboarding. Se carga solo en la primera ejecución.

window.FlowSeed = {

  async load() {
    const today    = new Date().toISOString().split('T')[0];
    const tomorrow = FlowDate.addDays(today, 1);
    const nextWeek = FlowDate.addDays(today, 7);

    // ── Proyecto demo ────────────────────────────────────────────────────────
    const project = await FlowProjects.create({
      name:        'Mi primer proyecto',
      description: 'Proyecto de ejemplo para explorar FocusAI',
      color:       '#6366f1',
      icon:        '🚀',
    });

    // ── Objetivo demo ────────────────────────────────────────────────────────
    const goal = await FlowGoals.create({
      title:       'Dominar mi productividad personal',
      description: 'Construir hábitos sólidos y un sistema de trabajo eficiente',
      type:        'long',
      targetDate:  FlowDate.addDays(today, 90),
      icon:        '🎯',
      color:       '#22c55e',
    });

    // ── Tareas demo ──────────────────────────────────────────────────────────
    await FlowTasks.create({
      title:        'Explorar el dashboard de FocusAI',
      description:  'Navega por todas las secciones para familiarizarte con la app',
      priority:     'high',
      dueDate:      today,
      estimatedMin: 15,
      labels:       ['onboarding'],
      projectId:    project.id,
      goalId:       goal.id,
    });

    await FlowTasks.create({
      title:        'Configurar la IA local (Ollama)',
      description:  'Instala Ollama desde ollama.com, descarga un modelo (ej: ollama pull llama3.2) y conéctalo en Ajustes → IA Local',
      priority:     'high',
      dueDate:      today,
      estimatedMin: 20,
      labels:       ['setup', 'ia'],
      subtasks: [
        { id: 'st_1', title: 'Descargar e instalar Ollama', completed: false, order: 0 },
        { id: 'st_2', title: 'Ejecutar: ollama pull llama3.2', completed: false, order: 1 },
        { id: 'st_3', title: 'Conectar en Ajustes → IA Local', completed: false, order: 2 },
      ],
    });

    await FlowTasks.create({
      title:        'Crear tu primer hábito diario',
      priority:     'medium',
      dueDate:      tomorrow,
      estimatedMin: 5,
      labels:       ['hábitos'],
    });

    await FlowTasks.create({
      title:        'Registrar tu primer bloque de tiempo en el calendario',
      priority:     'medium',
      dueDate:      tomorrow,
      estimatedMin: 10,
      labels:       ['calendario'],
      projectId:    project.id,
    });

    await FlowTasks.create({
      title:        'Completar tu primer Pomodoro',
      priority:     'low',
      dueDate:      nextWeek,
      estimatedMin: 30,
      labels:       ['tiempo', 'pomodoro'],
    });

    // ── Hábitos demo ─────────────────────────────────────────────────────────
    await FlowHabits.create({
      name:         'Revisar tareas del día',
      description:  '5 minutos cada mañana para planificar el día',
      icon:         '📋',
      color:        '#6366f1',
      frequency:    'weekdays',
      reminderTime: '09:00',
      targetCount:  1,
    });

    await FlowHabits.create({
      name:         'Ejercicio',
      description:  'Mínimo 20 minutos de actividad física',
      icon:         '💪',
      color:        '#22c55e',
      frequency:    'daily',
      reminderTime: '07:00',
      targetCount:  1,
    });

    await FlowHabits.create({
      name:         'Lectura',
      description:  '30 minutos de lectura antes de dormir',
      icon:         '📚',
      color:        '#f59e0b',
      frequency:    'daily',
      reminderTime: '21:30',
      targetCount:  1,
    });

    await FlowHabits.create({
      name:         'Meditación',
      icon:         '🧘',
      color:        '#8b5cf6',
      frequency:    'daily',
      targetCount:  1,
    });

    // ── Evento demo ──────────────────────────────────────────────────────────
    await FlowCalendar.createEvent({
      title:     '🚀 Bienvenido a FocusAI',
      type:      'event',
      color:     '#6366f1',
      startDate: today,
      startTime: '09:00',
      endDate:   today,
      endTime:   '09:30',
      description: 'Primera sesión de productividad con FocusAI',
    });

    // ── Entrada de diario demo ───────────────────────────────────────────────
    await FlowPersonal.saveEntry({
      date:      today,
      content:   '¡Hoy empiezo a usar FocusAI! Estoy listo para mejorar mi productividad y construir mejores hábitos.',
      mood:      4,
      emotions:  ['Motivado', 'Entusiasmado'],
      gratitude: ['Tener herramientas que me ayuden a organizarme', 'Un nuevo comienzo', 'La posibilidad de mejorar cada día'],
    });

    console.info('[Seed] Datos de ejemplo cargados correctamente');
    FlowApp.toast('¡Datos de ejemplo cargados! Explora la app 🚀', 'success', { duration: 5000 });
  },

};
