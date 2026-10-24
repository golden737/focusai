# Demo ficticia para FocusIA

## Preparación

1. Usa una base de desarrollo o una copia de tu Neon, no la base de producción.
2. Aplica `focusai_neon_schema_completo.sql` si aún no existe el esquema.
3. Inicia FocusIA una vez con esa base (`npm start`) para que el backend cree `auth_users` y `app_records`.
4. En Neon SQL Editor, ejecuta `DEMO_FOCUSIA_SEED.sql` completo.
5. Inicia o recarga FocusIA y entra con `admin@focusia-demo.test` / `FocusIA-Demo-2026!`.

Todos los nombres y resultados de la muestra son inventados. La cuenta es solo para pruebas; no uses la contraseña en producción. El script es repetible y no elimina ni modifica registros ajenos a los UUID de la demo. La empresa aparece como **FocusIA Demo**.

## Qué contiene y qué debes ver

- 1 organización, 3 departamentos, 3 puestos, 1 administrador demo, 1 perfil de RR. HH. y 4 empleados demo.
- Competencias, requisitos por puesto, evidencia y evaluaciones históricas de ejemplo.
- 2 cursos y 3 matrículas en distintos estados.
- 1 encuesta anónima publicada con 2 respuestas ficticias.
- 12 tareas, guardadas tanto en la tabla relacional como en `app_records`.

El endpoint de People Analytics debe mostrar **75 %** de tareas completadas (9/12), **2** tareas vencidas y **4** brechas entre **7** competencias evaluadas frente a los requisitos definidos. La página actual de indicadores está en el área de empleados/RR. HH. El proyecto aún no tiene páginas completas de cursos ni un panel analítico con gráficos históricos; este seed llena tablas y vistas que ya existen, no crea módulos faltantes.

## Verificación local sin Neon

Desde la carpeta del proyecto:

```powershell
npm run test:demo-analytics
```

Esto valida el cálculo esperado del fixture y el tratamiento de denominador vacío. No ejecuta SQL contra una base ni prueba autenticación real.

## Quitar la demo

Elimina únicamente la organización demo y su login. Las tablas con FK hacia perfiles/organización se limpian por cascada en el esquema:

```sql
BEGIN;
DELETE FROM auth_users WHERE email = 'admin@focusia-demo.test';
DELETE FROM profiles
WHERE organization_id = 'a1000000-0000-4000-8000-000000000001';
DELETE FROM organizations
WHERE id = 'a1000000-0000-4000-8000-000000000001'
  AND slug = 'focusia-demo';
COMMIT;
```

Los identificadores están reservados para este conjunto de demo. No uses esos UUID para tus datos propios.
