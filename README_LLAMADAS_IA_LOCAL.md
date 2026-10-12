# FocusAI: llamadas y resumen local (opción A)

## Qué incluye
- Llamadas de audio/video mediante la IFrame API de Jitsi Meet.
- Sesiones, transcripciones y resúmenes guardados en Neon con aislamiento por organización y control de acceso por usuario/rol.
- Transcripción local mediante Whisper y resumen mediante Ollama. No se necesita una API de IA de pago.

## Importante sobre el flujo automático
El servicio público `meet.jit.si` no entrega a la aplicación el audio remoto de la sala ni genera una grabación accesible automáticamente desde este código. Por eso, al terminar una llamada, para generar el resumen debes proporcionar una grabación autorizada (hasta 100 MB) o pegar una transcripción. El backend ejecuta Whisper y Ollama automáticamente una vez que recibe el archivo/texto. Para que el proceso sea completamente automático sin cargar archivos manualmente, se necesitaría Jitsi/Jibri autohospedado y configurar la grabación; esto requiere un servidor y más recursos.

## Requisitos
- Node.js 20 o superior.
- Neon configurado en `.env` con `DATABASE_URL` y `SESSION_SECRET` (32 caracteres o más).
- Ollama instalado y ejecutándose en la computadora que corre FocusAI.
- Python 3.10–3.12 recomendado para Whisper, FFmpeg y dependencias compatibles.

## Configuración en Windows (PowerShell)
1. Copia `.env.example` a `.env` y completa `DATABASE_URL` y `SESSION_SECRET`. No compartas el `.env` ni lo subas a GitHub.
2. Instala dependencias: `npm install`.
3. Instala FFmpeg y asegúrate de que `ffmpeg` esté disponible en PATH.
4. Instala Whisper: `python -m pip install -r requirements-ai.txt`.
5. Instala Ollama desde https://ollama.com/ y descarga el modelo: `ollama pull llama3.2:3b`.
6. En `.env`, configura `OLLAMA_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=llama3.2:3b` y `WHISPER_MODEL=base`.
7. Inicia Ollama y después FocusAI: `npm start`.
8. Entra a Reuniones y llamadas, crea la sala, participa en la llamada y al terminar carga una grabación o pega una transcripción.

## Privacidad y producción
- Avisa y solicita autorización antes de grabar/transcribir.
- Jitsi público es para pruebas; no lo uses para conversaciones confidenciales o productivas. Considera autohospedar Jitsi y Jibri antes de producción.
- Los audios cargados se procesan en un directorio temporal y se eliminan al terminar el proceso; no se guardan en Neon. La transcripción y el resumen sí quedan guardados en Neon.
- El procesamiento local depende de la capacidad del equipo; reuniones largas pueden tardar.
- Revisa el resumen generado antes de distribuirlo; no debe usarse como evaluación laboral automática.
