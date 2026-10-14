require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: Falta DATABASE_URL. Configúrala en el archivo .env local.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10000,
  query_timeout: 10000,
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT current_database() AS database,
             current_user AS db_user,
             version() AS server_version,
             now() AS checked_at
    `);
    const db = result.rows[0];
    console.log('OK: conexión PostgreSQL establecida.');
    console.log(`Base de datos: ${db.database}`);
    console.log(`Usuario de BD: ${db.db_user}`);
    console.log(`Servidor: ${String(db.server_version).split(',')[0]}`);

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const names = new Set(tables.rows.map(r => r.table_name));
    const required = [
      'profiles', 'organizations', 'departments', 'job_positions',
      'auth_users', 'app_records', 'app_sessions', 'tasks', 'habits',
      'goals', 'projects', 'time_logs', 'journal', 'skills',
      'position_skill_requirements', 'employee_skills', 'skill_assessments',
      'surveys', 'survey_questions', 'survey_responses', 'survey_answers',
      'meetings', 'meeting_participants', 'meeting_summaries'
    ];
    const missing = required.filter(name => !names.has(name));
    console.log(`Tablas públicas detectadas: ${names.size}`);
    if (missing.length) {
      console.error('FALTAN tablas necesarias para todas las funciones:');
      console.error(' - ' + missing.join('\n - '));
      console.error('Aplica/revisa database/focusai_neon_schema_completo.sql y vuelve a ejecutar npm run test:db.');
      process.exitCode = 2;
    } else {
      console.log('OK: están presentes las tablas principales verificadas.');
    }
  } catch (error) {
    console.error('ERROR: no se pudo comprobar la conexión a Neon.');
    console.error(`Código: ${error.code || 'sin código'}`);
    console.error(`Detalle: ${error.message}`);
    console.error('No se imprime DATABASE_URL ni su contraseña. Verifica la cadena, la contraseña rotada, SSL y el acceso de red.');
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
