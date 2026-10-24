# Entrega FocusIA: mejoras de People Analytics

## Auditoría resumida

El proyecto es una aplicación existente con frontend HTML/CSS/JavaScript, backend Express y PostgreSQL (Neon). El esquema relacional ya contiene perfiles, organizaciones, competencias y requisitos por puesto. El directorio empresarial, encuestas y reuniones ya estaban implementados. El panel de RR. HH. disponible está dentro de `views/employees.html`; no había una vista ejecutiva independiente con histórico.

## Cambios incluidos

- El endpoint `GET /api/enterprise/overview` sigue calculando los datos desde `app_records` y tablas relacionales, limita perfiles a la organización del usuario y requiere un rol de administración o RR. HH.
- Las tasas de cumplimiento sin tareas pasan a `null` en la API (no 0 %). Las brechas sin evaluaciones aplicables también pasan a `null`.
- La respuesta incluye fecha de actualización y metadatos de cada indicador: descripción, fórmula, unidad, fuente y disponibilidad.
- El panel muestra explícitamente «Sin datos» cuando falta denominador y aclara qué miden las cifras.
- Se conserva el aviso de que tareas vencidas no constituyen medida de productividad o diagnóstico de procrastinación.
- El área de empleados pasó a un espacio de equipo con búsqueda/filtro y ficha individual: datos laborales, tareas, competencias con evidencia, formación y actividad reciente.
- RR. HH. y administradores pueden invitar un perfil laboral por correo; la persona activa su cuenta después con ese correo.
- RR. HH. y administradores pueden asignar tareas con contexto, prioridad y fecha límite. Se escriben en el almacén de la persona y aparecen en su módulo de tareas.
- Las métricas globales solo cuentan tareas asignadas a través de una tabla de atribución escrita por el servidor, para no tratar las tareas personales auto-reportadas como compromisos asignados.
- Se añadió un seed repetible de demostración con organización, personas, competencias, formación, encuesta y tareas ficticias, más un usuario de acceso demo.
- Se añadió `npm run test:demo-analytics`, que valida localmente los resultados esperados sin conectarse a Neon.

## Archivos modificados

- `server.js`
- `js/enterprise.js`
- `views/employees.html`
- `css/enterprise.css`
- `database/DEMO_FOCUSIA_SEED.sql`
- `database/README_DEMO_FOCUSIA.md`
- `scripts/test-demo-analytics.js`
- `package.json`

## Base de datos y despliegue

El backend crea la tabla incremental `employee_task_assignments` de forma idempotente al iniciar; el seed demo también la crea si hace falta. No se elimina ni reemplaza ninguna tabla existente. Para instalar la aplicación completa, sigue `README_NEON.md` y aplica `database/focusai_neon_schema_completo.sql` únicamente si aún no está instalado. Variables requeridas: `DATABASE_URL` (Neon), `SESSION_SECRET` (32 caracteres o más), `NODE_ENV=production` y `PORT` según el proveedor.

## Verificación realizada

- `node --check server.js`
- `node --check js/enterprise.js`
- `npm run test:demo-analytics`

El test local espera 12 tareas, 9 completadas (75 %), 2 vencidas y 4 brechas entre 7 evaluaciones, y confirma que denominador cero no se muestra como 0 %. No se ejecutaron pruebas de integración contra Neon porque requieren una `DATABASE_URL` configurada. El seed debe aplicarse manualmente en una base de desarrollo para verificar la UI y la autenticación. Tampoco se probó Render, proveedores de IA, navegador ni permisos con cuentas reales. No se simularon esas pruebas.

## Límites restantes

Este cambio no implementa todo el alcance aspiracional del documento pegado. En particular, el proyecto todavía carece de snapshots históricos que permitan tendencias y comparaciones temporales confiables; el endpoint actual no ofrece filtros por periodo, equipo o puesto; y no se añadieron nuevas funciones completas de formación, planes de desarrollo o recomendaciones. El ZIP conserva el proyecto existente y estas mejoras acotadas, sin afirmar que esas capacidades ya estén completas.
