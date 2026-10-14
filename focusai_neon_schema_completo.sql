-- ============================================================================
-- FOCUSAI — ESQUEMA COMPLETO PARA NEON (PostgreSQL)
-- Base limpia: ejecutar UNA SOLA VEZ en el SQL Editor de Neon.
-- Incluye los 12 módulos/tablas existentes y los módulos nuevos de HRTech.
--
-- IMPORTANTE:
-- 1) Neon es PostgreSQL; este archivo sí es SQL.
-- 2) Este script crea estructura, no importa automáticamente los registros del
--    backup Supabase. La importación de datos existentes es un paso separado.
-- 3) Supabase Auth/RLS (auth.uid(), auth.users, roles authenticated/anon) no
--    existen en Neon. La autenticación y autorización deben hacerse en el
--    backend de FocusAI y no confiar solo en el rol enviado por el navegador.
-- 4) No almacenar contraseñas en profiles. Usa un proveedor de autenticación
--    (p. ej. Better Auth/Auth.js/Clerk) o una implementación segura en backend.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- ORGANIZACIÓN / EMPRESAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  logo_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  manager_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS job_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id uuid,
  title text NOT NULL,
  description text,
  level text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (department_id)
    REFERENCES departments(id) ON DELETE SET NULL,
  UNIQUE (organization_id, title)
);

-- ----------------------------------------------------------------------------
-- PERFILES: mantiene id UUID para vincular usuarios migrados.
-- Roles nuevos: employee, hr, admin. "user" legado se normaliza a employee.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  name text,
  email text,
  avatar_url text,
  accent_color text DEFAULT '#6366f1',
  theme text DEFAULT 'dark',
  role text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('employee','hr','admin','user')),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  position_id uuid REFERENCES job_positions(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  employee_number text,
  phone text,
  hire_date date,
  employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','inactive','leave','terminated')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Permite ejecutar este esquema también sobre una BD que ya tenga la tabla
-- profiles del esquema anterior.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES job_positions(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employee_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Reemplaza el CHECK antiguo (admin/user) por los tres roles del ecosistema.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
UPDATE profiles SET role = 'employee' WHERE role = 'user';
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'employee';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('employee','hr','admin'));

-- ----------------------------------------------------------------------------
-- PRODUCTIVIDAD ORIGINAL (conserva los campos del respaldo)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id text PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  type text DEFAULT 'short',
  progress integer DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  target_date date,
  color text,
  icon text,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habits (
  id text PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  frequency text DEFAULT 'daily',
  target_count integer DEFAULT 1,
  reminder_time text,
  streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  total_completed integer DEFAULT 0,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id text PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  habit_id text REFERENCES habits(id) ON DELETE CASCADE,
  date date NOT NULL,
  count integer DEFAULT 1,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal (
  id text PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  content text,
  mood integer CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  emotions text[],
  gratitude text[],
  highlights text,
  improvements text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text,
  icon text,
  status text DEFAULT 'active',
  columns jsonb,
  start_date date,
  end_date date,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'none',
  status text DEFAULT 'pending',
  completed boolean DEFAULT false,
  completed_at timestamptz,
  due_date date,
  due_time text,
  labels text[],
  estimated_min integer,
  actual_min integer,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  goal_id text REFERENCES goals(id) ON DELETE SET NULL,
  order_index integer,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_logs (
  id text PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  duration_min integer,
  task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  description text,
  mode text DEFAULT 'stopwatch',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  invite_code text UNIQUE,
  icon text DEFAULT '👥',
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'none',
  completed boolean DEFAULT false,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  due_date date,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- RR. HH. / COMPETENCIAS / CRECIMIENTO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS position_skill_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES job_positions(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  required_level smallint NOT NULL CHECK (required_level BETWEEN 1 AND 5),
  target_date date,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position_id, skill_id)
);

CREATE TABLE IF NOT EXISTS employee_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  current_level smallint NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
  assessed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assessed_at timestamptz,
  evidence text,
  notes text,
  next_review_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, skill_id)
);

CREATE TABLE IF NOT EXISTS skill_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  previous_level smallint CHECK (previous_level BETWEEN 1 AND 5),
  assessed_level smallint NOT NULL CHECK (assessed_level BETWEEN 1 AND 5),
  assessed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assessment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  evidence text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  provider text,
  format text CHECK (format IS NULL OR format IN ('online','in_person','hybrid','self_paced')),
  url text,
  start_date date,
  end_date date,
  duration_hours numeric(7,2),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','open','in_progress','completed','cancelled')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_skills (
  training_id uuid NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  expected_level smallint CHECK (expected_level BETWEEN 1 AND 5),
  PRIMARY KEY (training_id, skill_id)
);

