# FocusAI conectado a Neon PostgreSQL

## Requisitos
- Node.js 20 o superior
- La base Neon con el esquema `focusai_neon_schema_completo.sql` aplicado
- Una URL de conexión de Neon con SSL

## Configuración local
1. En Windows, abre PowerShell dentro de la carpeta y ejecuta `Copy-Item .env.example .env`.
2. Abre `.env` con el Bloc de notas. En `DATABASE_URL`, pega la cadena de conexión de Neon (Connect → Node.js; usa la conexión pooled si Neon la ofrece). No la pongas en `index.html` ni en ningún archivo `js/`.
3. Cambia `SESSION_SECRET` por una cadena aleatoria larga (32 caracteres o más).
4. En PowerShell ejecuta `npm install` y después `npm start`.
5. Abre `http://localhost:3000`.
6. Registra una cuenta desde la pantalla de acceso.

El esquema principal debe estar aplicado en Neon con el SQL de `database/focusai_neon_schema_completo.sql` (si ya lo ejecutaste, no lo vuelvas a ejecutar sin revisar el estado). Al iniciar, el backend crea las tablas auxiliares que necesita (`auth_users`, `app_records`, `app_sessions` y las tablas de datos que faltaran). La contraseña se guarda como hash bcrypt. La sesión se mantiene en una cookie HttpOnly y su registro queda en PostgreSQL; no se persisten tareas ni preferencias de la aplicación en localStorage o IndexedDB.

## Organización compartida y acceso de empleados
- La primera cuenta crea la organización y recibe rol de administrador.
- Desde Administración, comparte el código de invitación. Una cuenta nueva puede ir a **Unirse a organización** e introducirlo.
- También puedes crear primero el perfil de un empleado con su correo. Cuando esa persona se registre con el mismo correo, la cuenta se vincula automáticamente al perfil y a la organización.
- Los perfiles, encuestas, respuestas, competencias, evaluaciones históricas y resúmenes se guardan en tablas de Neon y se aíslan por organización.

## Ajuste manual de roles
Si necesitas cambiar manualmente el rol de una cuenta, abre el SQL Editor de Neon y ejecuta el siguiente ejemplo (cambia el correo). Normalmente puedes administrar roles desde el módulo de Administración:

```sql
UPDATE profiles SET role = 'admin', updated_at = now() WHERE email = 'tu-correo@dominio.com';
```

Después cierra sesión y vuelve a entrar. Los permisos se verifican en el servidor; no se debe dar rol de administrador a usuarios que no lo necesiten.

## Despliegue
Este proyecto ya no es solo estático: debe desplegarse como aplicación Node (por ejemplo, Render/Railway/Fly.io) con `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production` y `PORT` configurados. No publiques el archivo `.env`. Sirve el frontend desde el mismo servidor para que la cookie de sesión sea same-origin.

## Nota sobre seguridad y esquema
El acceso a los registros se filtra por el usuario autenticado en el backend. El frontend nunca recibe `DATABASE_URL`. El contenido personal se guarda en `app_records` por usuario; los módulos empresariales usan tablas relacionales y se filtran por organización. La interfaz no utiliza `localStorage` ni `IndexedDB` para persistir datos. El navegador mantiene únicamente la cookie HttpOnly necesaria para la sesión y archivos estáticos de la aplicación pueden estar en caché; la API no se cachea.

## Comprobar la conexión antes de iniciar la aplicación
Después de configurar `.env`, ejecuta `npm run test:db`. El script realiza consultas de solo lectura: verifica la conexión, identifica la base y revisa que estén las tablas principales. No imprime la cadena de conexión ni su contraseña y no modifica datos. Si informa de tablas faltantes, revisa el esquema antes de iniciar el servidor.

**Seguridad:** nunca incluyas `.env` en un ZIP compartido ni lo subas a GitHub. Si una cadena de conexión se compartió en un chat, regenera la contraseña en Neon y usa la nueva solo en el archivo `.env` local.

## Llamadas y resúmenes con IA local
Consulta `README_LLAMADAS_IA_LOCAL.md` para configurar Jitsi Meet, Whisper y Ollama sin API de IA de pago.
