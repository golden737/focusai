# FocusIA — People Analytics y desarrollo del talento

Esta entrega integra un módulo funcional de formación, planes individuales y acciones de mejora sobre la aplicación existente. No reemplaza el ecosistema previo (tareas, proyectos, equipos, reuniones, encuestas, directorio, competencias, roles ni ajustes).

## Funciones incluidas

- **Indicadores de personas:** recuento de formaciones activas/finalizadas, planes activos, acciones abiertas y brechas de competencias. Para RR. HH. y administración, el módulo se complementa con el panel de rendimiento ya existente (tareas, cumplimiento, atrasos y competencias).
- **Catálogo de formación:** alta de formaciones con descripción, proveedor, modalidad y estado; inscripción de empleados de la misma organización; consulta de participantes.
- **Evaluación de formación:** evaluaciones de entrada, salida, prácticas y seguimiento con puntuación de 0 a 100, evidencia, evaluador y notas. Una evaluación `post` actualiza la puntuación final de la inscripción.
- **Planes individuales:** creación de planes para empleados activos, fechas objetivo y acciones concretas con tipo, prioridad, estado, evidencia y resultado.
- **Seguimiento del empleado:** el empleado puede consultar sus propios planes y actualizar el avance de sus acciones; no puede ver planes de otros empleados ni administrar el catálogo.
- **Acciones de People Analytics:** registro de hallazgos y propuestas de intervención, prioridad, estado y resultado.
- **Aislamiento por organización:** las operaciones validan la organización del usuario en el servidor; no se confía en el `organizationId` enviado por el navegador.
- **Permisos:** superadmin, admin y RR. HH. pueden gestionar formación, planes y acciones; el empleado solo consulta sus planes, se inscribe en formaciones disponibles y actualiza sus propias acciones/inscripciones.

## Definiciones de indicadores

- **Brecha de competencia:** `nivel requerido - nivel actual`; solo se cuenta como brecha cuando el resultado es mayor que cero.
- **Brecha crítica:** diferencia de dos o más niveles.
- **Formaciones activas:** estados `open` o `in_progress`.
- **Planes activos:** estado `active`.
- **Acciones abiertas de analítica:** estados `proposed`, `accepted` o `in_progress`.

Los indicadores describen registros disponibles. No constituyen por sí solos una evaluación objetiva del valor o rendimiento de una persona. Deben interpretarse con evidencia, contexto y revisión humana.

## Instalación en Neon

1. Haz un respaldo de la base Neon antes de modificarla (Neon Console → proyecto → Branches/Backups o `pg_dump`).
2. Abre el SQL Editor de Neon y selecciona la base que usa FocusIA.
3. Ejecuta **una sola vez** el archivo `database/migrations/2026_people_analytics_growth.sql`. La migración es aditiva y usa `IF NOT EXISTS`; no elimina tablas ni datos existentes.
4. Confirma que se crearon estas tablas: `training_assessments`, `development_plans`, `development_plan_actions`, `people_analytics_actions` y `people_kpi_snapshots`.
5. No vuelvas a ejecutar el esquema completo sobre una base que ya tiene datos. Esta entrega requiere el esquema Neon completo anterior más esta migración aditiva.

## Publicación

1. Descarga y extrae el ZIP.
2. Sustituye el contenido del repositorio por el contenido de `focusai-main` (mantén el `.env` fuera del repositorio; nunca subas credenciales).
3. Revisa que Render tenga `DATABASE_URL` apuntando a Neon, `SESSION_SECRET` de al menos 32 caracteres, `NODE_ENV=production` y `PORT` gestionado por Render.
4. Haz commit y push al repositorio conectado a Render.
5. Espera a que termine el deploy y revisa los logs. Después inicia sesión y abre **Desarrollo del talento** desde el menú.
6. Prueba con cuentas de cada rol y con al menos dos organizaciones distintas para comprobar el aislamiento.

## Comprobaciones locales

Desde `focusai-main`:

```bash
npm install
node --check server.js
node --check js/enterprise.js
npm start
```

La comprobación de sintaxis no sustituye una prueba de integración con Neon. Para verificar operaciones reales se necesita ejecutar la migración en una base de pruebas y probar cada flujo con cuentas de los cuatro roles.

## Alcance y límites conocidos de esta entrega

- El registro de hallazgos de People Analytics es asistido por el personal autorizado: la aplicación no inventa causas ni emite decisiones laborales automáticas.
- Los KPIs se calculan a partir de los registros existentes de FocusIA. La calidad depende de que las tareas, evaluaciones, requisitos por puesto y estados estén correctamente registrados.
- La tabla de snapshots permite almacenar cortes históricos, pero esta versión presenta indicadores vivos y todavía no incluye un programador automático de snapshots ni comparativas históricas gráficas.
- La interfaz de captura usa diálogos sencillos para los nuevos flujos; la persistencia y autorización sí se realizan en el backend. Una siguiente iteración de UX puede sustituir esos diálogos por formularios completos sin cambiar el modelo de datos.
- No se ha ejecutado una prueba contra tu instancia privada de Neon ni contra tu servicio Render desde este entorno. No se afirma que el despliegue remoto esté verificado.
