/* FocusAI Ecosystem modules
 * Client-side MVP for meetings, surveys, employee directory, skills and admin.
 * Production note: authorization and persistent multi-user data must be enforced server-side.
 */
(() => {
  'use strict';
  const STORE = 'focusai.ecosystem.v1';
  const ROLE_LABELS = { admin: 'Administrador', hr: 'RR. HH.', employee: 'Empleado' };
  let current = { employees: [], meetings: [], surveys: [], skills: [], role: 'employee' };
  let loaded = false;
  let saveQueue = Promise.resolve();
  const read = () => current;
  const write = (data) => {
    current = data;
    // Cola serializada: evita que dos guardados simultáneos terminen sobrescribiéndose fuera de orden.
    const snapshot = JSON.parse(JSON.stringify(data));
    saveQueue = saveQueue.then(async () => {
      const r = await fetch('/api/enterprise/state', {method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
      const b = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(b.error || 'No se pudo guardar en Neon');
    }).catch(err => { console.error('[FocusAI] Error guardando datos empresariales:',err); toast('No se guardaron los cambios en Neon: '+err.message); });
    return saveQueue;
  };
  const state = () => {
    const s = current;
    s.employees ||= []; s.meetings ||= []; s.surveys ||= []; s.skills ||= [];
    s.role = window.FlowState?.get('user.role') || s.role || 'employee';
    return s;
  };
  async function loadRemoteState(){
    try { const r=await fetch('/api/enterprise/state',{credentials:'same-origin'}); if(r.status===401){loaded=true;return;} if(!r.ok) throw new Error('No se pudo cargar el módulo empresarial'); const d=await r.json(); current={employees:[],meetings:[],surveys:[],skills:[],...d}; }
    catch(err){console.error('[FocusAI] Error cargando módulo empresarial:',err);}
    loaded=true; renderCurrent();
  }
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id = () => crypto.randomUUID();
  const el = (q) => document.querySelector(q);
  const toast = (msg) => {
    if (window.FlowApp?.toast) FlowApp.toast(msg, 'success');
    else alert(msg);
  };
  const role = () => window.FlowState?.get('user.role') || state().role || 'employee';
  const canPeople = () => ['admin','hr'].includes(role());
  const guardAdmin = () => {
    if (role() === 'admin') return true;
    toast('Esta sección requiere el rol de administrador.');
    setTimeout(() => FlowRouter.navigate('dashboard'), 0); return false;
  };
  const guardPeople = () => {
    if (canPeople()) return true;
    toast('Esta sección está disponible para RR. HH. y administradores.');
    setTimeout(() => FlowRouter.navigate('dashboard'), 0); return false;
  };
  const routes = [
    ['meetings','views/meetings.html','Reuniones y llamadas',null],
    ['my-surveys','views/my-surveys.html','Mis encuestas',null],
    ['join-organization','views/join-organization.html','Unirse a organización',null],
    ['surveys','views/surveys.html','Encuestas de RR. HH.',guardPeople],
    ['employees','views/employees.html','Directorio de empleados',guardPeople],
    ['skills','views/skills.html','Competencias y crecimiento',guardPeople],
    ['admin','views/admin.html','Usuarios y permisos',guardAdmin]
  ];
  routes.forEach(([path,view,title,guard]) => FlowRouter.register(path,{view,title,icon:'',guards:guard?[guard]:[],cache:false}));

  let activeCall = null;
  let jitsiApi = null;
  let pendingCallId = null;
  let currentMeetingResults = null;
  async function apiMeeting(url, options={}) {
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const b=await r.json().catch(()=>({})); if(!r.ok)throw new Error(b.error||`Error HTTP ${r.status}`); return b;
  }
  async function renderMeetings() {
    if (!el('#meetings-page')) return;
    const list=el('#meeting-history');
    try {
      const meetings=await apiMeeting('/api/meetings'); state().meetings=meetings;
      el('#meeting-count').textContent=meetings.length;
      el('#meeting-actions').textContent=meetings.reduce((n,m)=>n+(Array.isArray(m.actions)?m.actions.length:(m.actions?.actions||[]).length),0);
      if (!meetings.length) { list.className='eco-empty'; list.textContent='Todavía no hay reuniones guardadas.'; return; }
      list.className='eco-list';
      list.innerHTML=meetings.map(m=>`<article class="eco-list-item"><div><b>${esc(m.title)}</b><p>${esc(m.date?new Date(m.date).toLocaleString():'')} · ${esc(m.status||'')} · ${esc(m.creatorName||'')}</p>${m.summary?`<p class="eco-summary-text">${esc(m.summary)}</p>`:''}${m.actions?.length?`<ul>${m.actions.map(a=>`<li>${esc(typeof a==='string'?a:(a.task||JSON.stringify(a)))}${a.owner?` — ${esc(a.owner)}`:''}${a.dueDate?` · ${esc(a.dueDate)}`:''}</li>`).join('')}</ul>`:''}${m.transcript?`<details><summary>Ver transcripción</summary><p>${esc(m.transcript).replace(/\n/g,'<br>')}</p></details>`:''}</div><div class="meeting-list-actions">${m.roomName?`<button class="eco-btn eco-btn-small" data-rejoin-meeting="${esc(m.id)}" data-room-name="${esc(m.roomName)}" data-room-title="${esc(m.title)}">Abrir sala</button>`:''}<button class="eco-btn eco-btn-small" data-select-meeting="${esc(m.id)}">Procesar resumen</button><button class="eco-btn eco-btn-small" data-delete-meeting="${esc(m.id)}">Eliminar</button></div></article>`).join('');
    } catch(err) { list.className='eco-empty'; list.textContent=err.message; }
  }
  function showMeetingResult(m) {
    const box=el('#meeting-summary-output'); if(!box)return;
    const actions=Array.isArray(m.actions)?m.actions:[];
    box.hidden=false;
    box.innerHTML=`<h3>Resumen de la reunión</h3><p>${esc(m.summary||'No se pudo generar el resumen.')}</p><h4>Decisiones y acciones</h4>${actions.length?`<ul>${actions.map(a=>`<li>${esc(typeof a==='string'?a:(a.task||''))}${a.owner?` — ${esc(a.owner)}`:''}${a.dueDate?` · ${esc(a.dueDate)}`:''}</li>`).join('')}</ul>`:'<p>No se detectaron acciones concretas. Revisa el resumen antes de compartirlo.</p>'}<p class="eco-note">Generado con IA local. Comprueba nombres, decisiones y fechas antes de distribuirlo.</p>`;
    currentMeetingResults=m;
  }
  function loadJitsiScript() {
    return new Promise((resolve,reject)=>{
      if(window.JitsiMeetExternalAPI)return resolve();
      const existing=document.querySelector('script[data-jitsi-external]');
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
      const script=document.createElement('script');script.src='https://meet.jit.si/external_api.js';script.async=true;script.dataset.jitsiExternal='true';script.onload=resolve;script.onerror=()=>reject(new Error('No se pudo cargar Jitsi. Comprueba tu conexión a Internet.'));document.head.appendChild(script);
    });
  }
  async function launchJitsi(meeting) {
    await loadJitsiScript();
    if(jitsiApi){try{jitsiApi.dispose()}catch{}jitsiApi=null;}
    const container=el('#jitsi-embedded');container.replaceChildren();
    el('#jitsi-call-container').hidden=false;el('#active-call-title').textContent=meeting.title;
    jitsiApi=new window.JitsiMeetExternalAPI('meet.jit.si',{roomName:meeting.roomName,width:'100%',height:520,parentNode:container,lang:'es',configOverwrite:{prejoinPageEnabled:true,enableWelcomePage:false,disableDeepLinking:true},interfaceConfigOverwrite:{APP_NAME:'FocusAI',SHOW_JITSI_WATERMARK:true,SHOW_BRAND_WATERMARK:false,SHOW_POWERED_BY:false}});
    jitsiApi.addEventListener('videoConferenceJoined',()=>{const st=el('#call-status');if(st)st.textContent='Conectado a la sala. Comparte el nombre/enlace de la sala con los participantes.';});
    jitsiApi.addEventListener('readyToClose',()=>{if(el('#call-status'))el('#call-status').textContent='La sala se cerró. Sube una grabación autorizada o pega la transcripción para generar el resumen.';});
  }
  async function startMeeting() {
    const title=el('#meeting-title')?.value.trim();if(!title){toast('Escribe un nombre para la reunión.');return;}
    if(!el('#meeting-consent')?.checked){toast('Confirma que informarás a los participantes si la reunión se procesa con IA.');return;}
    const btn=el('#start-call-btn');btn.disabled=true;
    try {const meeting=await apiMeeting('/api/meetings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,participants:el('#meeting-participants')?.value.trim()||''})});activeCall=meeting;pendingCallId=meeting.id;await launchJitsi(meeting);await renderMeetings();}
    catch(err){toast('No se pudo iniciar la reunión: '+err.message);}finally{btn.disabled=false;}
  }
  async function finishMeeting() {
    if(!activeCall)return;
    const call=activeCall;activeCall=null;
    try{jitsiApi?.executeCommand('hangup');}catch{}
    try{jitsiApi?.dispose();}catch{}jitsiApi=null;
    el('#jitsi-call-container').hidden=true;
    try{await apiMeeting(`/api/meetings/${encodeURIComponent(call.id)}/finish`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});pendingCallId=call.id;toast('Llamada finalizada. Para generar el resumen, carga la grabación autorizada o pega la transcripción.');}
    catch(err){toast('La llamada terminó, pero no se pudo actualizar Neon: '+err.message);}
    await renderMeetings();
  }
  async function processMeetingContent() {
    const transcript=el('#meeting-transcript')?.value.trim();const file=el('#meeting-recording')?.files?.[0];
    const meetingId=pendingCallId||activeCall?.id;
    if(!meetingId){toast('Primero inicia o selecciona una reunión del historial.');return;}
    if(!file&&!transcript){toast('Adjunta una grabación o pega una transcripción.');return;}
    const btn=el('#summarize-meeting-btn');btn.disabled=true;btn.textContent='Procesando…';
    try{
      let result;
      if(file){const fd=new FormData();fd.append('recording',file);result=await apiMeeting(`/api/meetings/${encodeURIComponent(meetingId)}/recording`,{method:'POST',body:fd});}
      else result=await apiMeeting(`/api/meetings/${encodeURIComponent(meetingId)}/transcript`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript})});
      showMeetingResult(result);el('#meeting-transcript').value='';el('#meeting-recording').value='';await renderMeetings();toast('Resumen generado y guardado en Neon.');
    }catch(err){const box=el('#meeting-summary-output');box.hidden=false;box.textContent='No se pudo procesar la reunión: '+err.message+' Revisa la instalación de Whisper y que Ollama esté iniciado con el modelo configurado.';}
    finally{btn.disabled=false;btn.textContent='Procesar y generar resumen';}
  }

  function buildSummary(text) {
    const lines = text.split(/[\n.!?]+/).map(x=>x.trim()).filter(Boolean);
    const keywords = /acord|decid|pendient|debe|debería|responsable|entregar|revisar|fecha|próximo|tarea|compromiso|hacer|preparar|implementar|validar/i;
    const actions = lines.filter(x=>keywords.test(x)).slice(0,8);
    const summary = lines.slice(0,5).join('. ') + (lines.length ? '.' : '');
    return {summary: summary || 'No se encontró contenido suficiente para resumir.', actions};
  }

  async function renderMySurveys() {
    const root=el('#my-surveys-page'); if(!root)return;
    const list=el('#my-surveys-list'); if(!list)return;
    list.className='eco-empty'; list.textContent='Cargando encuestas…';
    try {
      const r=await fetch('/api/my-surveys',{credentials:'same-origin',cache:'no-store'});const surveys=await r.json();if(!r.ok)throw new Error(surveys.error||'No se pudieron cargar las encuestas.');
      if(!surveys.length){list.className='eco-empty';list.textContent='No hay encuestas disponibles en tu organización.';return;}
      list.className='eco-list';list.innerHTML=surveys.map(s=>`<article class="eco-list-item"><div><span class="eco-mini-tag">${esc(s.category||'General')}</span><b>${esc(s.title)}</b><p>${s.anonymous?'Respuesta anónima':'Respuesta identificada'} · ${s.questions.length} pregunta(s)</p>${s.alreadyResponded?'<p class="eco-note">Ya respondiste esta encuesta.</p>':`<form class="eco-form my-survey-form" data-survey-id="${esc(s.id)}">${s.questions.map((q,i)=>{const opts=Array.isArray(q.options)?q.options:[];const label=`${i+1}. ${q.text}${q.required?' *':''}`;if(q.type==='textarea')return `<label for="answer-${esc(s.id)}-${i}">${esc(label)}</label><textarea id="answer-${esc(s.id)}-${i}" data-answer-index="${i}" rows="3" ${q.required?'required':''} placeholder="Escribe tu respuesta…"></textarea>`;if(q.type==='single_choice'||q.type==='yes_no'||q.type==='rating') {const choices=q.type==='yes_no'?['Sí','No']:q.type==='rating'?['1','2','3','4','5']:opts;return `<label for="answer-${esc(s.id)}-${i}">${esc(label)}</label><select id="answer-${esc(s.id)}-${i}" data-answer-index="${i}" ${q.required?'required':''}><option value="">Selecciona…</option>${choices.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;}if(q.type==='multiple_choice')return `<label for="answer-${esc(s.id)}-${i}">${esc(label)} (puedes elegir varias)</label><select id="answer-${esc(s.id)}-${i}" data-answer-index="${i}" multiple ${q.required?'required':''}>${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;const type=q.type==='number'?'number':q.type==='date'?'date':'text';return `<label for="answer-${esc(s.id)}-${i}">${esc(label)}</label><input id="answer-${esc(s.id)}-${i}" data-answer-index="${i}" type="${type}" ${q.required?'required':''} placeholder="Escribe tu respuesta…">`;}).join('')}<button class="eco-btn eco-btn-primary" type="submit">Enviar respuestas</button></form>`}</div></article>`).join('');
    } catch(err){list.className='eco-empty';list.textContent=err.message;}
  }

  function renderSurveys() {
    if (!el('#surveys-page')) return;
    const s=state();
    el('#survey-count').textContent=s.surveys.length;
    el('#survey-responses').textContent=s.surveys.reduce((n,x)=>n+(x.responses||[]).length,0);
    const list=el('#survey-list');
    if (!s.surveys.length) {list.className='eco-empty';list.textContent='Aún no has creado encuestas.';return;}
    list.className='eco-list';
    list.innerHTML=s.surveys.slice().reverse().map(x=>`<article class="eco-list-item"><div><span class="eco-mini-tag">${esc(x.category)}</span><b>${esc(x.title)}</b><p>${x.questions.length} preguntas · ${x.anonymous?'Anónima':'No anónima'} · ${(x.responses||[]).length} respuestas</p><details><summary>Ver preguntas y resultados</summary><ol>${x.questions.map(q=>`<li>${esc(typeof q==='string'?q:q.text)}${typeof q==='object'&&q.type?' · '+esc(q.type):''}</li>`).join('')}</ol>${(x.responses||[]).length?`<p>${x.responses.length} respuesta(s) almacenadas en Neon.</p><ul>${x.responses.map((r,ri)=>`<li><b>Respuesta ${ri+1}${r.anonymous?' · anónima':r.respondentName?' · '+esc(r.respondentName):''}</b><ol>${(r.answers||[]).map(a=>`<li>${esc(a)}</li>`).join('')}</ol></li>`).join('')}</ul>`:'<p>Aún no hay respuestas.</p>'}</details></div><div class="eco-actions"><button class="eco-btn eco-btn-small" data-delete-survey="${esc(x.id)}">Eliminar</button></div></article>`).join('');
  }
  function answerSurvey(surveyId) {
    const s=state(), survey=s.surveys.find(x=>x.id===surveyId); if(!survey)return;
    const answers=[];
    for (const q of survey.questions) {
      const a=prompt(q); if(a===null)return; answers.push(a);
    }
    survey.responses ||= []; survey.responses.push({date:new Date().toISOString(),answers,anonymous:survey.anonymous});
    write(s); renderSurveys(); toast('Respuesta guardada en Neon.');
  }
  function showEmployeeForm(existing) {
    const e=existing||{};
    const content=`<form id="employee-edit-form" class="eco-form"><label>Nombre completo</label><input name="name" required value="${esc(e.name||'')}" placeholder="Nombre del empleado"><label>Correo</label><input name="email" type="email" required value="${esc(e.email||'')}" placeholder="nombre@empresa.com"><label>Puesto</label><input name="job" required value="${esc(e.job||'')}" placeholder="Puesto"><label>Departamento</label><input name="department" required value="${esc(e.department||'')}" placeholder="Departamento"><label>Rol de acceso</label><select name="role">${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}" ${e.role===k?'selected':''}>${v}</option>`).join('')}</select><label>Estado</label><select name="status"><option ${!e.status||e.status==='Activo'?'selected':''}>Activo</option><option ${e.status==='Inactivo'?'selected':''}>Inactivo</option></select><div class="eco-actions"><button class="eco-btn eco-btn-primary" type="submit">Guardar perfil</button></div></form>`;
    if(window.showGlobalModal) {
      showGlobalModal({title:e.id?'Editar empleado':'Añadir empleado',content,size:'md'});
      const form=el('#global-dialog #employee-edit-form');
      form?.addEventListener('submit',ev=>{ev.preventDefault();const d=Object.fromEntries(new FormData(form));const s=state();if(e.id){Object.assign(s.employees.find(x=>x.id===e.id),d);}else{s.employees.push({id:id(),...d,demo:false});}write(s);closeGlobalModal();renderEmployees();renderAdmin();toast('Perfil guardado.');});
    } else {
      const name=prompt('Nombre completo',e.name||''); if(!name)return;
      const s=state(); s.employees.push({id:id(),name,email:'',job:'',department:'General',role:'employee',status:'Activo'});write(s);renderEmployees();
    }
  }
  function renderEmployees() {
    if(!el('#employees-page'))return;
    const s=state(), term=(el('#employee-search')?.value||'').toLowerCase();
    const people=s.employees.filter(e=>[e.name,e.job,e.department,e.email].some(v=>String(v||'').toLowerCase().includes(term)));
    el('#employee-count').textContent=s.employees.length;
    el('#department-count').textContent=new Set(s.employees.map(e=>e.department).filter(Boolean)).size;
    el('#development-count').textContent=s.skills.length?new Set(s.skills.map(x=>x.employeeId)).size:0;
    el('#employee-table').innerHTML=people.map(e=>`<tr><td><div class="eco-person"><span class="eco-avatar">${esc(e.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span><span><b>${esc(e.name)}</b><small>${esc(e.email||'Sin correo')}</small></span></div></td><td>${esc(e.job||'Sin puesto')}</td><td>${esc(e.department||'Sin departamento')}</td><td><span class="eco-status ${e.status==='Activo'?'is-active':'is-inactive'}">${esc(e.status||'Activo')}</span></td><td><div class="eco-actions"><button class="eco-btn eco-btn-small" data-edit-employee="${esc(e.id)}">Editar</button><button class="eco-btn eco-btn-small" data-remove-employee="${esc(e.id)}">${e.status==='Inactivo'?'Activar':'Desactivar'}</button></div></td></tr>`).join('');
    el('#employee-empty').hidden=people.length>0;
  }
  function showSkillForm() {
    const s=state();
    if(!s.employees.length){toast('Primero añade un empleado.');return;}
    const content=`<form id="skill-edit-form" class="eco-form"><label>Empleado</label><select name="employeeId">${s.employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select><label>Competencia</label><input name="name" required placeholder="Ej. Comunicación, SQL, liderazgo"><label>Nivel actual (1–5)</label><select name="current"><option value="1">1 · Inicial</option><option value="2">2 · Básico</option><option value="3" selected>3 · Autónomo</option><option value="4">4 · Avanzado</option><option value="5">5 · Referente</option></select><label>Nivel requerido para el puesto (1–5)</label><select name="required"><option value="1">1 · Inicial</option><option value="2">2 · Básico</option><option value="3">3 · Autónomo</option><option value="4" selected>4 · Avanzado</option><option value="5">5 · Referente</option></select><label>Próxima revisión</label><input name="review" type="date"><button class="eco-btn eco-btn-primary" type="submit">Guardar competencia</button></form>`;
    showGlobalModal({title:'Registrar competencia',content});
    el('#global-dialog #skill-edit-form')?.addEventListener('submit',ev=>{ev.preventDefault();const d=Object.fromEntries(new FormData(ev.currentTarget));s.skills.push({id:id(),...d,current:Number(d.current),required:Number(d.required)});write(s);closeGlobalModal();renderSkills();renderEmployees();toast('Competencia registrada.');});
  }
  function renderSkills() {
    if(!el('#skills-page'))return;
    const s=state(), term=(el('#skill-search')?.value||'').toLowerCase();
    const rows=s.skills.filter(x=>{const e=s.employees.find(y=>y.id===x.employeeId);return (x.name+' '+(e?.name||'')).toLowerCase().includes(term);});
    el('#skill-count').textContent=s.skills.length;
    el('#skill-gaps').textContent=s.skills.filter(x=>x.current<x.required).length;
    el('#skill-learning').textContent=s.skills.filter(x=>x.current<=2).length;
    el('#skills-table').innerHTML=rows.map(x=>{const e=s.employees.find(y=>y.id===x.employeeId);const gap=x.required-x.current;return `<tr><td>${esc(e?.name||'Perfil eliminado')}</td><td><b>${esc(x.name)}</b></td><td><span class="eco-level">${x.current}/5</span></td><td><span class="eco-level">${x.required}/5</span></td><td><span class="eco-status ${gap>0?'is-inactive':'is-active'}">${gap>0?'−'+gap:'Al día'}</span></td><td>${esc(x.review||'Sin fecha')}</td><td><button class="eco-btn eco-btn-small" data-skill-history="${esc(e?.id||'')}">Historial</button></td></tr>`;}).join('');
    el('#skills-empty').hidden=rows.length>0;
  }
  function renderAdmin() {
    if(!el('#admin-page'))return;
    const s=state();
    el('#admin-user-count').textContent=s.employees.length;
    el('#admin-admin-count').textContent=s.employees.filter(e=>e.role==='admin'&&e.status!=='Inactivo').length;
    el('#admin-user-table').innerHTML=s.employees.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.email||'—')}</td><td><select class="eco-role-select" data-role-user="${esc(e.id)}">${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}" ${e.role===k?'selected':''}>${v}</option>`).join('')}</select></td><td><span class="eco-status ${e.status==='Activo'?'is-active':'is-inactive'}">${esc(e.status||'Activo')}</span></td><td><div class="eco-actions"><button class="eco-btn eco-btn-small" data-edit-employee="${esc(e.id)}">Editar</button><button class="eco-btn eco-btn-small" data-toggle-employee="${esc(e.id)}">${e.status==='Inactivo'?'Activar':'Desactivar'}</button></div></td></tr>`).join('');
  }
  async function renderOrganizationJoin(){
    const form=el('#join-organization-form');if(!form||form.dataset.bound)return;form.dataset.bound='1';
    form.addEventListener('submit',async ev=>{ev.preventDefault();const code=String(new FormData(form).get('inviteCode')||'').trim().toUpperCase();const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
      try{const r=await fetch('/api/organization/join',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteCode:code})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'No se pudo unir a la organización.');toast(b.message||'Te has unido a la organización.');window.location.reload();}
      catch(err){toast(err.message);if(button)button.disabled=false;}
    });
  }
  async function loadOrganizationInvite(){
    if(!el('#admin-page')||!el('#organization-invite-code'))return;
    try{const r=await fetch('/api/organization',{credentials:'same-origin',cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.error||'No se pudo cargar el código');el('#organization-invite-code').textContent=b.invite_code||'No disponible';}
    catch(err){el('#organization-invite-code').textContent=err.message;}
  }

  function renderCurrent() {
    renderMeetings(); renderSurveys(); renderEmployees(); renderSkills(); renderAdmin(); renderMySurveys(); renderOrganizationJoin(); if(el('#admin-page'))loadOrganizationInvite();
    const current=FlowRouter.getCurrentPath();
    document.querySelectorAll('.nav-section-label').forEach(x=>x.style.display='');
    if(current==='meetings'&&el('#meetings-page')) renderMeetings();
    if(current==='my-surveys') renderMySurveys();
  }
  document.addEventListener('submit',async ev=>{
    if(ev.target.matches('.my-survey-form')) {
      ev.preventDefault();const form=ev.target;const answers=[...form.querySelectorAll('[data-answer-index]')].sort((a,b)=>Number(a.dataset.answerIndex)-Number(b.dataset.answerIndex)).map(x=>x instanceof HTMLSelectElement&&x.multiple?[...x.selectedOptions].map(o=>o.value).join(', '):x.value.trim());const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
      try{const r=await fetch(`/api/my-surveys/${encodeURIComponent(form.dataset.surveyId)}/responses`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'No se pudo enviar la respuesta.');toast(b.message||'Respuesta enviada.');await renderMySurveys();}
      catch(err){toast(err.message);if(button)button.disabled=false;}
    }
    if(ev.target.id==='survey-form') {
      ev.preventDefault(); const title=el('#survey-title').value.trim(), lines=el('#survey-questions').value.split('\n').map(x=>x.trim()).filter(Boolean);
      const allowedTypes=new Set(['text','textarea','single_choice','multiple_choice','rating','yes_no','number','date']);
      const questions=lines.map(line=>{const parts=line.split('|').map(x=>x.trim());let type=(parts[1]||'text').toLowerCase();const aliases={'texto':'text','párrafo':'textarea','parrafo':'textarea','opción única':'single_choice','opcion unica':'single_choice','opción múltiple':'multiple_choice','opcion multiple':'multiple_choice','calificación':'rating','calificacion':'rating','sí/no':'yes_no','si/no':'yes_no','fecha':'date','número':'number','numero':'number'};type=aliases[type]||type;if(!allowedTypes.has(type))type='text';return {text:parts[0],type,options:['single_choice','multiple_choice'].includes(type)?(parts[2]||'').split(';').map(x=>x.trim()).filter(Boolean):[],required:true};});
      if(!title||!questions.length){toast('Añade un título y al menos una pregunta.');return;}
      if(questions.some(q=>['single_choice','multiple_choice'].includes(q.type)&&!q.options.length)){toast('Las preguntas de opción única o múltiple necesitan opciones separadas por punto y coma.');return;}
      const s=state();s.surveys.push({id:id(),title,category:el('#survey-category').value,questions,anonymous:el('#survey-anonymous').checked,responses:[],createdAt:new Date().toISOString()});write(s);ev.target.reset();renderSurveys();toast('Encuesta publicada en Neon.');
    }
  });
  document.addEventListener('click',ev=>{
    const t=ev.target.closest('button'); if(!t)return;
    if(t.dataset.skillHistory){fetch(`/api/enterprise/skills/${encodeURIComponent(t.dataset.skillHistory)}/history`,{credentials:'same-origin',cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'No se pudo cargar el historial.');const content=b.length?`<ol>${b.map(x=>`<li><b>${esc(x.skill)}</b>: ${x.previous_level==null?'Sin nivel previo':x.previous_level+'/5'} → <b>${x.assessed_level}/5</b> · ${esc(x.assessment_date)}${x.assessed_by?' · '+esc(x.assessed_by):''}</li>`).join('')}</ol>`:'<p>Aún no hay evaluaciones históricas para este empleado.</p>';showGlobalModal({title:'Historial de competencias',content,size:'md'});}).catch(err=>toast(err.message));}
    if(t.id==='copy-organization-code'){const code=el('#organization-invite-code')?.textContent||'';if(code&&code!=='Cargando código…')navigator.clipboard?.writeText(code).then(()=>toast('Código copiado.')).catch(()=>toast('No se pudo copiar automáticamente.'));}
    if(t.id==='start-call-btn')startMeeting();
    if(t.id==='stop-call-btn')finishMeeting();
    if(t.id==='summarize-meeting-btn')processMeetingContent();
    if(t.id==='refresh-meetings-btn')renderMeetings();
    if(t.id==='copy-call-link-btn'&&activeCall){const link='https://meet.jit.si/'+activeCall.roomName;navigator.clipboard?.writeText(link).then(()=>toast('Enlace de la sala copiado.')).catch(()=>prompt('Copia este enlace para invitar a participantes:',link));}
    if(t.dataset.rejoinMeeting){const meeting=state().meetings.find(m=>m.id===t.dataset.rejoinMeeting);if(meeting){activeCall=meeting;pendingCallId=meeting.id;launchJitsi(meeting).catch(err=>toast(err.message));}}
    if(t.dataset.selectMeeting){pendingCallId=t.dataset.selectMeeting;el('#meeting-transcript')?.focus();toast('Reunión seleccionada. Adjunta su grabación o pega la transcripción.');}
    if(t.id==='new-survey-btn') { el('#survey-title')?.focus(); el('#survey-title')?.scrollIntoView({behavior:'smooth',block:'center'}); }
    if(t.id==='new-employee-btn'||t.id==='admin-add-user-btn')showEmployeeForm();
    if(t.id==='new-skill-btn')showSkillForm();
    if(t.dataset.editEmployee) {const e=state().employees.find(x=>x.id===t.dataset.editEmployee);if(e)showEmployeeForm(e);}
    if(t.dataset.removeEmployee) {const s=state(),e=s.employees.find(x=>x.id===t.dataset.removeEmployee);if(!e)return;const next=e.status==='Inactivo'?'Activo':'Inactivo';if(!confirm(`${next==='Inactivo'?'¿Desactivar':'¿Reactivar'} este perfil? Se conservarán la cuenta y el historial.`))return;e.status=next;write(s);renderEmployees();renderAdmin();renderSkills();}
    if(t.dataset.toggleEmployee) {const s=state(),e=s.employees.find(x=>x.id===t.dataset.toggleEmployee);if(e){e.status=e.status==='Inactivo'?'Activo':'Inactivo';write(s);renderAdmin();renderEmployees();}}
    if(t.dataset.deleteMeeting) {if(!confirm('¿Eliminar esta reunión y su transcripción/resumen?'))return;apiMeeting(`/api/meetings/${encodeURIComponent(t.dataset.deleteMeeting)}`,{method:'DELETE'}).then(renderMeetings).catch(err=>toast(err.message));}
    if(t.dataset.deleteSurvey) {const s=state();s.surveys=s.surveys.filter(x=>x.id!==t.dataset.deleteSurvey);write(s);renderSurveys();}
    if(t.dataset.answerSurvey)answerSurvey(t.dataset.answerSurvey);
  });
  document.addEventListener('change',ev=>{
    if(ev.target.matches('[data-role-user]')) {const s=state(),e=s.employees.find(x=>x.id===ev.target.dataset.roleUser);if(e){e.role=ev.target.value;write(s);renderAdmin();toast('Rol actualizado en la organización.');}}
  });
  document.addEventListener('input',ev=>{
    if(ev.target.id==='employee-search')renderEmployees();
    if(ev.target.id==='skill-search')renderSkills();
  });
  window.addEventListener('flowrouter:navigate',()=>{if(activeCall)finishMeeting();renderCurrent();});
  document.addEventListener('DOMContentLoaded',()=>{ loadRemoteState(); });
  window.addEventListener('focusai:authenticated',()=>loadRemoteState());
})();
