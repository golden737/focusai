-- Datos FICTICIOS para entorno de demostración. Requiere el esquema principal
-- aplicado y que el backend haya iniciado al menos una vez (auth_users/app_records).
-- Ejecutar en Neon SQL Editor o psql. Seguro para repetir; no borra datos.
-- Cuenta de acceso: admin@focusia-demo.test / FocusIA-Demo-2026!
-- No usar esta contraseña en producción. Para borrar la demo, ver documentación.
BEGIN;

-- Tabla de atribución: el dashboard cuenta solo asignaciones verificadas por backend.
CREATE TABLE IF NOT EXISTS employee_task_assignments (
  task_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_task_assignments_employee_idx
  ON employee_task_assignments(organization_id,employee_id,created_at DESC);

INSERT INTO organizations(id,name,slug,status)
VALUES ('a1000000-0000-4000-8000-000000000001','FocusIA Demo','focusia-demo','active')
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,status='active';

INSERT INTO departments(id,organization_id,name,description) VALUES
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','People & Culture','Equipo de personas y cultura.'),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Producto','Diseño y entrega del producto.'),
 ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','Operaciones','Operaciones y atención de clientes.')
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO job_positions(id,organization_id,department_id,title,description,level) VALUES
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','People Partner','Acompañamiento y desarrollo de personas.','mid'),
 ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','Product Designer','Diseño de experiencias digitales.','mid'),
 ('a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','Operations Analyst','Mejora de procesos y servicio.','junior')
ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,department_id=EXCLUDED.department_id,description=EXCLUDED.description;

INSERT INTO profiles(id,name,email,role,organization_id,department_id,position_id,employee_number,hire_date,employment_status,accent_color,theme) VALUES
 ('a4000000-0000-4000-8000-000000000001','Alex Demo','admin@focusia-demo.test','admin','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','DEMO-001',CURRENT_DATE-900,'active','#6366f1','light'),
 ('a4000000-0000-4000-8000-000000000002','María Rivera','maria.hr@focusia-demo.test','hr','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','DEMO-002',CURRENT_DATE-700,'active','#6366f1','light'),
 ('a4000000-0000-4000-8000-000000000003','Diego Hernández','diego.producto@focusia-demo.test','employee','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002','DEMO-003',CURRENT_DATE-500,'active','#6366f1','light'),
 ('a4000000-0000-4000-8000-000000000004','Sofía López','sofia.producto@focusia-demo.test','employee','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002','DEMO-004',CURRENT_DATE-300,'active','#6366f1','light'),
 ('a4000000-0000-4000-8000-000000000005','Carlos Mejía','carlos.ops@focusia-demo.test','employee','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000003','DEMO-005',CURRENT_DATE-180,'active','#6366f1','light'),
 ('a4000000-0000-4000-8000-000000000006','Valeria Cruz','valeria.ops@focusia-demo.test','employee','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000003','DEMO-006',CURRENT_DATE-60,'active','#6366f1','light')
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,role=EXCLUDED.role,organization_id=EXCLUDED.organization_id,department_id=EXCLUDED.department_id,position_id=EXCLUDED.position_id,employee_number=EXCLUDED.employee_number,hire_date=EXCLUDED.hire_date,employment_status='active';

INSERT INTO auth_users(id,email,password_hash,name) VALUES
 ('a4000000-0000-4000-8000-000000000001','admin@focusia-demo.test',crypt('FocusIA-Demo-2026!',gen_salt('bf',10)),'Alex Demo')
ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,name=EXCLUDED.name;

INSERT INTO skills(id,organization_id,name,description,category,active) VALUES
 ('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Comunicación','Comunica ideas con claridad y escucha activamente.','Interpersonal',true),
 ('a5000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Análisis de datos','Interpreta datos para recomendar acciones.','Técnica',true),
 ('a5000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','Diseño centrado en personas','Investiga necesidades y valida soluciones.','Técnica',true)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,active=true;

INSERT INTO position_skill_requirements(position_id,skill_id,required_level,rationale) VALUES
 ('a3000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',4,'Facilitar conversaciones y acompañamiento.'),
 ('a3000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000003',4,'Diseñar experiencias accesibles.'),
 ('a3000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000002',3,'Validar decisiones con datos.'),
 ('a3000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000002',4,'Analizar procesos y resultados.')
