# Configuración global de IA en FocusAI

La IA seleccionada por el superadministrador se guarda en `platform_ai_settings` de Neon. El servidor crea esa tabla automáticamente al iniciar. No es necesario ejecutar SQL manualmente.

## Seleccionar proveedor

1. Inicia sesión como `superadmin`.
2. Abre Ajustes → Proveedor de inteligencia artificial.
3. Selecciona un proveedor local (Ollama, LM Studio, Jan o LocalAI) o Gemini API.
4. Para IA local alojada en otra PC, indica una URL accesible DESDE Render, por ejemplo una URL HTTPS de Cloudflare Tunnel. `localhost` se refiere al servidor Render, no al ordenador del usuario.
5. Para Gemini, pega la clave API y selecciona el modelo. La clave se cifra en el servidor usando `SESSION_SECRET` y nunca se devuelve al frontend. Déjala vacía para conservar la clave guardada.
6. Pulsa “Guardar y probar conexión”.

Todos los módulos que usan `FlowAI` consultan el proveedor global. Los resúmenes de reuniones también utilizan el proveedor elegido; la transcripción sigue dependiendo del motor Whisper instalado/configurado en el servidor.

## Asistente conversacional y permisos por rol

El chat arma su contexto en el backend a partir del usuario autenticado; ignora las instrucciones de sistema/contexto que mande el navegador. Las cuentas `employee` y el rol legado `user` solo aportan sus propios registros, competencias, capacitaciones, entrevistas de desarrollo y estado de encuestas. Si una persona pregunta por un compañero o por métricas de un equipo, el backend devuelve una negativa sin consultar al modelo.

Los roles `admin`, `hr` y `superadmin` reciben contexto de RR. HH. limitado a su organización: directorio, tareas asignadas, competencias, capacitaciones, entrevistas, encuestas agregadas y resúmenes de reuniones. No se incluyen diarios ni registros privados de productividad de otros empleados, ni datos de otras organizaciones. Las acciones de RR. HH. disponibles en el chat vuelven a pasar por las rutas existentes, que verifican rol y organización antes de guardar cambios.

Las preguntas fuera de FocusAI reciben un mensaje fijo de alcance y no se envían al proveedor de IA. El historial del chat se separa por usuario y se limpia al cerrar sesión o cambiar de cuenta.

El contexto se recupera según el tema preguntado para evitar enviar al modelo módulos que no vienen al caso. El chat limita su historial y la cantidad de texto generada, y Ollama mantiene el modelo cargado durante cinco minutos después de usarlo para reducir la espera de las consultas siguientes.

La configuración guardada en `platform_ai_settings` es global y no se borra al cerrar sesión el superadministrador. Para que una IA local siga disponible, la PC que ejecuta Ollama debe permanecer encendida y conectada, y el túnel ngrok debe seguir ejecutándose con la misma URL configurada. Cerrar la sesión del superadministrador no detiene Ollama ni ngrok; apagar la PC o cerrar el túnel sí interrumpe temporalmente la conexión.

## Costes y privacidad

Gemini API se factura según la cuenta, el modelo y el uso. No está incluida automáticamente en una suscripción de ChatGPT. Las solicitudes enviadas a Gemini salen del servidor y pueden incluir datos a los que el rol autenticado tiene acceso en FocusAI; la IA local envía ese contexto a la URL configurada. Selecciona un proveedor conforme a las políticas de privacidad de tu organización.

Si se cambia `SESSION_SECRET`, las claves cifradas previamente guardadas podrían dejar de descifrarse; vuelve a guardar la clave de Gemini después de rotar ese secreto.

## Notificaciones

Los recordatorios de tareas, hábitos y alertas de enfoque usan las APIs de notificación del navegador y requieren permiso. Los temporizadores del navegador no son un sistema de notificaciones garantizado cuando la aplicación está cerrada. El reporte semanal no se envía automáticamente; por eso se retiró su interruptor de los ajustes.


Configuración actualizada: el superadmin puede elegir globalmente Ollama local o Gemini API. En Gemini, configura una clave de Google AI Studio y un modelo compatible, por defecto gemini-3.8-flash mediante la Interactions API. No asumas que gemini-3.8-flash es gratuito: comprueba precios, cuotas y disponibilidad en Google AI Studio.
