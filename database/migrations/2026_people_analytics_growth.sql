-- Migración aditiva FocusIA People Analytics. Respaldar Neon antes de ejecutar.
BEGIN;
CREATE TABLE IF NOT EXISTS training_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 enrollment_id uuid NOT NULL REFERENCES training_enrollments(id) ON DELETE CASCADE,
 assessment_type text NOT NULL CHECK (assessment_type IN ('pre','post','practical','follow_up')),
 score numeric(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100), evidence text,
 assessed_by uuid REFERENCES profiles(id) ON DELETE SET NULL, assessed_at timestamptz NOT NULL DEFAULT now(), notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS development_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, title text NOT NULL, description text,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','cancelled')),
 start_date date, target_date date, created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL, reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date)
);
CREATE TABLE IF NOT EXISTS development_plan_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES development_plans(id) ON DELETE CASCADE,
 skill_id uuid REFERENCES skills(id) ON DELETE SET NULL, training_id uuid REFERENCES trainings(id) ON DELETE SET NULL,
 title text NOT NULL, description text, action_type text NOT NULL DEFAULT 'practice' CHECK (action_type IN ('training','practice','mentoring','assessment','project','other')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','blocked','cancelled')),
 priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
 due_date date, completed_at timestamptz, evidence text, outcome_notes text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS people_analytics_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 title text NOT NULL, finding text NOT NULL, rationale text, source_metric text, source_period_start date, source_period_end date,
 priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
 status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','in_progress','completed','dismissed')),
 owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL, target_date date, outcome text,
 created_by uuid REFERENCES profiles(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS people_kpi_snapshots (
 id bigserial PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 scope_type text NOT NULL CHECK (scope_type IN ('organization','department','team','position','employee')),
 scope_id text NOT NULL, metric_key text NOT NULL, metric_value numeric(14,4), numerator numeric(14,4), denominator numeric(14,4),
 period_start date NOT NULL, period_end date NOT NULL, source_note text, calculated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_training_assessments_org_date ON training_assessments(organization_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_development_plans_org_employee ON development_plans(organization_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_development_actions_plan_status ON development_plan_actions(plan_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_people_actions_org_status ON people_analytics_actions(organization_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_people_kpi_scope_period ON people_kpi_snapshots(organization_id, scope_type, scope_id, metric_key, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_employee_status ON training_enrollments(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_skill_assessments_employee_date ON skill_assessments(employee_id, assessment_date DESC);
COMMIT;
