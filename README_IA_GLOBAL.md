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

## Costes y privacidad

Gemini API se factura según la cuenta, el modelo y el uso. No está incluida automáticamente en una suscripción de ChatGPT. Las solicitudes enviadas a Gemini salen del servidor y pueden incluir el contexto de productividad necesario para la tarea. La IA local envía ese contexto a la URL local configurada.

Si se cambia `SESSION_SECRET`, las claves cifradas previamente guardadas podrían dejar de descifrarse; vuelve a guardar la clave de Gemini después de rotar ese secreto.

## Notificaciones

Los recordatorios de tareas, hábitos y alertas de enfoque usan las APIs de notificación del navegador y requieren permiso. Los temporizadores del navegador no son un sistema de notificaciones garantizado cuando la aplicación está cerrada. El reporte semanal no se envía automáticamente; por eso se retiró su interruptor de los ajustes.


Configuración actualizada: el superadmin puede elegir globalmente Ollama local o Gemini API. En Gemini, configura una clave de Google AI Studio y un modelo compatible, por ejemplo gemini-2.5-flash. El nivel gratuito está sujeto a cuotas, disponibilidad y condiciones de Google.
