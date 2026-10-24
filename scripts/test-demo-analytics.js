// Pruebas locales del escenario ficticio de database/DEMO_FOCUSIA_SEED.sql.
// No requiere Neon: comprueba las fórmulas y expectativas documentadas del fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const seed = fs.readFileSync(path.join(__dirname, '..', 'database', 'DEMO_FOCUSIA_SEED.sql'), 'utf8');
const tasks = [
  ['completed', false], ['completed', false], ['pending', true],
  ['completed', false], ['pending', true], ['completed', false],
  ['completed', false], ['completed', false], ['pending', false],
  ['completed', false], ['completed', false], ['completed', false]
];
const completed = tasks.filter(([status]) => status === 'completed').length;
const overdue = tasks.filter(([status, isOverdue]) => status !== 'completed' && isOverdue).length;
const assessed = [
  { current: 4, required: 4 }, { current: 3, required: 4 },
  { current: 3, required: 3 }, { current: 2, required: 4 },
  { current: 2, required: 3 }, { current: 3, required: 4 },
  { current: 4, required: 4 }
];
const gaps = assessed.filter(x => x.current < x.required).length;
const rate = total => total ? Math.round(completed / total * 100) : null;

assert.equal(tasks.length, 12);
assert.equal(completed, 9);
assert.equal(rate(tasks.length), 75);
assert.equal(overdue, 2);
assert.equal(gaps, 4);
assert.equal(assessed.length, 7);
assert.equal(rate(0), null, 'un denominador vacío no debe convertirse en 0 %');
assert.match(seed, /admin@focusia-demo\.test/);
assert.match(seed, /FocusIA-Demo-2026!/);
assert.match(seed, /INSERT INTO app_records\(user_id,store_name,record_id,data,created_at,updated_at\)/);
assert.match(seed, /INSERT INTO training_enrollments/);
assert.match(seed, /INSERT INTO survey_responses/);
console.log('Demo People Analytics: OK (12 tareas, 9 completadas, 75 %, 2 vencidas, 4 brechas de 7 evaluaciones y denominador vacío).');