CREATE TABLE IF NOT EXISTS training_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled','in_progress','completed','cancelled','failed')),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  score numeric(5,2),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text,
  UNIQUE (training_id, employee_id)
);

-- ----------------------------------------------------------------------------
-- ENCUESTAS FLEXIBLES PARA RR. HH.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','closed','archived')),
  anonymous boolean NOT NULL DEFAULT false,
  allow_multiple_responses boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL
    CHECK (question_type IN ('text','textarea','single_choice','multiple_choice','rating','yes_no','number','date')),
  options jsonb,
  required boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  respondent_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  anonymous_token_hash text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','withdrawn')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (respondent_id IS NOT NULL OR anonymous_token_hash IS NOT NULL OR status = 'draft')
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  answer_text text,
  answer_json jsonb,
  numeric_value numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id)
);

-- ----------------------------------------------------------------------------
-- LLAMADAS / REUNIONES / RESÚMENES
-- Los medios de audio/video se gestionan con un proveedor WebRTC; aquí se
-- almacenan metadatos, participantes, transcripción autorizada y resumen.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  meeting_type text NOT NULL DEFAULT 'video'
    CHECK (meeting_type IN ('video','audio','in_person')),
  provider text,
  provider_room_id text,
  join_url text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','waiting','in_progress','completed','cancelled','failed')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  transcript_text text,
  recording_url text,
  recording_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_role text NOT NULL DEFAULT 'participant'
    CHECK (participant_role IN ('host','participant','presenter')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  left_at timestamptz,
  attendance_status text NOT NULL DEFAULT 'invited'
    CHECK (attendance_status IN ('invited','accepted','declined','joined','absent')),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS meeting_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_by text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- AUDITORÍA Y NOTIFICACIONES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  category text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- ACTUALIZACIÓN AUTOMÁTICA updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','profiles','journal','tasks','employee_skills',
    'trainings','surveys','meetings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_'||t||'_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_'||t||'_updated_at', t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- ÍNDICES PARA CONSULTAS FRECUENTES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_org_role ON profiles(organization_id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_position ON profiles(position_id);
CREATE INDEX IF NOT EXISTS idx_profiles_manager ON profiles(manager_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_org_employee_number
  ON profiles(organization_id, employee_number)
  WHERE employee_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goals_user_created ON goals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_habits_user_archived ON habits(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_due ON tasks(user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user_date ON time_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_team_created ON team_messages(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_tasks_team_created ON team_tasks(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skills_org_category ON skills(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_position_skill_position ON position_skill_requirements(position_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_skill_assessments_employee_date ON skill_assessments(employee_id, assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_training_org_status ON trainings(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_employee ON training_enrollments(employee_id, status);

CREATE INDEX IF NOT EXISTS idx_surveys_org_status ON surveys(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_survey_questions_order ON survey_questions(survey_id, order_index);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_date ON survey_responses(survey_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_respondent ON survey_responses(respondent_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_question ON survey_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_meetings_org_start ON meetings(organization_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_creator ON meetings(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON meeting_participants(user_id, attendance_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_date ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

COMMIT;

-- ----------------------------------------------------------------------------
-- CONFIGURACIÓN INICIAL (OPCIONAL)
-- Crea una organización de prueba y un perfil administrador SOLO después de
-- crear la cuenta de autenticación del administrador y conocer su UUID.
--
-- INSERT INTO organizations (name, slug) VALUES ('Mi empresa', 'mi-empresa')
-- RETURNING id;
--
-- INSERT INTO profiles (id, name, email, role, organization_id)
-- VALUES ('UUID_REAL_DE_LA_CUENTA', 'Administrador', 'admin@empresa.com',
--         'admin', 'UUID_DE_LA_ORGANIZACION');
--
-- No hagas público el connection string de Neon ni lo incluyas en frontend.
-- Usa DATABASE_URL en variables de entorno del backend.