ON CONFLICT(position_id,skill_id) DO UPDATE SET required_level=EXCLUDED.required_level,rationale=EXCLUDED.rationale;

INSERT INTO employee_skills(employee_id,skill_id,current_level,assessed_by,assessed_at,evidence,notes,next_review_date) VALUES
 ('a4000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000001',4,'a4000000-0000-4000-8000-000000000001',CURRENT_DATE-20,'Facilitó retrospectiva de equipo con acuerdos documentados.','Nivel consistente.',CURRENT_DATE+160),
 ('a4000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000003',3,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-35,'Prototipo validado con cinco participantes.','En desarrollo.',CURRENT_DATE+90),
 ('a4000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000002',3,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-35,'Análisis de uso presentado al equipo.','Cumple nivel esperado.',CURRENT_DATE+180),
 ('a4000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-000000000003',2,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-25,'Práctica guiada de entrevistas.','Requiere acompañamiento.',CURRENT_DATE+60),
 ('a4000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-000000000002',2,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-25,'Ejercicio de análisis exploratorio.','Planificar formación.',CURRENT_DATE+60),
 ('a4000000-0000-4000-8000-000000000005','a5000000-0000-4000-8000-000000000002',3,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-18,'Informe mensual de incidencias.','Cerca del nivel requerido.',CURRENT_DATE+75),
 ('a4000000-0000-4000-8000-000000000006','a5000000-0000-4000-8000-000000000002',4,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-10,'Tablero operativo y análisis de tendencias.','Nivel requerido alcanzado.',CURRENT_DATE+180)
ON CONFLICT(employee_id,skill_id) DO UPDATE SET current_level=EXCLUDED.current_level,assessed_by=EXCLUDED.assessed_by,assessed_at=EXCLUDED.assessed_at,evidence=EXCLUDED.evidence,notes=EXCLUDED.notes,next_review_date=EXCLUDED.next_review_date,updated_at=now();

INSERT INTO skill_assessments(employee_id,skill_id,previous_level,assessed_level,assessed_by,assessment_date,method,evidence,notes) VALUES
 ('a4000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000003',2,3,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-35,'portfolio','Prototipo validado con cinco participantes.','Progreso desde evaluación inicial.'),
 ('a4000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-000000000003',1,2,'a4000000-0000-4000-8000-000000000002',CURRENT_DATE-25,'practical','Ejercicio de entrevista observado.','Siguiente paso: práctica con mentoría.')
ON CONFLICT DO NOTHING;

INSERT INTO trainings(id,organization_id,title,description,provider,format,start_date,end_date,duration_hours,status,created_by) VALUES
 ('a6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Fundamentos de investigación UX','Entrevistas, síntesis y pruebas de usabilidad.','Academia Demo','self_paced',CURRENT_DATE-20,CURRENT_DATE+20,8,'in_progress','a4000000-0000-4000-8000-000000000001'),
 ('a6000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Analítica práctica para equipos','Lectura de métricas y comunicación de hallazgos.','Academia Demo','online',CURRENT_DATE+14,CURRENT_DATE+30,6,'open','a4000000-0000-4000-8000-000000000001')
ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status;
INSERT INTO training_skills(training_id,skill_id,expected_level) VALUES
 ('a6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000003',3),
 ('a6000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000002',3)
ON CONFLICT(training_id,skill_id) DO UPDATE SET expected_level=EXCLUDED.expected_level;
INSERT INTO training_enrollments(training_id,employee_id,status,progress,score,enrolled_at,completed_at,notes) VALUES
 ('a6000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000003','in_progress',65,NULL,CURRENT_DATE-14,NULL,'Progreso de demostración.'),
 ('a6000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000004','completed',100,88,CURRENT_DATE-18,CURRENT_DATE-4,'Evaluación final ficticia para demo.'),
 ('a6000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000005','enrolled',0,NULL,CURRENT_DATE,NULL,'Pendiente de iniciar.')
ON CONFLICT(training_id,employee_id) DO UPDATE SET status=EXCLUDED.status,progress=EXCLUDED.progress,score=EXCLUDED.score,notes=EXCLUDED.notes;

