# Modelo de roles y administración de FocusAI

## Roles
- `superadmin`: administra organizaciones y cuentas globalmente desde `/api/superadmin/*`.
- `admin`: gestiona los datos laborales de perfiles de su propia organización. No puede asignar roles, cambiar correos de cuentas existentes ni restablecer contraseñas.
- `hr`: consulta y administra encuestas, métricas y competencias dentro de su organización, sin gestionar cuentas.
- `employee`: funciones personales y encuestas asignadas.

## Endpoints nuevos de superadministración
- `GET /api/superadmin/overview`: lista organizaciones y perfiles/cuentas.
- `POST /api/superadmin/organizations`: crea una organización.
- `PATCH /api/superadmin/organizations/:id`: renombra o activa/desactiva una organización.
- `POST /api/superadmin/users`: crea una cuenta y asigna rol y organización.
- `PATCH /api/superadmin/users/:id`: modifica nombre, correo, rol, organización, estado y contraseña.

La autorización se vuelve a comprobar en el servidor usando `profiles.role` de Neon. La interfaz también filtra la navegación por rol, pero ocultar enlaces no sustituye los controles del backend.
