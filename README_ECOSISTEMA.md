# FocusAI — Ecosistema empresarial

## Qué se añadió
- Navegación reorganizada por áreas: espacio de trabajo, comunicación, personas/talento, productividad personal y administración.
- Nuevo módulo **Reuniones y llamadas**: formulario de reunión, prueba de cámara/micrófono con permiso del navegador, historial y generación de resumen a partir de notas/transcripción. Si el asistente de IA ya está configurado en Ajustes, intenta producir un resumen con él; si no, utiliza una extracción local preliminar.
- Nuevo módulo **Encuestas de RR. HH.**: crear encuestas, definir categoría, preguntas y anonimato, consultar preguntas y registrar respuestas de prueba.
- Nuevo **Directorio de empleados**: búsqueda, altas, edición, desactivación y eliminación de perfiles.
- Nuevo módulo **Competencias y crecimiento**: niveles actuales y requeridos, brechas y fechas de revisión.
- Nuevo **Panel de usuarios y permisos**: administración de perfiles y roles de demostración.
- Nuevo sistema visual para la shell y los módulos nuevos; ajustes visuales para que los módulos antiguos encajen mejor.
- Actualización de caché del service worker y manifiesto PWA.

## Cómo probarlo
1. Descomprime el ZIP.
2. Abre una terminal en la carpeta `focusai-main`.
3. Ejecuta un servidor estático, por ejemplo:
   - Windows con Python instalado: `py -m http.server 8000`
   - macOS/Linux: `python3 -m http.server 8000`
4. Abre `http://localhost:8000` en el navegador. No abras `index.html` con doble clic: el router carga vistas mediante `fetch`.
5. Inicia sesión en la aplicación existente y prueba las nuevas secciones desde la barra lateral.

## Alcance importante de esta versión
Este ZIP implementa una **primera versión funcional de interfaz y flujos locales**. Los datos de reuniones, encuestas, empleados, competencias y roles se guardan en `localStorage` del navegador; no se sincronizan entre dispositivos ni usuarios. Los perfiles iniciales son datos ficticios de demostración.

La vista de llamada solicita acceso local a cámara y micrófono, pero **no conecta a varias personas en una videollamada real**. Para eso hay que integrar un proveedor de WebRTC/RTC (por ejemplo, LiveKit, Daily, Twilio o un servidor WebRTC propio), salas, señalización y controles de acceso. La función de resumen puede usar el asistente FocusAI configurado, pero no transcribe audio por sí misma.

Los roles de esta versión sirven para probar la navegación. **No son una frontera de seguridad de producción**: antes de usar datos reales, hay que implementar autenticación/autorización en el backend, políticas RLS de Supabase, permisos por organización, auditoría, consentimiento y reglas de retención de datos. También debe conectarse el directorio de empleados a una fuente de datos compartida.

## Validación
Se comprobó la sintaxis de todos los archivos JavaScript con `node --check`. No se modificaron deliberadamente los módulos existentes de tareas, calendario, hábitos, objetivos, temporizador, estadísticas, IA, proyectos o gamificación.