INSERT INTO surveys(id,organization_id,title,description,category,status,anonymous,allow_multiple_responses,starts_at,ends_at,created_by) VALUES
 ('a7000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Pulso de equipo — Demo','Encuesta enteramente ficticia para probar la experiencia.','Clima','published',true,false,now()-interval '14 days',now()+interval '14 days','a4000000-0000-4000-8000-000000000001')
ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status,anonymous=true;
INSERT INTO survey_questions(id,survey_id,question_text,question_type,options,required,order_index) VALUES
 ('a8000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','¿Cómo calificarías la colaboración del equipo?','rating','["1","2","3","4","5"]'::jsonb,true,0),
 ('a8000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-000000000001','¿Qué ayudaría a mejorar el trabajo diario?','textarea',NULL,false,1)
ON CONFLICT(id) DO UPDATE SET question_text=EXCLUDED.question_text,question_type=EXCLUDED.question_type,options=EXCLUDED.options,required=EXCLUDED.required,order_index=EXCLUDED.order_index;
INSERT INTO survey_responses(id,survey_id,anonymous_token_hash,submitted_at,status) VALUES
 ('a9000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001',encode(digest('demo-anon-1','sha256'),'hex'),now()-interval '3 days','submitted'),
 ('a9000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-000000000001',encode(digest('demo-anon-2','sha256'),'hex'),now()-interval '2 days','submitted')
ON CONFLICT(id) DO UPDATE SET submitted_at=EXCLUDED.submitted_at,status='submitted';
INSERT INTO survey_answers(response_id,question_id,answer_text,numeric_value) VALUES
 ('a9000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','4',4),
 ('a9000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002','Más tiempo para compartir avances.',NULL),
 ('a9000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000001','5',5),
 ('a9000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000002','Mantener las reuniones breves.',NULL)
ON CONFLICT(response_id,question_id) DO UPDATE SET answer_text=EXCLUDED.answer_text,numeric_value=EXCLUDED.numeric_value;

-- Mismas tareas en la tabla relacional y el almacén que consume People Analytics.
WITH demo_tasks(id,user_id,title,status,completed,due_date,priority,created_at) AS (VALUES
 ('demo-t01','a4000000-0000-4000-8000-000000000003'::uuid,'Prototipo de flujo de bienvenida','completed',true,CURRENT_DATE-8,'high',now()-interval '18 days'),
 ('demo-t02','a4000000-0000-4000-8000-000000000003'::uuid,'Revisar hallazgos de entrevistas','completed',true,CURRENT_DATE-5,'medium',now()-interval '14 days'),
 ('demo-t03','a4000000-0000-4000-8000-000000000003'::uuid,'Preparar prueba de accesibilidad','pending',false,CURRENT_DATE-2,'high',now()-interval '10 days'),
 ('demo-t04','a4000000-0000-4000-8000-000000000004'::uuid,'Actualizar componentes del sistema','completed',true,CURRENT_DATE-3,'medium',now()-interval '12 days'),
 ('demo-t05','a4000000-0000-4000-8000-000000000004'::uuid,'Documentar decisiones de diseño','pending',false,CURRENT_DATE-1,'low',now()-interval '7 days'),
 ('demo-t06','a4000000-0000-4000-8000-000000000004'::uuid,'Validar prototipo con usuarios','completed',true,CURRENT_DATE+5,'high',now()-interval '3 days'),
 ('demo-t07','a4000000-0000-4000-8000-000000000005'::uuid,'Mapear proceso de soporte','completed',true,CURRENT_DATE-10,'medium',now()-interval '20 days'),
 ('demo-t08','a4000000-0000-4000-8000-000000000005'::uuid,'Revisar tiempos de respuesta','completed',true,CURRENT_DATE-4,'high',now()-interval '12 days'),
 ('demo-t09','a4000000-0000-4000-8000-000000000005'::uuid,'Proponer mejora de proceso','pending',false,CURRENT_DATE+4,'medium',now()-interval '4 days'),
 ('demo-t10','a4000000-0000-4000-8000-000000000006'::uuid,'Actualizar tablero semanal','completed',true,CURRENT_DATE-6,'medium',now()-interval '16 days'),
 ('demo-t11','a4000000-0000-4000-8000-000000000006'::uuid,'Documentar procedimiento','completed',true,CURRENT_DATE+2,'low',now()-interval '5 days'),
 ('demo-t12','a4000000-0000-4000-8000-000000000002'::uuid,'Publicar calendario de desarrollo','completed',true,CURRENT_DATE-2,'medium',now()-interval '6 days')
)
INSERT INTO tasks(id,user_id,title,status,completed,due_date,priority,created_at,updated_at)
SELECT id,user_id,title,status,completed,due_date,priority,created_at,now() FROM demo_tasks
ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,title=EXCLUDED.title,status=EXCLUDED.status,completed=EXCLUDED.completed,due_date=EXCLUDED.due_date,priority=EXCLUDED.priority,updated_at=now();

