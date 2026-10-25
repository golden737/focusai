/* FocusAI Ecosystem modules
 * Client-side MVP for meetings, surveys, employee directory, skills and admin.
 * Production note: authorization and persistent multi-user data must be enforced server-side.
 */
(() => {
  'use strict';
  const STORE = 'focusai.ecosystem.v1';
  const ROLE_LABELS = { superadmin: 'Superadministrador', admin: 'Administrador', hr: 'RR. HH.', employee: 'Empleado' };
  let current = { employees: [], meetings: [], surveys: [], skills: [], role: 'employee' };
  let developmentData = { courses: [], enrollments: [], interviews: [] };
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
  const canPeople = () => ['superadmin','admin','hr'].includes(role());
  const guardAdmin = () => {
    if (role()==='superadmin') return true;
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
    ['my-development','views/my-development.html','Mi desarrollo',null],
    ['join-organization','views/join-organization.html','Unirse a organización',null],
    ['surveys','views/surveys.html','Encuestas de RR. HH.',guardPeople],
    ['employees','views/employees.html','Directorio de empleados',guardPeople],
    ['skills','views/skills.html','Competencias y crecimiento',guardPeople],
    ['admin','views/admin.html','Administración global',guardAdmin]
  ];
  routes.forEach(([path,view,title,guard]) => FlowRouter.register(path,{view,title,icon:'',guards:guard?[guard]:[],cache:false}));

  let activeCall = null;
  let jitsiApi = null;
  let pendingCallId = null;
  let currentMeetingResults = null;
  let meetingDirectory = [];
  const selectedInvitees = new Set();
  let callStatusPoll = null;
  let surveyQuestionCounter = 0;
  let surveyAudiencePeople = [];
  const selectedSurveyPeople = new Set();
  let selectedEmployeeId = null;
  let selectedEmployeeProfile = null;
  async function apiMeeting(url, options={}) {
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const b=await r.json().catch(()=>({})); if(!r.ok)throw new Error(b.error||`Error HTTP ${r.status}`); return b;
  }
  async function loadMeetingDirectory(){
    if(!el('#meeting-people-list'))return;
    try{meetingDirectory=await apiMeeting('/api/meeting-directory');renderMeetingDirectory();}
    catch(err){el('#meeting-people-list').innerHTML=`<p class="eco-note">No se pudo cargar el directorio: ${esc(err.message)}</p>`;}
  }
  function renderMeetingDirectory(){
    const box=el('#meeting-people-list');if(!box)return;
    const term=(el('#meeting-people-search')?.value||'').trim().toLowerCase();
    const people=meetingDirectory.filter(p=>`${p.name||''} ${p.email||''} ${p.role||''}`.toLowerCase().includes(term));
    box.innerHTML=people.length?people.map(p=>`<label class="meeting-person-option"><input type="checkbox" data-meeting-person="${esc(p.id)}" ${selectedInvitees.has(p.id)?'checked':''}><span><b>${esc(p.name||'Sin nombre')}</b><small>${esc(p.email||'Sin correo')} · ${esc(({admin:'Administrador',hr:'RR. HH.',employee:'Empleado'})[p.role]||'Empleado')}</small></span></label>`).join(''):'<p class="eco-note">No se encontraron personas con esa búsqueda.</p>';
    const count=el('#meeting-invite-count');if(count)count.textContent=selectedInvitees.size?`${selectedInvitees.size} persona(s) seleccionada(s).`:'No hay personas seleccionadas.';
  }
  async function renderInvitations(){
    const box=el('#meeting-invitations');if(!box)return;
    try{const rows=await apiMeeting('/api/meetings/invitations');if(!rows.length){box.className='eco-empty';box.textContent='No tienes invitaciones pendientes ni anteriores.';return;}box.className='eco-list';box.innerHTML=rows.map(m=>`<article class="eco-list-item"><div><b>${esc(m.title)}</b><p>${esc(m.creatorName||'Un compañero')} · ${esc(m.date?new Date(m.date).toLocaleString():'')} · ${esc(({pending:'Pendiente',accepted:'Aceptada',declined:'Rechazada'})[m.invitationStatus]||m.invitationStatus)}</p></div><div class="meeting-list-actions">${m.status!=='in_progress'?`<span class="eco-status is-inactive">Terminada</span>`:m.invitationStatus==='pending'?`<button class="eco-btn eco-btn-primary eco-btn-small" data-accept-invitation="${esc(m.id)}">Aceptar invitación</button><button class="eco-btn eco-btn-small" data-decline-invitation="${esc(m.id)}">Rechazar</button>`:m.invitationStatus==='accepted'?`<button class="eco-btn eco-btn-primary eco-btn-small" data-join-invitation="${esc(m.id)}" data-room-name="${esc(m.roomName)}" data-room-title="${esc(m.title)}">Unirse a llamada</button>`:''}</div></article>`).join('');}
    catch(err){box.className='eco-empty';box.textContent=err.message;}
  }
  async function renderMeetings() {
    if (!el('#meetings-page')) return;
    const list=el('#meeting-history');
    try {
      const meetings=await apiMeeting('/api/meetings'); state().meetings=meetings; await renderInvitations();
      el('#meeting-count').textContent=meetings.length;
      el('#meeting-actions').textContent=meetings.reduce((n,m)=>n+(Array.isArray(m.actions)?m.actions.length:(m.actions?.actions||[]).length),0);
      if (!meetings.length) { list.className='eco-empty'; list.textContent='Todavía no hay reuniones guardadas.'; return; }
      list.className='eco-list';
      const showAll=el('#meeting-history-show-all')?.dataset.showAll==='true';
      const visibleMeetings=showAll?meetings:meetings.slice(0,5);
      list.innerHTML=visibleMeetings.map(m=>`<article class="eco-list-item"><div><b>${esc(m.title)}</b><p>${esc(m.date?new Date(m.date).toLocaleString():'')} · ${esc(m.status||'')} · ${esc(m.creatorName||'')}</p>${m.summary?`<p class="eco-summary-text">${esc(m.summary)}</p>`:''}${m.actions?.length?`<ul>${m.actions.map(a=>`<li>${esc(typeof a==='string'?a:(a.task||JSON.stringify(a)))}${a.owner?` — ${esc(a.owner)}`:''}${a.dueDate?` · ${esc(a.dueDate)}`:''}</li>`).join('')}</ul>`:''}${m.transcript?`<details><summary>Ver transcripción</summary><p>${esc(m.transcript).replace(/\n/g,'<br>')}</p></details>`:''}</div><div class="meeting-list-actions">${m.status==='in_progress'&&m.createdBy===FlowState.get('user.id')?`<button class="eco-btn eco-btn-small" data-rejoin-meeting="${esc(m.id)}" data-room-name="${esc(m.roomName)}" data-room-title="${esc(m.title)}">Abrir sala</button>`:''}${m.status!=='in_progress'?`<span class="eco-status is-inactive">Reunión terminada</span>`:''}<button class="eco-btn eco-btn-small" data-select-meeting="${esc(m.id)}">Procesar resumen</button>${m.createdBy===FlowState.get('user.id')?`<button class="eco-btn eco-btn-small" data-delete-meeting="${esc(m.id)}">Eliminar</button>`:''}</div></article>`).join('');
      let historyToggle=el('#meeting-history-show-all');
      if(!historyToggle){historyToggle=document.createElement('button');historyToggle.id='meeting-history-show-all';historyToggle.className='eco-btn';historyToggle.type='button';list.parentElement.appendChild(historyToggle);}
      historyToggle.hidden=meetings.length<=5;historyToggle.dataset.showAll=String(showAll);historyToggle.textContent=showAll?'Mostrar solo las últimas 5':'Ver todo el historial ('+meetings.length+')';
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
  function launchJitsiPopup(meeting, isCreator=false, popup=null) {
    const win = popup || window.open('about:blank', 'focusai-call-'+String(meeting.id).replace(/[^a-zA-Z0-9_-]/g,''));
    if (!win) { toast('El navegador bloqueó la ventana de la llamada. Permite ventanas emergentes para FocusAI.'); return; }
    activeCall=meeting; pendingCallId=meeting.id;
    const params=new URLSearchParams({meetingId:String(meeting.id),room:String(meeting.roomName||''),title:String(meeting.title||'Llamada FocusAI'),host:isCreator?'1':'0'});
    win.location.href='/call.html?'+params.toString();
    try{win.focus()}catch{}
  }
  async function startMeeting() {
    const title=el('#meeting-title')?.value.trim();if(!title){toast('Escribe un nombre para la reunión.');return;}
    if(!el('#meeting-consent')?.checked){toast('Confirma que informarás a los participantes si la reunión se procesa con IA.');return;}
    const btn=el('#start-call-btn');btn.disabled=true;const callPopup=window.open('about:blank','focusai-call-new');if(callPopup){callPopup.document.write('<!doctype html><title>FocusAI · Llamada</title><body style="font:16px system-ui;background:#080d18;color:white;padding:24px">Preparando la sala…</body>');callPopup.document.close();}
    try {const meeting=await apiMeeting('/api/meetings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,invitedUserIds:[...selectedInvitees]})});activeCall=meeting;pendingCallId=meeting.id;selectedInvitees.clear();renderMeetingDirectory();launchJitsiPopup(meeting,true,callPopup);await renderMeetings();}
    catch(err){try{callPopup?.close()}catch{}toast('No se pudo iniciar la reunión: '+err.message);}finally{btn.disabled=false;}
  }
  function closeCallWindow(message='Llamada cerrada.', reloadAfterClose=false) {
    activeCall=null;if(callStatusPoll){clearInterval(callStatusPoll);callStatusPoll=null;}
    const api=jitsiApi;jitsiApi=null;try{api?.dispose();}catch{}
    const box=el('#jitsi-call-container');if(box)box.hidden=true;document.body.classList.remove('focusai-call-open');
    const st=el('#call-status');if(st)st.textContent=message;renderMeetings();
    if(reloadAfterClose)window.setTimeout(()=>window.location.reload(),350);
  }
  async function finishMeeting(options={}) {
    if(!activeCall)return;const call=activeCall;
    try{await apiMeeting(`/api/meetings/${encodeURIComponent(call.id)}/finish`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});pendingCallId=call.id;
      // No volver a ejecutar hangup cuando Jitsi ya está cerrándose: evita su pantalla externa de post-llamada.
      closeCallWindow('Llamada finalizada. Puedes cargar una grabación autorizada o pegar la transcripción para generar el resumen.');toast('Llamada finalizada para todos los participantes.');}
    catch(err){toast('No se pudo finalizar la llamada en Neon: '+err.message);}
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

  function addSurveyQuestion(){
    const root=el('#survey-question-builder');if(!root)return;const n=++surveyQuestionCounter;const card=document.createElement('article');card.className='survey-question-card eco-card';card.innerHTML=`<div class="survey-q-top"><b>Pregunta ${n}</b><button type="button" class="eco-btn eco-btn-small" data-remove-survey-question>Quitar</button></div><label>Pregunta o interrogante</label><input data-question-text required placeholder="Escribe la pregunta…"><label>Tipo de respuesta</label><select data-question-type><option value="text">Respuesta corta</option><option value="textarea">Párrafo</option><option value="single_choice">Opción múltiple (una respuesta)</option><option value="multiple_choice">Casillas (varias respuestas)</option><option value="yes_no">Sí / No</option><option value="rating">Escala de 1 a 5</option><option value="number">Número</option><option value="date">Fecha</option></select><div class="survey-options-field" hidden><label>Opciones de respuesta</label><p class="eco-note">Escribe una opción por línea. Los encuestados verán estas opciones.</p><textarea data-question-options rows="3" placeholder="Opción 1&#10;Opción 2&#10;Opción 3"></textarea><button type="button" class="eco-btn eco-btn-small" data-add-survey-option>＋ Añadir opción</button></div><label class="eco-check"><input type="checkbox" data-question-required checked> Respuesta obligatoria</label>`;root.appendChild(card);}
  async function loadSurveyAudiencePeople(){try{surveyAudiencePeople=await apiMeeting('/api/meeting-directory');renderSurveyAudiencePeople();}catch{const box=el('#survey-people-results');if(box)box.innerHTML='<p class="eco-note">No se pudo cargar el directorio de personas.</p>';}}
  function renderSurveyAudiencePeople(){
    const box=el('#survey-people-results'),selected=el('#survey-selected-people');if(!box||!selected)return;
    const term=(el('#survey-people-search')?.value||'').trim().toLowerCase();
    const matches=surveyAudiencePeople.filter(p=>`${p.name||''} ${p.email||''} ${p.role||''}`.toLowerCase().includes(term));const shown=matches.slice(0,5);
    box.innerHTML=term?(shown.length?shown.map(p=>`<label class="survey-person-result"><input type="checkbox" data-survey-person="${esc(p.id)}" ${selectedSurveyPeople.has(p.id)?'checked':''}><span><b>${esc(p.name||'Sin nombre')}</b><small>${esc(p.email||'Sin correo')} · ${esc(ROLE_LABELS[p.role]||p.role||'Empleado')}</small></span></label>`).join(''):'<p class="eco-note">No se encontraron personas.</p>'):'<p class="eco-note">Escribe parte de un nombre para buscar. Se muestran hasta 5 resultados.</p>';
    selected.innerHTML=selectedSurveyPeople.size?`<b>Personas seleccionadas (${selectedSurveyPeople.size})</b><div class="survey-selected-chips">${[...selectedSurveyPeople].map(pid=>{const p=surveyAudiencePeople.find(x=>x.id===pid);return p?`<span class="survey-person-chip">${esc(p.name||p.email)} <button type="button" data-remove-survey-person="${esc(pid)}" aria-label="Quitar persona">×</button></span>`:''}).join('')}</div>`:'';
  }
  function openSurveyModal(){const modal=el('#survey-modal');if(!modal)return; if(modal.parentElement!==document.body)document.body.appendChild(modal); modal.hidden=false;document.body.classList.add('survey-modal-open');if(!el('.survey-question-card')){surveyQuestionCounter=0;addSurveyQuestion();}loadSurveyAudiencePeople();setTimeout(()=>{el('#survey-modal .survey-modal')?.scrollTo({top:0,behavior:'instant'});el('#survey-title')?.focus();},40);}
  function closeSurveyModal(){const modal=el('#survey-modal');if(modal)modal.hidden=true;document.body.classList.remove('survey-modal-open');}
  function exportSurveyExcel(surveyId){
    if(!['admin','hr','superadmin'].includes(role())){toast('Solo RR. HH. y administradores pueden exportar respuestas.');return;}
    const survey=state().surveys.find(x=>String(x.id)===String(surveyId));if(!survey){toast('No se encontró la encuesta.');return;}
    const questions=(survey.questions||[]).map(q=>typeof q==='string'?q:q.text||'Pregunta');
    const rows=[['Encuesta',survey.title||''],['Categoría',survey.category||'General'],['Fecha de respuesta','Identidad',...questions]];
    (survey.responses||[]).forEach(r=>rows.push([r.date?new Date(r.date).toLocaleString('es-SV'):'', (survey.anonymous||r.anonymous)?'Anónima':(r.respondentName||'Identidad no disponible'),...(r.answers||[])]));
    const cell=v=>`<td style="border:1px solid #b7c3d0;padding:6px;mso-number-format:'\\@'">${esc(v).replace(/\r?\n/g,'<br>')}</td>`;
    const table=`<table><thead>${rows.slice(0,3).map(row=>`<tr>${row.map(v=>`<th style="border:1px solid #8294a8;background:#e7edf5;padding:6px">${esc(v)}</th>`).join('')}</tr>`).join('')}</thead><tbody>${rows.slice(3).map(row=>`<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
    const blob=new Blob(['\ufeff<html><head><meta charset="utf-8"></head><body>'+table+'</body></html>'],{type:'application/vnd.ms-excel;charset=utf-8;'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`FocusAI_Encuesta_${String(survey.title||'resultados').replace(/[^a-z0-9_-]+/gi,'_')}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Archivo de Excel descargado.');
  }
  function renderSurveys() {
    if (!el('#surveys-page')) return;
    const s=state();
    el('#survey-count').textContent=s.surveys.length;
    el('#survey-responses').textContent=s.surveys.reduce((n,x)=>n+(x.responses||[]).length,0);
    const list=el('#survey-list');
    if (!s.surveys.length) {list.className='eco-empty';list.textContent='Aún no has creado encuestas.';return;}
    list.className='eco-list';
    list.innerHTML=s.surveys.slice().reverse().map(x=>`<article class="eco-list-item"><div><span class="eco-mini-tag">${esc(x.category)}</span><b>${esc(x.title)}</b><p>${(x.questions||[]).length} preguntas · ${x.anonymous?'Anónima':'No anónima'} · ${(x.responses||[]).length} respuestas</p><details><summary>Ver preguntas y resultados</summary><ol>${(x.questions||[]).map(q=>`<li>${esc(typeof q==='string'?q:q.text)}${typeof q==='object'&&q.type?' · '+esc(q.type):''}</li>`).join('')}</ol>${(x.responses||[]).length?`<p>${x.responses.length} respuesta(s) almacenadas en Neon.</p><ul>${x.responses.map((r,ri)=>`<li><b>Respuesta ${ri+1}${(x.anonymous||r.anonymous)?' · anónima':r.respondentName?' · '+esc(r.respondentName):' · Identidad no disponible'}</b><ol>${(r.answers||[]).map(a=>`<li>${esc(a)}</li>`).join('')}</ol></li>`).join('')}</ul>`:'<p>Aún no hay respuestas.</p>'}</details></div><div class="eco-actions"><button class="eco-btn eco-btn-small" data-export-survey="${esc(x.id)}">Descargar Excel</button><button class="eco-btn eco-btn-small" data-delete-survey="${esc(x.id)}">Eliminar</button></div></article>`).join('');
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
    const content=`<form id="employee-edit-form" class="eco-form"><label>Nombre completo</label><input name="name" required value="${esc(e.name||'')}" placeholder="Nombre del empleado"><label>Correo</label><input name="email" type="email" required value="${esc(e.email||'')}" placeholder="nombre@empresa.com" ${role()==='admin'&&e.id?'readonly':''}><label>Puesto</label><input name="job" required value="${esc(e.job||'')}" placeholder="Puesto"><label>Departamento</label><input name="department" required value="${esc(e.department||'')}" placeholder="Departamento"><label>Rol de acceso</label><input value="${esc(ROLE_LABELS[e.role||(role()==='admin'?'employee':'employee')]||'Empleado')}" disabled><small>Los roles y cuentas solo los administra el superadministrador.</small><label>Estado</label><select name="status"><option ${!e.status||e.status==='Activo'?'selected':''}>Activo</option><option ${e.status==='Inactivo'?'selected':''}>Inactivo</option></select><div class="eco-actions"><button class="eco-btn eco-btn-primary" type="submit">Guardar perfil</button></div></form>`;
    if(window.showGlobalModal) {
      showGlobalModal({title:e.id?'Editar empleado':'Añadir empleado',content,size:'md'});
      const form=el('#global-dialog #employee-edit-form');
      form?.addEventListener('submit',async ev=>{ev.preventDefault();const d=Object.fromEntries(new FormData(form));if(!e.id){try{await apiMeeting('/api/enterprise/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeGlobalModal();await loadRemoteState();toast('Perfil creado. La persona puede activar su cuenta con ese correo.');}catch(err){toast(err.message);}return;}const s=state();Object.assign(s.employees.find(x=>x.id===e.id),d);await write(s);closeGlobalModal();renderEmployees();renderAdmin();toast('Perfil guardado.');});
    } else {
      const name=prompt('Nombre completo',e.name||''); if(!name)return;
      const s=state(); s.employees.push({id:id(),name,email:'',job:'',department:'General',role:'employee',status:'Activo'});write(s);renderEmployees();
    }
  }
  async function renderMyDevelopment(){if(!el('#my-development-page'))return;const box=el('#my-development-content');try{const d=await apiMeeting('/api/my-development'),training=d.training||[],skills=d.skills||[];box.innerHTML=`<section class="talent-overview"><article><small>Capacitaciones asignadas</small><b>${training.length}</b><span>${training.filter(x=>x.status==='completed').length} completadas</span></article><article><small>Avance formativo</small><b>${training.length?Math.round(training.reduce((n,x)=>n+(Number(x.progress)||0),0)/training.length):0}%</b><span>Promedio de cursos asignados</span></article><article><small>Competencias evaluadas</small><b>${skills.length}</b><span>${skills.filter(x=>x.required_level&&x.current_level<x.required_level).length} oportunidades de crecimiento</span></article></section><article class="eco-card"><div class="card-heading"><div><span class="talent-kicker">TU PLAN DE APRENDIZAJE</span><h2>Capacitaciones asignadas</h2><p>Actualiza el progreso o confirma cuando hayas completado una capacitación.</p></div></div><div class="talent-course-list">${training.length?training.map(t=>`<article class="talent-my-course"><div class="talent-course-symbol">↗</div><div class="talent-course-info"><b>${esc(t.title)}</b><small>${esc(t.provider||'Equipo')} · ${esc(t.format||'En línea')}${t.duration_hours?` · ${t.duration_hours} h`:''}</small><p>${esc(t.description||'')}</p><div class="talent-level-track"><i style="width:${Math.max(0,Math.min(100,Number(t.progress)||0))}%"></i></div><div class="talent-chip-row">${(t.skills||[]).map(x=>`<span>${esc(x.name)}</span>`).join('')}</div></div><form class="my-training-form" data-enrollment-id="${esc(t.id)}"><label>Estado<select name="status"><option value="enrolled" ${t.status==='enrolled'?'selected':''}>Asignada</option><option value="in_progress" ${t.status==='in_progress'?'selected':''}>En curso</option><option value="completed" ${t.status==='completed'?'selected':''}>Completada</option></select></label><label>Avance ${Number(t.progress)||0}%<input name="progress" type="range" min="0" max="100" step="5" value="${Number(t.progress)||0}" oninput="this.form.querySelector('[data-progress-label]').textContent=this.value+'%'"> <small data-progress-label>${Number(t.progress)||0}%</small></label><button class="eco-btn eco-btn-primary eco-btn-small" type="submit">Guardar avance</button>${t.url?`<a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" class="eco-btn eco-btn-small">Abrir capacitación ↗</a>`:''}</form></article>`).join(''):'<div class="people-empty-inline">Aún no tienes capacitaciones asignadas. Cuando RR. HH. te asigne una, aparecerá aquí.</div>'}</div></article><article class="eco-card"><span class="talent-kicker">FORTALEZAS Y SIGUIENTE NIVEL</span><h2>Mis competencias</h2><div class="people-skills-list">${skills.length?skills.map(x=>`<article class="people-skill-row"><div class="people-skill-top"><b>${esc(x.name)}</b><span class="people-skill-level">${x.current_level}/5${x.required_level?` · objetivo ${x.required_level}/5`:''}</span></div><div class="people-level-track"><i style="width:${Math.min(100,Number(x.current_level)*20)}%"></i></div><small>${esc(x.evidence||'Sin evidencia registrada')}${x.next_review_date?` · Revisión ${dateLabel(x.next_review_date)}`:''}</small></article>`).join(''):'<div class="people-empty-inline">Todavía no hay competencias evaluadas.</div>'}</div></article>`;}catch(err){box.innerHTML=`<article class="eco-card"><h2>No se pudo cargar tu plan</h2><p>${esc(err.message)}</p><button class="eco-btn" type="button" id="retry-my-development">Intentar de nuevo</button></article>`;}}  async function renderHRMetrics(){
    if(!el('#employees-page'))return;
    try{const d=await apiMeeting('/api/enterprise/overview');el('#hr-completion-rate').textContent=d.completionRate==null?'—':`${d.completionRate}%`;el('#hr-completion-detail').textContent=d.tasks?`${d.completed} de ${d.tasks} tareas asignadas completadas`:'Aún no hay tareas asignadas por el equipo';el('#hr-overdue-count').textContent=d.overdue;el('#hr-skill-gaps').textContent=d.skillGaps==null?'—':d.skillGaps;el('#hr-skill-detail').textContent=d.assessedSkills?`de ${d.assessedSkills} requisitos evaluados`:'No hay evaluaciones contra requisitos de puesto';const updated=el('#hr-metrics-updated');if(updated)updated.textContent=`Datos de Neon · actualizado ${new Date(d.updatedAt).toLocaleString()}`;const count=el('#people-roster-count');if(count)count.textContent=`${d.employees} persona(s) activas en la organización`;window.__focusPeopleMetrics=Object.fromEntries((d.people||[]).map(p=>[p.id,p]));renderEmployees();}
    catch(err){const updated=el('#hr-metrics-updated');if(updated)updated.textContent=`No se pudieron cargar los indicadores: ${err.message}`;}
  }
  const initials=name=>String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  const dateLabel=value=>value?new Date(value).toLocaleDateString('es-SV',{year:'numeric',month:'short',day:'numeric'}):'Sin fecha';
  function renderEmployees(){
    if(!el('#employees-page'))return;
    const s=state(),term=(el('#employee-search')?.value||'').trim().toLowerCase(),department=el('#employee-department-filter')?.value||'';
    const depts=[...new Set(s.employees.map(e=>e.department).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')),filter=el('#employee-department-filter');
    if(filter){const current=filter.value;filter.innerHTML='<option value="">Todas las áreas</option>'+depts.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');filter.value=depts.includes(current)?current:'';}
    const people=s.employees.filter(e=>(!department||e.department===department)&&[e.name,e.job,e.department,e.email].some(v=>String(v||'').toLowerCase().includes(term)));
    el('#employee-count').textContent=s.employees.filter(e=>e.status!=='Inactivo').length;el('#department-count').textContent=`${depts.length} área(s) representadas`;
    el('#employee-table').innerHTML=people.map(e=>{const m=window.__focusPeopleMetrics?.[e.id]||{},pending=Math.max(0,(m.tasks||0)-(m.completed||0));return `<div role="listitem" class="people-person-row people-roster-entry ${selectedEmployeeId===e.id?'is-selected':''}"><button type="button" class="people-row-main" data-select-employee="${esc(e.id)}"><span class="people-avatar">${esc(initials(e.name))}</span><span class="people-row-content"><b>${esc(e.name||'Sin nombre')}</b><small>${esc(e.position||e.job||'Puesto pendiente')} · ${esc(e.department||'Sin área')}</small><span class="people-row-meta"><i class="${e.status==='Inactivo'?'is-inactive':''}"></i>${e.status==='Inactivo'?'Inactivo':pending?`${pending} compromiso(s) abierto(s)`:'Sin tareas asignadas abiertas'}</span></span><span class="people-row-chevron">›</span></button><button class="people-row-dashboard" type="button" data-open-employee-dashboard="${esc(e.id)}" aria-label="Abrir dashboard de ${esc(e.name)}" title="Dashboard individual">▦</button></div>`;}).join('');
    el('#employee-empty').hidden=people.length>0;if(!people.some(e=>e.id===selectedEmployeeId)){selectedEmployeeId=people[0]?.id||null;selectedEmployeeProfile=null;}
    if(selectedEmployeeId){if(selectedEmployeeProfile?.person?.id===selectedEmployeeId)renderEmployeeProfile(selectedEmployeeProfile);else loadEmployeeProfile(selectedEmployeeId);}else el('#employee-profile').innerHTML='<div class="people-profile-loading">No hay personas para mostrar. Ajusta los filtros o invita a alguien al equipo.</div>';
  }
  async function loadEmployeeProfile(employeeId){const box=el('#employee-profile');if(!box)return;box.innerHTML='<div class="people-profile-loading"><span class="people-loading-dot"></span> Cargando perfil y actividad…</div>';try{selectedEmployeeProfile=await apiMeeting(`/api/enterprise/employees/${encodeURIComponent(employeeId)}/profile`);if(selectedEmployeeId===employeeId)renderEmployeeProfile(selectedEmployeeProfile);}catch(err){box.innerHTML=`<div class="people-profile-error"><b>No se pudo cargar el perfil</b><p>${esc(err.message)}</p><button class="eco-btn" data-retry-employee="${esc(employeeId)}">Intentar de nuevo</button></div>`;}}
  function renderEmployeeProfile(d){
    const box=el('#employee-profile');if(!box||!d)return;const p=d.person,summary=d.summary||{},admin=['admin','superadmin'].includes(role());
    const taskRows=d.tasks.length?d.tasks.map(t=>{const done=t.completed===true||['completed','done'].includes(t.status),due=t.dueDate||t.due_date||t.deadline;return `<article class="people-task-row"><span class="people-task-check ${done?'is-done':''}">${done?'✓':'·'}</span><span class="people-task-copy"><b>${esc(t.title||'Tarea sin título')}</b><small>${esc(t.description||((t.managedTask||t.assignedBy)?'Asignada por la organización':'Creada por la persona'))}</small></span><span class="people-task-due ${!done&&due&&Date.parse(due)<Date.now()?'is-late':''}">${due?`Vence ${dateLabel(due)}`:'Sin fecha límite'}</span><span class="people-task-status ${done?'is-done':''}">${done?'Completada':esc((t.status||'Pendiente').replace('_',' '))}</span></article>`;}).join(''):'<div class="people-empty-inline"><b>Aún no hay tareas</b><span>Asigna un compromiso y aparecerá en la lista de tareas de esta persona.</span></div>';
    const skills=d.skills.length?d.skills.map(x=>{const gap=x.requiredLevel?x.requiredLevel-x.currentLevel:null;return `<article class="people-skill-row"><div class="people-skill-top"><b>${esc(x.name)}</b><span class="people-skill-level">${x.currentLevel}/5${x.requiredLevel?` · requerido ${x.requiredLevel}/5`:''}</span></div><div class="people-level-track"><i style="width:${Math.max(0,Math.min(100,x.currentLevel*20))}%"></i></div><small>${x.evidence?`Evidencia: ${esc(x.evidence)}`:'Sin evidencia documentada'}${x.assessed_at?` · ${dateLabel(x.assessed_at)}`:''}${x.assessor?` · ${esc(x.assessor)}`:''}</small>${gap>0?`<span class="people-gap-label">Brecha de ${gap} nivel(es)</span>`:''}</article>`;}).join(''):'<div class="people-empty-inline">Sin evaluaciones de competencias registradas.</div>';
    const training=d.training.length?d.training.map(x=>`<article class="people-training-row"><span class="people-training-mark">↗</span><span><b>${esc(x.title)}</b><small>${esc(x.format||'Formato pendiente')} · ${x.completed_at?`Finalizado ${dateLabel(x.completed_at)}`:`Inscrito ${dateLabel(x.enrolled_at)}`}</small></span><span class="people-training-progress">${Number(x.progress)||0}%</span></article>`).join(''):'<div class="people-empty-inline">Todavía no hay formaciones asignadas.</div>';
    const timeline=[...d.tasks.map(t=>({date:t.createdAt||t.created_at,label:`${t.managedTask||t.assignedBy?'Tarea asignada':'Tarea registrada'}: ${t.title}`,type:'task'})),...d.skills.filter(x=>x.assessed_at).map(x=>({date:x.assessed_at,label:`Evaluación de competencia: ${x.name}`,type:'skill'})),...d.training.filter(x=>x.completed_at).map(x=>({date:x.completed_at,label:`Formación completada: ${x.title}`,type:'training'}))].filter(x=>x.date).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
    box.innerHTML=`<header class="people-profile-head"><div class="people-person-hero"><span class="people-avatar people-avatar-large">${esc(initials(p.name))}</span><div><span class="people-role-label">${esc(ROLE_LABELS[p.role]||'Empleado')} · <i class="${p.employment_status==='active'?'is-active':'is-inactive'}"></i>${p.employment_status==='active'?'Activo':'Inactivo'}</span><h2>${esc(p.name||'Sin nombre')}</h2><p>${esc(p.position||'Puesto pendiente')} <span>·</span> ${esc(p.department||'Sin área asignada')}</p></div></div><div class="people-profile-actions"><button class="eco-btn eco-btn-primary eco-btn-small" type="button" data-open-employee-dashboard="${esc(p.id)}">▦ Dashboard individual</button>${admin?`<button class="eco-btn eco-btn-small" data-edit-employee="${esc(p.id)}">Editar perfil</button>`:''}<span class="people-employee-number">${esc(p.employee_number||'Perfil')}</span></div></header>
      <div class="people-contact-strip"><span>✉ ${esc(p.email||'Sin correo registrado')}</span><span>↗ Responsable: ${esc(p.manager||'Sin asignar')}</span><span>◷ Ingreso: ${dateLabel(p.hire_date)}</span></div>
      <section class="people-personal-kpis"><article><small>Tareas registradas</small><b>${summary.taskCount||0}</b></article><article><small>Completadas</small><b>${summary.completionRate==null?'—':`${summary.completionRate}%`}</b></article><article><small>Vencidas</small><b class="${summary.overdue?'people-danger':''}">${summary.overdue||0}</b></article><article><small>Competencias evaluadas</small><b>${d.skills.length}</b></article></section>
      <div class="people-profile-columns"><section class="people-section people-main-section"><div class="people-section-head"><div><span class="people-section-kicker">TRABAJO Y SEGUIMIENTO</span><h3>Compromisos</h3><p>Asignaciones del equipo y tareas registradas por la persona.</p></div><span class="people-section-count">${d.tasks.length}</span></div>
        ${admin||role()==='hr'?p.employment_status==='active'?`<form class="people-assign-form" id="employee-assign-task-form" data-employee-id="${esc(p.id)}"><div class="people-assign-title"><b>Asignar una tarea</b><small>Se guardará en la cuenta y tareas de ${esc((p.name||'la persona').split(' ')[0])}.</small></div><label class="sr-only" for="assigned-task-title">Nombre de la tarea</label><input id="assigned-task-title" name="title" required minlength="2" maxlength="180" placeholder="¿Qué necesita realizar?"><label class="sr-only" for="assigned-task-description">Contexto de la tarea</label><textarea id="assigned-task-description" name="description" rows="2" maxlength="2000" placeholder="Contexto, resultado esperado o recursos…"></textarea><div class="people-assign-controls"><label>Prioridad<select name="priority"><option value="medium">Normal</option><option value="high">Alta</option><option value="low">Baja</option></select></label><label>Fecha límite<input type="date" name="dueDate"></label><button class="eco-btn eco-btn-primary" type="submit">Asignar tarea</button></div></form>`:'<p class="people-empty-inline">Reactiva el perfil para asignar nuevas tareas.</p>':''}<div class="people-task-list">${taskRows}</div></section>
        <aside class="people-side-sections"><section class="people-section"><div class="people-section-head"><div><span class="people-section-kicker">DESARROLLO</span><h3>Competencias</h3></div><span class="people-section-count">${d.skills.length}</span></div><p class="people-section-intro">Nivel evaluado frente a lo esperado para el puesto.</p><div class="people-skills-list">${skills}</div></section><section class="people-section"><div class="people-section-head"><div><span class="people-section-kicker">APRENDIZAJE</span><h3>Formación</h3></div><span class="people-section-count">${d.training.length}</span></div><div class="people-training-list">${training}</div></section><section class="people-section"><div class="people-section-head"><div><span class="people-section-kicker">RECORRIDO RECIENTE</span><h3>Actividad</h3></div></div>${timeline.length?`<ol class="people-timeline">${timeline.map(x=>`<li><span class="people-timeline-dot is-${x.type}"></span><div><b>${esc(x.label)}</b><small>${dateLabel(x.date)}</small></div></li>`).join('')}</ol>`:'<div class="people-empty-inline">Aún no hay actividad para mostrar.</div>'}</section></aside></div>
      <section class="people-section people-profile-extra"><div class="people-section-head"><div><span class="people-section-kicker">VOZ DEL EQUIPO</span><h3>Participación en encuestas</h3></div></div><div class="people-extra-grid"><div><b>${Number(d.surveys?.responded)||0} / ${Number(d.surveys?.available)||0}</b><small>encuestas completadas</small><span>Solo se muestra participación, no respuestas privadas.</span></div></div></section>
      <p class="people-data-note">Las tareas y capacitaciones muestran actividad registrada en FocusIA; son señales de seguimiento, no una calificación automática del rendimiento.</p>`;
  }
  function showEmployeeDashboard(d){const p=d.person,s=d.summary||{},skills=d.skills||[],gaps=skills.filter(x=>x.requiredLevel&&x.currentLevel<x.requiredLevel),training=d.training||[],completedTraining=training.filter(x=>x.enrollment_status==='completed').length,survey=d.surveys||{available:0,responded:0};const content=`<div class="people-dashboard"><div class="people-dashboard-hero"><span class="people-avatar people-avatar-large">${esc(initials(p.name))}</span><div><span class="talent-kicker">RESUMEN INDIVIDUAL</span><h2>${esc(p.name)}</h2><p>${esc(p.position||'Puesto pendiente')} · ${esc(p.department||'Sin área')}</p></div></div><div class="people-dashboard-kpis"><article><small>Tareas completadas</small><b>${s.completed||0}/${s.taskCount||0}</b><span>${s.completionRate==null?'Sin datos':`${s.completionRate}% completadas`}</span></article><article><small>Seguimiento vencido</small><b>${s.overdue||0}</b><span>Compromisos asignados</span></article><article><small>Competencias</small><b>${skills.length}</b><span>${gaps.length} brecha(s) por trabajar</span></article><article><small>Capacitación</small><b>${completedTraining}/${training.length}</b><span>Completadas / asignadas</span></article><article><small>Encuestas</small><b>${Number(survey.responded)||0}/${Number(survey.available)||0}</b><span>Participación registrada</span></article></div><div class="people-dashboard-columns"><section><h3>Competencias a desarrollar</h3>${gaps.length?gaps.map(x=>`<p><b>${esc(x.name)}</b><span>Nivel ${x.currentLevel}/5 · objetivo ${x.requiredLevel}/5 · diferencia ${x.requiredLevel-x.currentLevel}</span></p>`).join(''):'<p>No se registran brechas en competencias evaluadas.</p>'}</section><section><h3>Formación asignada</h3>${training.length?training.slice(0,5).map(x=>`<p><b>${esc(x.title)}</b><span>${esc(({enrolled:'Asignada',in_progress:'En curso',completed:'Completada',cancelled:'Cancelada',failed:'No completada'})[x.enrollment_status]||x.enrollment_status)} · ${Number(x.progress)||0}%</span></p>`).join(''):'<p>Aún no hay formación asignada.</p>'}</section></div><p class="people-data-note">El panel reúne actividad registrada y participación. Las métricas no sustituyen una evaluación integral del desempeño.</p></div>`;showGlobalModal({title:'Dashboard individual',content,size:'lg'});}  function levelOptions(selected=3){return [1,2,3,4,5].map(n=>`<option value="${n}" ${Number(selected)===n?'selected':''}>${n} · ${['','Inicial','Básico','Autónomo','Avanzado','Referente'][n]}</option>`).join('');}
  async function refreshTalentState(){const r=await fetch('/api/enterprise/state',{credentials:'same-origin',cache:'no-store'});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'No se pudieron actualizar las competencias.');current={...current,...b};}
  function showSkillForm(){const people=state().employees.filter(e=>e.status!=='Inactivo');if(!people.length){toast('Primero añade una persona activa al equipo.');return;}const content=`<form id="skill-edit-form" class="eco-form"><label>Persona</label><select name="employeeId" required>${people.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} · ${esc(e.job||e.department||'Equipo')}</option>`).join('')}</select><label>Competencia</label><input name="name" required maxlength="160" placeholder="Ej. Comunicación, SQL, liderazgo"><label>Qué significa en este rol</label><textarea name="description" rows="2" maxlength="1000" placeholder="Conductas o conocimientos esperados…"></textarea><label>Familia</label><select name="category"><option value="Técnica">Técnica</option><option value="Colaboración">Colaboración</option><option value="Liderazgo">Liderazgo</option><option value="Comunicación">Comunicación</option><option value="Operativa">Operativa</option></select><div class="talent-form-row"><label>Nivel demostrado<select name="currentLevel">${levelOptions(3)}</select></label><label>Objetivo del puesto<select name="requiredLevel">${levelOptions(4)}</select></label></div><label>Evidencia observable <span class="eco-muted">(ejemplo, resultado o trabajo revisado)</span></label><textarea name="evidence" required rows="3" maxlength="2000" placeholder="¿Qué hizo la persona que demuestra este nivel?"></textarea><label>Método de evaluación</label><select name="method"><option value="HR review">Revisión de RR. HH.</option><option value="manager review">Evaluación de responsable</option><option value="work sample">Muestra de trabajo</option><option value="self assessment">Autoevaluación validada</option><option value="360 feedback">Retroalimentación 360°</option></select><label>Observaciones y siguiente paso</label><textarea name="notes" rows="2" maxlength="2000" placeholder="Fortaleza, apoyo requerido o acción de desarrollo…"></textarea><label>Próxima revisión</label><input name="review" type="date"><button class="eco-btn eco-btn-primary" type="submit">Guardar evaluación con evidencia</button></form>`;showGlobalModal({title:'Evaluar competencia',content,size:'md'});}
  async function renderSkills(){if(!el('#skills-page'))return;try{developmentData=await apiMeeting('/api/enterprise/development');}catch(err){developmentData={courses:[],enrollments:[],interviews:[]};toast(err.message);}const s=state(),term=(el('#skill-search')?.value||'').trim().toLowerCase(),rows=s.skills.filter(x=>{const e=s.employees.find(y=>y.id===x.employeeId);return (x.name+' '+(e?.name||'')).toLowerCase().includes(term);}),gaps=s.skills.filter(x=>x.current<x.required);el('#skill-count').textContent=s.skills.length;el('#skill-gaps').textContent=gaps.length;el('#training-active-count').textContent=developmentData.enrollments.filter(x=>x.status==='in_progress'||x.status==='enrolled').length;el('#interview-upcoming-count').textContent=developmentData.interviews.filter(x=>x.status==='scheduled'&&new Date(x.scheduled_at)>=new Date()).length;
    el('#skills-table').innerHTML=rows.map(x=>{const e=s.employees.find(y=>y.id===x.employeeId),gap=x.required-x.current;return `<tr><td><b>${esc(e?.name||'Perfil eliminado')}</b><small>${esc(e?.job||e?.department||'')}</small></td><td><b>${esc(x.name)}</b><small>${esc(x.category||'')}</small></td><td><span class="eco-level">${x.current}/5</span><small>${x.evidence?esc(x.evidence):'Sin evidencia'}</small></td><td><span class="eco-level">${x.required}/5</span></td><td><span class="eco-status ${gap>0?'is-inactive':'is-active'}">${gap>0?`${gap} nivel(es)`:'Al día'}</span></td><td>${esc(x.review||'Sin fecha')}</td><td><button class="eco-btn eco-btn-small" data-skill-history="${esc(e?.id||'')}">Ver historial</button></td></tr>`;}).join('');el('#skills-empty').hidden=rows.length>0;
    const recommendations=gaps.map(g=>{const matched=developmentData.courses.filter(c=>(c.skills||[]).some(sk=>sk.id===g.skillId));const employee=s.employees.find(e=>e.id===g.employeeId);return `<article class="talent-recommendation"><span class="talent-rec-icon">↗</span><div><b>${esc(g.name)} · ${esc(employee?.name||'')}</b><small>Nivel ${g.current}/5 · objetivo ${g.required}/5</small></div>${matched.length?`<button type="button" class="eco-btn eco-btn-small" data-talent-tab="training">${esc(matched[0].title)}</button>`:'<span class="talent-no-match">Sin curso vinculado</span>'}</article>`;}).slice(0,6);el('#talent-recommendations-list').innerHTML=recommendations.length?recommendations.join(''):'<div class="people-empty-inline">Sin brechas evaluadas. Al registrar evidencia, aparecerán oportunidades de desarrollo relacionadas.</div>';
    renderTrainingUI();renderInterviewsUI();
  }
  function renderTrainingUI(){const s=state(),courses=developmentData.courses||[],skillMap=new Map();s.skills.forEach(x=>{if(x.skillId)skillMap.set(x.skillId,x.name);});el('#training-skill-options').innerHTML=skillMap.size?[...skillMap].map(([skillId,name])=>`<label><input type="checkbox" name="skillIds" value="${esc(skillId)}"> ${esc(name)}</label>`).join(''):'<small>Primero registra competencias para vincularlas al catálogo.</small>';
    el('#training-catalog').innerHTML=courses.length?courses.map(c=>`<article class="talent-course-card"><div class="talent-course-symbol">↗</div><div class="talent-course-info"><b>${esc(c.title)}</b><small>${esc(c.provider||'Sin proveedor')} · ${esc(c.format||'En línea')}${c.duration_hours?` · ${c.duration_hours} h`:''}</small><p>${esc(c.description||'Sin descripción')}</p><div class="talent-chip-row">${(c.skills||[]).map(x=>`<span>${esc(x.name)}</span>`).join('')||'<span>Sin competencia vinculada</span>'}</div></div><button class="eco-btn eco-btn-small" type="button" data-assign-course="${esc(c.id)}">Asignar personas</button></article>`).join(''):'<div class="people-empty-inline">El catálogo está vacío. Crea una capacitación para comenzar.</div>';
    el('#training-enrollments').innerHTML=developmentData.enrollments.length?developmentData.enrollments.map(e=>`<article class="talent-enrollment"><div><b>${esc(e.employee_name)}</b><small>${esc(e.training_title)} · asignada ${dateLabel(e.enrolled_at)}</small></div><label>Estado<select data-enrollment-status="${esc(e.id)}"><option value="enrolled" ${e.status==='enrolled'?'selected':''}>Asignada</option><option value="in_progress" ${e.status==='in_progress'?'selected':''}>En curso</option><option value="completed" ${e.status==='completed'?'selected':''}>Completada</option><option value="failed" ${e.status==='failed'?'selected':''}>No completada</option><option value="cancelled" ${e.status==='cancelled'?'selected':''}>Cancelada</option></select></label><label>Avance (%)<input type="number" min="0" max="100" value="${Number(e.progress)||0}" data-enrollment-progress="${esc(e.id)}"></label><button type="button" class="eco-btn eco-btn-small" data-save-enrollment="${esc(e.id)}">Guardar avance</button></article>`).join(''):'<div class="people-empty-inline">Aún no hay personas inscritas. Asigna un curso desde el catálogo.</div>';
  }
  function renderInterviewsUI(){const rows=developmentData.interviews||[];el('#development-interviews').innerHTML=rows.length?rows.map(i=>`<article class="talent-interview-card"><div class="talent-interview-date"><b>${new Date(i.scheduled_at).toLocaleDateString('es-SV',{day:'2-digit',month:'short'})}</b><small>${new Date(i.scheduled_at).toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}</small></div><div class="talent-interview-copy"><span class="talent-interview-status is-${esc(i.status)}">${i.status==='scheduled'?'Pendiente':i.status==='completed'?'Realizada':'Cancelada'}</span><h3>${esc(i.candidate_name)}</h3><small>${esc(i.position_title)} · ${esc(({screening:'Filtro inicial',technical:'Técnica',culture:'Cultura',final:'Final'})[i.interview_type]||'Filtro inicial')} · con ${esc(i.interviewer||'RR. HH.')}</small><p>${esc(i.candidate_email||'Sin correo')} ${i.candidate_phone?`· ${esc(i.candidate_phone)}`:''}</p><p>${esc(i.agenda||'Sin agenda registrada')}</p>${i.decision?`<div class="talent-agreement"><b>Decisión</b><span>${esc(i.decision)}</span></div>`:''}</div><button type="button" class="eco-btn eco-btn-small" data-edit-interview="${esc(i.id)}">${i.status==='scheduled'?'Registrar resultado':'Ver / editar'}</button></article>`).join(''):'<article class="eco-card"><div class="people-empty-inline">Todavía no hay candidatos con entrevista. Agenda la primera conversación para abrir un proceso de selección.</div></article>';}  function showCourseAssignForm(courseId){const course=developmentData.courses.find(x=>x.id===courseId),people=state().employees.filter(e=>e.status!=='Inactivo');if(!course||!people.length){toast('No hay personas activas para asignar.');return;}const content=`<form id="training-assign-form" class="eco-form" data-course-id="${esc(courseId)}"><p>Selecciona quién recibirá <b>${esc(course.title)}</b>.</p><div class="talent-assign-people">${people.map(e=>`<label><input type="checkbox" name="employeeIds" value="${esc(e.id)}"> <span><b>${esc(e.name)}</b><small>${esc(e.job||e.department||'')}</small></span></label>`).join('')}</div><button class="eco-btn eco-btn-primary" type="submit">Asignar capacitación</button></form>`;showGlobalModal({title:'Asignar capacitación',content,size:'md'});}
  function showInterviewForm(){const content=`<form id="development-interview-form" class="eco-form"><div class="talent-form-row"><label>Nombre del candidato<input name="candidateName" required minlength="2" maxlength="180" placeholder="Nombre completo"></label><label>Puesto al que aplica<input name="positionTitle" required maxlength="180" placeholder="Ej. Analista de datos"></label></div><div class="talent-form-row"><label>Correo<input name="candidateEmail" type="email" maxlength="254" placeholder="candidato@correo.com"></label><label>Teléfono<input name="candidatePhone" type="tel" maxlength="60" placeholder="Contacto opcional"></label></div><div class="talent-form-row"><label>Fecha y hora<input name="scheduledAt" type="datetime-local" required></label><label>Etapa<select name="interviewType"><option value="screening">Filtro inicial</option><option value="technical">Entrevista técnica</option><option value="culture">Entrevista cultural</option><option value="final">Entrevista final</option></select></label></div><label>Agenda y preparación<textarea name="agenda" rows="3" maxlength="2000" placeholder="Temas, requisitos o preguntas a revisar…"></textarea></label><button class="eco-btn eco-btn-primary" type="submit">Agendar entrevista</button></form>`;showGlobalModal({title:'Agendar entrevista de candidato',content,size:'md'});}
  function showInterviewResultForm(interviewId){const i=developmentData.interviews.find(x=>x.id===interviewId);if(!i)return;const content=`<form id="development-interview-result-form" class="eco-form" data-interview-id="${esc(i.id)}"><p><b>${esc(i.candidate_name)}</b> · ${esc(i.position_title)} · ${dateLabel(i.scheduled_at)}</p><label>Estado</label><select name="status"><option value="scheduled" ${i.status==='scheduled'?'selected':''}>Pendiente</option><option value="completed" ${i.status==='completed'?'selected':''}>Realizada</option><option value="cancelled" ${i.status==='cancelled'?'selected':''}>Cancelada</option></select><label>Agenda</label><textarea name="agenda" rows="2">${esc(i.agenda||'')}</textarea><label>Notas de evaluación</label><textarea name="notes" rows="4" maxlength="5000" placeholder="Experiencia, evidencias y respuestas relevantes…">${esc(i.notes||'')}</textarea><label>Decisión o siguiente paso</label><textarea name="decision" rows="2" maxlength="1000" placeholder="Avanza a la siguiente etapa, en espera o no continúa…">${esc(i.decision||'')}</textarea><button class="eco-btn eco-btn-primary" type="submit">Guardar evaluación</button></form>`;showGlobalModal({title:'Evaluación del candidato',content,size:'md'});}
  let globalAdminData={organizations:[],users:[]};
  async function renderAdmin() {
    if(!el('#admin-page'))return;
    if(role()!=='superadmin'){el('#admin-page').innerHTML='<article class="eco-card"><h2>Acceso restringido</h2><p>Solo el superadministrador puede gestionar cuentas y organizaciones globalmente.</p></article>';return;}
    const orgBody=el('#global-org-table'), userBody=el('#global-user-table');
    if(orgBody)orgBody.innerHTML='<tr><td colspan="6">Cargando organizaciones…</td></tr>';
    try{
      globalAdminData=await apiMeeting('/api/superadmin/overview');
      const orgs=globalAdminData.organizations||[],users=globalAdminData.users||[];
      if(el('#global-org-count'))el('#global-org-count').textContent=orgs.length;
      if(el('#global-user-count'))el('#global-user-count').textContent=users.length;
      if(el('#global-admin-count'))el('#global-admin-count').textContent=users.filter(u=>u.role==='admin').length;
      if(el('#global-user-org'))el('#global-user-org').innerHTML='<option value="">Selecciona una organización</option>'+orgs.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
      if(orgBody)orgBody.innerHTML=orgs.length?orgs.map(o=>`<tr><td><b>${esc(o.name)}</b><small>${esc(o.slug||'')}</small></td><td>${o.user_count||0}</td><td>${o.admin_count||0}</td><td><code>${esc(o.invite_code||'—')}</code></td><td><span class="eco-status ${o.status==='inactive'?'is-inactive':'is-active'}">${o.status==='inactive'?'Inactiva':'Activa'}</span></td><td><div class="eco-actions"><button class="eco-btn eco-btn-small" data-copy-org-code="${esc(o.id)}">Copiar código</button><button class="eco-btn eco-btn-small" data-toggle-org="${esc(o.id)}" data-status="${o.status==='inactive'?'active':'inactive'}">${o.status==='inactive'?'Activar':'Desactivar'}</button><button class="eco-btn eco-btn-small" data-rename-org="${esc(o.id)}">Renombrar</button></div></td></tr>`).join(''):'<tr><td colspan="6">Todavía no hay organizaciones.</td></tr>';
      renderGlobalUsers();
    }catch(err){if(orgBody)orgBody.innerHTML=`<tr><td colspan="6">${esc(err.message)}</td></tr>`;if(userBody)userBody.innerHTML=`<tr><td colspan="6">${esc(err.message)}</td></tr>`;}
  }
  function renderGlobalUsers(){
    const body=el('#global-user-table');if(!body)return;
    const term=(el('#global-user-search')?.value||'').trim().toLowerCase();
    const users=(globalAdminData.users||[]).filter(u=>`${u.name||''} ${u.email||''} ${u.organization_name||''}`.toLowerCase().includes(term));
    body.innerHTML=users.length?users.map(u=>`<tr><td><b>${esc(u.name||'Sin nombre')}</b><small>${esc(u.id)}</small></td><td>${esc(u.email||'—')}</td><td>${esc(ROLE_LABELS[u.role]||u.role)}</td><td>${esc(u.organization_name||'Sin organización')}</td><td><span class="eco-status ${u.employment_status==='inactive'?'is-inactive':'is-active'}">${u.employment_status==='inactive'?'Inactivo':'Activo'}</span></td><td><div class="eco-actions"><button class="eco-btn eco-btn-small" data-edit-global-user="${esc(u.id)}">Editar cuenta</button></div></td></tr>`).join(''):'<tr><td colspan="6">No hay usuarios para esta búsqueda.</td></tr>';
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

  function applyRoleNavigation(){
    const r=role();
    // Los roles administrativos conservan los módulos generales de trabajo y comunicación.
    // Lo que se restringe por rol son las áreas sensibles, no el acceso a toda la aplicación.
    const access={
      superadmin:['dashboard','tasks','calendar','projects','teams','meetings','employees','surveys','my-surveys','skills','admin','timer','habits','goals','focus','personal','stats','gamification','settings'],
      admin:['dashboard','tasks','calendar','projects','teams','meetings','employees','surveys','my-surveys','skills','timer','habits','goals','focus','personal','stats','gamification','settings'],
      hr:['dashboard','tasks','calendar','projects','teams','meetings','employees','surveys','my-surveys','skills','timer','habits','goals','focus','personal','stats','gamification','settings'],
      employee:['dashboard','tasks','calendar','projects','teams','meetings','my-surveys','my-development','join-organization','timer','habits','goals','focus','personal','stats','gamification','settings']
    };
    const allowed=new Set(access[r]||access.employee);
    document.querySelectorAll('#sidebar .nav-item[data-view]').forEach(a=>{a.hidden=!allowed.has(a.dataset.view);});
    document.querySelectorAll('#sidebar .nav-section-label').forEach(label=>{let next=label.nextElementSibling,has=false;while(next&&!next.classList.contains('nav-section-label')){if(next.matches('.nav-item')&&!next.hidden)has=true;next=next.nextElementSibling;}label.hidden=!has;});
  }

  function renderCurrent() {
    renderMeetings(); loadMeetingDirectory(); renderInvitations(); renderSurveys(); renderHRMetrics(); renderSkills(); renderAdmin(); renderMySurveys(); renderMyDevelopment(); renderOrganizationJoin();
    const current=FlowRouter.getCurrentPath();
    document.querySelectorAll('.nav-section-label').forEach(x=>x.style.display='');
    applyRoleNavigation();
    if(current==='meetings'&&el('#meetings-page')) renderMeetings();
    if(current==='my-surveys') renderMySurveys();
  }
  document.addEventListener('submit',async ev=>{
    if(ev.target.matches('.my-training-form')){ev.preventDefault();const form=ev.target,data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type="submit"]');if(button)button.disabled=true;try{await apiMeeting(`/api/my-development/trainings/${encodeURIComponent(form.dataset.enrollmentId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});await renderMyDevelopment();toast('Tu avance quedó actualizado.');}catch(err){toast(err.message);if(button)button.disabled=false;}return;}
    if(ev.target.id==='skill-edit-form'){ev.preventDefault();const form=ev.target,button=form.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(form));if(button)button.disabled=true;try{const r=await fetch('/api/enterprise/competencies/evaluations',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'No se pudo guardar la evaluación.');closeGlobalModal();await refreshTalentState();await renderSkills();renderEmployees();if(selectedEmployeeId)loadEmployeeProfile(selectedEmployeeId);toast('Evaluación guardada con evidencia e historial.');}catch(err){toast(err.message);if(button)button.disabled=false;}return;}
    if(ev.target.id==='training-create-form'){ev.preventDefault();const form=ev.target,data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type="submit"]');data.skillIds=[...form.querySelectorAll('[name="skillIds"]:checked')].map(x=>x.value);if(button)button.disabled=true;try{await apiMeeting('/api/enterprise/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();await renderSkills();toast('Capacitación añadida al catálogo.');}catch(err){toast(err.message);if(button)button.disabled=false;}return;}
    if(ev.target.id==='training-assign-form'){ev.preventDefault();const form=ev.target,data={employeeIds:[...form.querySelectorAll('[name="employeeIds"]:checked')].map(x=>x.value)},button=form.querySelector('[type="submit"]');if(!data.employeeIds.length){toast('Selecciona al menos una persona.');return;}if(button)button.disabled=true;try{const result=await apiMeeting(`/api/enterprise/trainings/${encodeURIComponent(form.dataset.courseId)}/assign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});closeGlobalModal();await renderSkills();if(selectedEmployeeId)loadEmployeeProfile(selectedEmployeeId);toast(`${result.assigned} asignación(es) nueva(s); ${result.alreadyAssigned} ya existían.`);}catch(err){toast(err.message);if(button)button.disabled=false;}return;}
    if(ev.target.id==='development-interview-form'){ev.preventDefault();const form=ev.target,data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type="submit"]'),localSchedule=data.scheduledAt;if(button)button.disabled=true;try{const interview=await apiMeeting('/api/enterprise/interviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,scheduledAt:new Date(localSchedule).toISOString()})});let calendarSaved=true;try{const [startDate,startTime]=localSchedule.split('T');const [hour,minute]=startTime.split(':').map(Number);const end=new Date(2000,0,1,hour,minute+60);await FlowCalendar.createEvent({interviewId:interview.id,title:`Entrevista · ${data.candidateName} — ${data.positionTitle}`,description:[data.candidateEmail,data.candidatePhone,data.agenda].filter(Boolean).join('\n'),type:'meeting',color:'var(--accent)',startDate,endDate:startDate,startTime,endTime:`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`,attendees:data.candidateEmail?[data.candidateEmail]:[]});}catch(calendarError){calendarSaved=false;console.error('No se pudo agregar la entrevista al calendario local:',calendarError);}closeGlobalModal();await renderSkills();toast(calendarSaved?'Entrevista agendada y añadida a tu calendario.':'Entrevista agendada; no se pudo actualizar el calendario local.');}catch(err){toast(err.message);if(button)button.disabled=false;}return;}
    if(ev.target.id==='development-interview-result-form'){ev.preventDefault();const form=ev.target,data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type="submit"]');if(button)button.disabled=true;try{await apiMeeting(`/api/enterprise/interviews/${encodeURIComponent(form.dataset.interviewId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(data.status==='cancelled'){const linked=(FlowState.get('calendar.events')||[]).filter(e=>e.interviewId===form.dataset.interviewId);await Promise.all(linked.map(e=>FlowCalendar.deleteEvent(e.id)));}closeGlobalModal();await renderSkills();toast(data.status==='cancelled'?'Entrevista cancelada y retirada del calendario.':'Evaluación del candidato guardada.');}catch(err){toast(err.message);if(button)button.disabled=false;}return;}
    if(ev.target.id==='employee-assign-task-form'){ev.preventDefault();const form=ev.target,button=form.querySelector('button[type="submit"]'),data=Object.fromEntries(new FormData(form));if(button)button.disabled=true;try{await apiMeeting(`/api/enterprise/employees/${encodeURIComponent(form.dataset.employeeId)}/tasks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});toast('Tarea asignada y guardada en la cuenta de la persona.');await loadEmployeeProfile(form.dataset.employeeId);await renderHRMetrics();}catch(err){toast(err.message);if(button)button.disabled=false;}return;}
    if(ev.target.id==='global-org-form'){ev.preventDefault();const name=el('#global-org-name').value.trim();try{await apiMeeting('/api/superadmin/organizations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});ev.target.reset();toast('Organización creada.');await renderAdmin();}catch(err){toast(err.message);}return;}
    if(ev.target.id==='global-user-form'){ev.preventDefault();const data=Object.fromEntries(new FormData(ev.target));try{await apiMeeting('/api/superadmin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});ev.target.reset();toast('Cuenta creada correctamente.');await renderAdmin();}catch(err){toast(err.message);}return;}
    if(ev.target.matches('.my-survey-form')) {
      ev.preventDefault();const form=ev.target;const answers=[...form.querySelectorAll('[data-answer-index]')].sort((a,b)=>Number(a.dataset.answerIndex)-Number(b.dataset.answerIndex)).map(x=>x instanceof HTMLSelectElement&&x.multiple?[...x.selectedOptions].map(o=>o.value).join(', '):x.value.trim());const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
      try{const r=await fetch(`/api/my-surveys/${encodeURIComponent(form.dataset.surveyId)}/responses`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'No se pudo enviar la respuesta.');toast(b.message||'Respuesta enviada.');await renderMySurveys();}
      catch(err){toast(err.message);if(button)button.disabled=false;}
    }
    if(ev.target.id==='survey-form') {
      ev.preventDefault();const title=el('#survey-title').value.trim();
      const questions=[...document.querySelectorAll('.survey-question-card')].map(card=>{const type=card.querySelector('[data-question-type]').value;return {text:card.querySelector('[data-question-text]').value.trim(),type,options:['single_choice','multiple_choice'].includes(type)?card.querySelector('[data-question-options]').value.split('\n').map(x=>x.trim()).filter(Boolean):[],required:card.querySelector('[data-question-required]').checked};});
      if(!title||!questions.length||questions.some(q=>!q.text)){toast('Añade un título y escribe cada pregunta.');return;}
      if(questions.some(q=>['single_choice','multiple_choice'].includes(q.type)&&q.options.length<2)){toast('Las preguntas de selección necesitan al menos dos opciones, una por línea.');return;}
      const audienceRoles=[...document.querySelectorAll('input[name="survey-role"]:checked')].map(x=>x.value);const audienceUserIds=[...selectedSurveyPeople];
      const s=state();s.surveys.push({id:id(),title,category:el('#survey-category').value,questions,anonymous:el('#survey-anonymous').checked,audienceRoles:(audienceRoles.length||audienceUserIds.length)?audienceRoles:['admin','hr','employee'],audienceUserIds,responses:[],createdAt:new Date().toISOString()});
      try{await write(s);ev.target.reset();el('#survey-question-builder').innerHTML='';surveyQuestionCounter=0;selectedSurveyPeople.clear();addSurveyQuestion();renderSurveyAudiencePeople();closeSurveyModal();renderSurveys();toast('Encuesta guardada en Neon.');}catch(err){toast(err.message);}
    }

  });
  document.addEventListener('input',ev=>{if(ev.target.id==='meeting-people-search')renderMeetingDirectory();});
  document.addEventListener('change',ev=>{if(ev.target.matches('[data-meeting-person]')){if(ev.target.checked)selectedInvitees.add(ev.target.dataset.meetingPerson);else selectedInvitees.delete(ev.target.dataset.meetingPerson);renderMeetingDirectory();}});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!el('#survey-modal')?.hidden)closeSurveyModal();});
  document.addEventListener('click',async ev=>{
    if(ev.target?.id==='survey-modal'){closeSurveyModal();return;}
    const t=ev.target.closest('button'); if(!t)return;
    if(t.dataset.talentTab){document.querySelectorAll('.talent-tabs [data-talent-tab]').forEach(x=>x.classList.toggle('is-active',x.dataset.talentTab===t.dataset.talentTab));document.querySelectorAll('[data-talent-panel]').forEach(x=>x.hidden=x.dataset.talentPanel!==t.dataset.talentTab);return;}
    if(t.dataset.openEmployeeDashboard){const employeeId=t.dataset.openEmployeeDashboard;selectedEmployeeId=employeeId;selectedEmployeeProfile=selectedEmployeeProfile?.person?.id===employeeId?selectedEmployeeProfile:null;document.querySelectorAll('.people-roster-entry').forEach(x=>x.classList.toggle('is-selected',x.querySelector(`[data-select-employee="${CSS.escape(employeeId)}"]`)!==null));if(selectedEmployeeProfile?.person?.id===employeeId)showEmployeeDashboard(selectedEmployeeProfile);else loadEmployeeProfile(employeeId).then(()=>{if(selectedEmployeeProfile?.person?.id===employeeId)showEmployeeDashboard(selectedEmployeeProfile);});return;}
    if(t.dataset.assignCourse){showCourseAssignForm(t.dataset.assignCourse);return;}
    if(t.dataset.editInterview){showInterviewResultForm(t.dataset.editInterview);return;}
    if(t.id==='generate-talent-ai'){const button=t,box=el('#ai-talent-suggestions');button.disabled=true;button.textContent='Generando…';try{const result=await apiMeeting('/api/enterprise/competencies/suggestions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});box.textContent=result.text||'No se recibieron sugerencias.';box.hidden=false;}catch(err){toast(err.message);}finally{button.disabled=false;button.textContent='✦ Generar sugerencias con IA';}return;}
    if(t.dataset.saveEnrollment){const enrollmentId=t.dataset.saveEnrollment,status=el(`[data-enrollment-status="${CSS.escape(enrollmentId)}"]`)?.value,progress=el(`[data-enrollment-progress="${CSS.escape(enrollmentId)}"]`)?.value;apiMeeting(`/api/enterprise/training-enrollments/${encodeURIComponent(enrollmentId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,progress})}).then(async()=>{await renderSkills();if(selectedEmployeeId)loadEmployeeProfile(selectedEmployeeId);toast('Avance de capacitación actualizado.');}).catch(err=>toast(err.message));return;}
    if(t.id==='retry-my-development'){renderMyDevelopment();return;}
    if(t.dataset.selectEmployee){selectedEmployeeId=t.dataset.selectEmployee;selectedEmployeeProfile=null;renderEmployees();return;}
    if(t.dataset.retryEmployee){loadEmployeeProfile(t.dataset.retryEmployee);return;}
    if(t.id==='refresh-hr-metrics'){renderHRMetrics();return;}
    if(t.dataset.skillHistory){fetch(`/api/enterprise/skills/${encodeURIComponent(t.dataset.skillHistory)}/history`,{credentials:'same-origin',cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'No se pudo cargar el historial.');const content=b.length?`<ol class="talent-history-list">${b.map(x=>`<li><b>${esc(x.skill)}</b><span>${x.previous_level==null?'Sin nivel previo':x.previous_level+'/5'} → <strong>${x.assessed_level}/5</strong> · ${dateLabel(x.assessment_date)}${x.assessed_by?' · '+esc(x.assessed_by):''}</span><small>${esc(x.method||'Método no indicado')}</small>${x.evidence?`<p><b>Evidencia:</b> ${esc(x.evidence)}</p>`:''}${x.notes?`<p><b>Notas:</b> ${esc(x.notes)}</p>`:''}</li>`).join('')}</ol>`:'<p>Aún no hay evaluaciones históricas para este empleado.</p>';showGlobalModal({title:'Historial de competencias',content,size:'md'});}).catch(err=>toast(err.message));}
    if(t.id==='copy-organization-code'){const code=el('#organization-invite-code')?.textContent||'';if(code&&code!=='Cargando código…')navigator.clipboard?.writeText(code).then(()=>toast('Código copiado.')).catch(()=>toast('No se pudo copiar automáticamente.'));}
    if(t.id==='global-refresh')renderAdmin();
    if(t.dataset.copyOrgCode){const org=globalAdminData.organizations.find(o=>o.id===t.dataset.copyOrgCode);if(org?.invite_code)navigator.clipboard?.writeText(org.invite_code).then(()=>toast('Código copiado.')).catch(()=>prompt('Copia el código:',org.invite_code));}
    if(t.dataset.toggleOrg){const org=globalAdminData.organizations.find(o=>o.id===t.dataset.toggleOrg);if(org)apiMeeting(`/api/superadmin/organizations/${encodeURIComponent(org.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:t.dataset.status})}).then(renderAdmin).catch(err=>toast(err.message));}
    if(t.dataset.renameOrg){const org=globalAdminData.organizations.find(o=>o.id===t.dataset.renameOrg);if(org){const name=prompt('Nombre de la organización:',org.name);if(name&&name.trim())apiMeeting(`/api/superadmin/organizations/${encodeURIComponent(org.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim(),status:org.status})}).then(renderAdmin).catch(err=>toast(err.message));}}
    if(t.dataset.editGlobalUser){const u=globalAdminData.users.find(x=>x.id===t.dataset.editGlobalUser);if(u){const name=prompt('Nombre completo:',u.name||'');if(name===null)return;const email=prompt('Correo electrónico:',u.email||'');if(email===null)return;const roleOptions='superadmin, admin, hr, employee';const newRole=prompt(`Rol (${roleOptions}):`,u.role||'employee');if(newRole===null)return;const orgOptions=(globalAdminData.organizations||[]).map(o=>`${o.id} = ${o.name}`).join('\n');const orgId=prompt('ID de organización (vacío = sin organización):\n'+orgOptions,u.organization_id||'');if(orgId===null)return;const status=prompt('Estado (active/inactive):',u.employment_status||'active');if(status===null)return;const password=prompt('Nueva contraseña (deja vacío para conservar la actual):','');if(password===null)return;apiMeeting(`/api/superadmin/users/${encodeURIComponent(u.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,role:newRole,organizationId:orgId.trim()||null,status:status==='inactive'?'inactive':'active',password})}).then(()=>{toast('Cuenta actualizada.');renderAdmin();}).catch(err=>toast(err.message));}}
    if(t.id==='start-call-btn')startMeeting();
    if(t.id==='refresh-invitations-btn')renderInvitations();
    if(t.id==='refresh-hr-metrics')renderHRMetrics();
    if(t.dataset.meetingPerson){if(t.checked)selectedInvitees.add(t.dataset.meetingPerson);else selectedInvitees.delete(t.dataset.meetingPerson);renderMeetingDirectory();}
    if(t.dataset.acceptInvitation||t.dataset.declineInvitation){const mid=t.dataset.acceptInvitation||t.dataset.declineInvitation;apiMeeting(`/api/meetings/${encodeURIComponent(mid)}/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:t.dataset.acceptInvitation?'accepted':'declined'})}).then(async()=>{await renderInvitations();toast(t.dataset.acceptInvitation?'Invitación aceptada. Ya puedes unirte a la llamada.':'Invitación rechazada.');}).catch(err=>toast(err.message));}
    if(t.dataset.joinInvitation){const meeting={id:t.dataset.joinInvitation,roomName:t.dataset.roomName,title:t.dataset.roomTitle};const popup=window.open('about:blank','focusai-call-'+String(meeting.id).replace(/[^a-zA-Z0-9_-]/g,''));launchJitsiPopup(meeting,false,popup);}
    if(t.id==='stop-call-btn')finishMeeting();
    if(t.id==='summarize-meeting-btn')processMeetingContent();
    if(t.id==='refresh-meetings-btn')renderMeetings();
    if(t.id==='meeting-history-show-all'){t.dataset.showAll=t.dataset.showAll==='true'?'false':'true';renderMeetings();}
    if(t.id==='copy-call-link-btn'&&activeCall){const link='https://meet.jit.si/'+activeCall.roomName;navigator.clipboard?.writeText(link).then(()=>toast('Enlace de la sala copiado.')).catch(()=>prompt('Copia este enlace para invitar a participantes:',link));}
    if(t.dataset.rejoinMeeting){const meeting=state().meetings.find(m=>m.id===t.dataset.rejoinMeeting);if(meeting&&meeting.status==='in_progress'&&meeting.createdBy===FlowState.get('user.id')){activeCall=meeting;pendingCallId=meeting.id;const popup=window.open('about:blank','focusai-call-'+String(meeting.id).replace(/[^a-zA-Z0-9_-]/g,''));launchJitsiPopup(meeting,true,popup);}}
    if(t.dataset.selectMeeting){pendingCallId=t.dataset.selectMeeting;el('#meeting-transcript')?.focus();toast('Reunión seleccionada. Adjunta su grabación o pega la transcripción.');}
    if(t.id==='new-survey-btn') openSurveyModal();
    if(t.id==='close-survey-modal'||t.id==='cancel-survey-modal')closeSurveyModal();
    if(t.id==='survey-modal'&&ev.target===t)closeSurveyModal();
    if(t.dataset.removeSurveyPerson){selectedSurveyPeople.delete(t.dataset.removeSurveyPerson);renderSurveyAudiencePeople();}
    if(t.hasAttribute('data-add-survey-option')){const ta=t.closest('.survey-options-field')?.querySelector('[data-question-options]');if(ta){const lines=ta.value.trimEnd();ta.value=(lines?lines+'\n':'')+`Opción ${ta.value.split('\n').filter(Boolean).length+1}`;ta.focus();}}
    if(t.id==='add-survey-question'){addSurveyQuestion();}
    if(t.hasAttribute('data-remove-survey-question')){t.closest('.survey-question-card')?.remove();}
    if(t.id==='new-employee-btn'&&['superadmin','admin','hr'].includes(role()))showEmployeeForm();
    if(t.id==='new-skill-btn')showSkillForm();
    if(t.id==='new-development-interview')showInterviewForm();
    if(t.dataset.editEmployee&&['superadmin','admin'].includes(role())) {const e=state().employees.find(x=>x.id===t.dataset.editEmployee);if(e)showEmployeeForm(e);}
    if(t.dataset.removeEmployee) {const s=state(),e=s.employees.find(x=>x.id===t.dataset.removeEmployee);if(!e)return;const next=e.status==='Inactivo'?'Activo':'Inactivo';if(!confirm(`${next==='Inactivo'?'¿Desactivar':'¿Reactivar'} este perfil? Se conservarán la cuenta y el historial.`))return;e.status=next;write(s);renderEmployees();renderAdmin();renderSkills();}
    if(t.dataset.toggleEmployee) {const s=state(),e=s.employees.find(x=>x.id===t.dataset.toggleEmployee);if(e){e.status=e.status==='Inactivo'?'Activo':'Inactivo';write(s);renderAdmin();renderEmployees();}}
    if(t.dataset.deleteMeeting) {if(!confirm('¿Eliminar esta reunión y su transcripción/resumen?'))return;apiMeeting(`/api/meetings/${encodeURIComponent(t.dataset.deleteMeeting)}`,{method:'DELETE'}).then(renderMeetings).catch(err=>toast(err.message));}
    if(t.dataset.exportSurvey)exportSurveyExcel(t.dataset.exportSurvey);
    if(t.dataset.deleteSurvey) {if(!['admin','hr','superadmin'].includes(role())){toast('No tienes permiso para eliminar encuestas.');return;}const s=state();s.surveys=s.surveys.filter(x=>x.id!==t.dataset.deleteSurvey);write(s);renderSurveys();}
    if(t.dataset.answerSurvey)answerSurvey(t.dataset.answerSurvey);
  });
  document.addEventListener('change',ev=>{
    if(ev.target.id==='employee-department-filter')renderEmployees();
    if(ev.target.matches('[data-question-type]')){const field=ev.target.closest('.survey-question-card')?.querySelector('.survey-options-field');if(field){const needs=['single_choice','multiple_choice'].includes(ev.target.value);field.hidden=!needs;const textarea=field.querySelector('[data-question-options]');if(textarea)textarea.required=needs;}}
    if(ev.target.matches('[data-survey-person]')){if(ev.target.checked)selectedSurveyPeople.add(ev.target.dataset.surveyPerson);else selectedSurveyPeople.delete(ev.target.dataset.surveyPerson);renderSurveyAudiencePeople();}
    if(ev.target.matches('[data-role-user]')) {if(role()!=='superadmin'){toast('Los roles solo se modifican desde Administración global.');renderAdmin();return;}const s=state(),e=s.employees.find(x=>x.id===ev.target.dataset.roleUser);if(e){e.role=ev.target.value;write(s);renderAdmin();toast('Rol actualizado.');}}
  });
  document.addEventListener('input',ev=>{
    if(ev.target.id==='survey-people-search')renderSurveyAudiencePeople();
    if(ev.target.id==='global-user-search')renderGlobalUsers();
    if(ev.target.id==='employee-search')renderEmployees();
    if(ev.target.id==='skill-search')renderSkills();
  });
  window.addEventListener('flowrouter:navigate',()=>{if(activeCall)closeCallWindow('Saliste de la sala.');renderCurrent();});
  document.addEventListener('DOMContentLoaded',()=>{ loadRemoteState(); });
  window.addEventListener('focusai:authenticated',()=>loadRemoteState());
})();
