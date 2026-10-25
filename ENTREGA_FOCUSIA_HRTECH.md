# FocusIA: talento y desarrollo

## Qué incluye esta versión

- **Competencias:** evaluación por persona con categoría, definición, nivel actual y objetivo del puesto, evidencia observable, método y siguiente revisión. Cada evaluación queda en el historial.
- **Recomendaciones de desarrollo:** coincidencias entre brechas y cursos existentes; además, un botón solicita sugerencias al proveedor de IA configurado en Ajustes. El prompt usa brechas agrupadas por puesto y catálogo de cursos, sin nombres ni respuestas de encuestas.
- **Capacitación:** catálogo de cursos relacionado con competencias, asignación a una o varias personas y seguimiento de estado/progreso para RR. HH. Las personas ven sus cursos en **Mi desarrollo** y pueden actualizar su avance o confirmar que los completaron.
- **Entrevistas 1:1:** agenda de desarrollo, retroalimentación, bienestar o seguimiento; permite guardar notas y acuerdos de seguimiento. Las notas solo aparecen en las vistas de RR. HH. y administración.
- **Dashboard individual:** acceso desde cada fila del directorio; resume tareas, competencias y brechas, cursos, entrevistas y participación en encuestas. No revela respuestas de encuestas.
- **Base de datos:** se crea de manera idempotente la tabla `employee_development_interviews`; el esquema completo y el seed de demo también la incluyen.

## Despliegue y prueba

El backend ejecuta la creación incremental de la tabla de entrevistas al iniciar. Si ya instalaste el esquema principal, no necesitas volver a ejecutarlo; al publicar el proyecto en Render, el backend añade esa tabla automáticamente. Para poblar una base de desarrollo con los datos ficticios, usa `database/DEMO_FOCUSIA_SEED.sql` después de que la aplicación haya iniciado al menos una vez.

Para que funcione el botón de sugerencias de IA debe haber un proveedor operativo configurado en FocusIA. Sin esa configuración, el resto de las funciones de talento sigue disponible y la pantalla informa el error del proveedor.

Verificaciones locales ejecutadas:

- `node --check server.js`
- `node --check js/enterprise.js`
- `npm run test:demo-analytics`

No se conectó a Neon ni se probó el despliegue de Render. El dashboard presenta actividad registrada; no calcula una calificación integral del desempeño. Las entrevistas son conversaciones internas de desarrollo, no un módulo de selección de candidatos.