WITH demo_tasks(id,user_id,title,status,completed,due_date,priority,created_at) AS (VALUES
 ('demo-t01','a4000000-0000-4000-8000-000000000003'::uuid,'Prototipo de flujo de bienvenida','completed',true,CURRENT_DATE-8,'high',now()-interval '18 days'),
 ('demo-t02','a4000000-0000-4000-8000-000000000003'::uuid,'Revisar hallazgos de entrevistas','completed',true,CURRENT_DATE-5,'medium',now()-interval '14 days'),
 ('demo-t03','a4000000-0000-4000-8000-000000000003'::uuid,'Preparar prueba de accesibilidad','pending',false,CURRENT_DATE-2,'high',now()-interval '10 days'),
 ('demo-t04','a4000000-0000-4000-8000-000000000004'::uuid,'Actualizar componentes del sistema','completed',true,CURRENT_DATE-3,'medium',now()-interval '12 days'),
 ('demo-t05','a4000000-0000-4000-8000-000000000004'::uuid,'Documentar decisiones de diseño','pending',false,CURRENT_DATE-1,'low',now()-interval '7 days'),
 ('demo-t06','a4000000-0000-4000-8000-000000000004'::uuid,'Validar prototipo con usuarios','completed',true,CURRENT_DATE+5,'high',now()-interval '3 days'),
 ('demo-t07','a4000000-0000-4000-8000-000000000005'::uuid,'Mapear proceso de soporte','completed',true,CURRENT_DATE-10,'medium',now()-interval '20 days'),
 ('demo-t08','a4000000-0000-4000-8000-000000000005'::uuid,'Revisar tiempos de respuesta','completed',true,CURRENT_DATE-4,'high',now()-interval '12 days'),
 ('demo-t09','a4000000-0000-4000-8000-000000000005'::uuid,'Proponer mejora de proceso','pending',false,CURRENT_DATE+4,'medium',now()-interval '4 days'),
 ('demo-t10','a4000000-0000-4000-8000-000000000006'::uuid,'Actualizar tablero semanal','completed',true,CURRENT_DATE-6,'medium',now()-interval '16 days'),
 ('demo-t11','a4000000-0000-4000-8000-000000000006'::uuid,'Documentar procedimiento','completed',true,CURRENT_DATE+2,'low',now()-interval '5 days'),
 ('demo-t12','a4000000-0000-4000-8000-000000000002'::uuid,'Publicar calendario de desarrollo','completed',true,CURRENT_DATE-2,'medium',now()-interval '6 days')
)
INSERT INTO app_records(user_id,store_name,record_id,data,created_at,updated_at)
SELECT user_id,'tasks',id,jsonb_build_object('id',id,'title',title,'status',status,'completed',completed,'dueDate',due_date,'priority',priority,'createdAt',created_at,'assignedTo',user_id,'assignedBy','a4000000-0000-4000-8000-000000000001','assignedByName','Alex Demo','managedTask',true),created_at,now() FROM demo_tasks
ON CONFLICT(user_id,store_name,record_id) DO UPDATE SET data=EXCLUDED.data,updated_at=now();

INSERT INTO employee_task_assignments(task_id,organization_id,employee_id,assigned_by,created_at)
SELECT ar.record_id,'a1000000-0000-4000-8000-000000000001',ar.user_id,'a4000000-0000-4000-8000-000000000001',ar.created_at
FROM app_records ar WHERE ar.store_name='tasks' AND ar.record_id LIKE 'demo-t%'
ON CONFLICT(task_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,employee_id=EXCLUDED.employee_id,assigned_by=EXCLUDED.assigned_by;

COMMIT;
