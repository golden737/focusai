// Compatibilidad con los módulos existentes; toda operación pasa por el backend FocusAI.
window.FlowSupabase = (() => {
  const listeners = new Set();
  let currentUser = null;
  let teamPoll = null;
  async function api(path, opts={}) { const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts}); const b=await r.json().catch(()=>({})); if(!r.ok) throw new Error(b.error||'Error del servidor'); return b; }
  function isConfigured(){return true;}
  function getClient(){return null;}
  async function signUp(email,password,name){const d=await api('/api/auth/signup',{method:'POST',body:JSON.stringify({email,password,name})});return d;}
  async function signIn(email,password){const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});currentUser=d.user;listeners.forEach(cb=>cb('SIGNED_IN',currentUser));window.dispatchEvent(new Event('focusai:authenticated'));return d;}
  async function signOut(){await api('/api/auth/logout',{method:'POST',body:'{}'});currentUser=null;listeners.forEach(cb=>cb('SIGNED_OUT',null));}
  async function getSession(){try{const d=await api('/api/auth/me');currentUser=d.user;return {user:d.user};}catch{return null;}}
  async function getUser(){const s=await getSession();return s?.user||null;}
  function onAuthChange(cb){listeners.add(cb);getUser().then(u=>{if(u)cb('SIGNED_IN',u)}).catch(()=>{});}
  async function updateProfile({name,accentColor}={}){return api('/api/auth/profile',{method:'PATCH',body:JSON.stringify({name,accentColor})});}
  async function getProfile(userId){const u=await getUser();if(!u||u.id!==userId)return null;return api('/api/auth/profile');}
  async function getAll(table){return api(`/api/data/${encodeURIComponent(table)}`);}
  async function save(table,record){return api(`/api/data/${encodeURIComponent(table)}`,{method:'POST',body:JSON.stringify(record)});}
  async function remove(table,id){return api(`/api/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,{method:'DELETE'});}
  async function createTeam(name,description=''){return api('/api/teams',{method:'POST',body:JSON.stringify({name,description})});}
  async function joinTeam(inviteCode){return api('/api/teams/join',{method:'POST',body:JSON.stringify({inviteCode})});}
  async function getMyTeams(){return api('/api/teams');}
  async function getTeamMembers(teamId){return api(`/api/teams/${teamId}/members`);}
  async function getProfiles(userIds){return api('/api/profiles/batch',{method:'POST',body:JSON.stringify({userIds})});}
  async function getTeamTasks(teamId){return api(`/api/teams/${teamId}/tasks`);}
  async function createTeamTask(teamId,{title,description='',priority='none',dueDate=null,assignedTo=null}){return api(`/api/teams/${teamId}/tasks`,{method:'POST',body:JSON.stringify({title,description,priority,dueDate,assignedTo})});}
  async function updateTeamTask(id,changes){return api(`/api/team-tasks/${id}`,{method:'PATCH',body:JSON.stringify(changes)});}
  async function removeTeamTask(id){return api(`/api/team-tasks/${id}`,{method:'DELETE'});}
  async function getTeamMessages(teamId){return api(`/api/teams/${teamId}/messages`);}
  async function sendTeamMessage(teamId,content){return api(`/api/teams/${teamId}/messages`,{method:'POST',body:JSON.stringify({content})});}
  async function deleteTeam(teamId){return api(`/api/teams/${teamId}`,{method:'DELETE'});}
  async function leaveTeam(teamId){return api(`/api/teams/${teamId}/members/me`,{method:'DELETE'});}
  function subscribeToTable(){return null;}
  function subscribeToTeam(_teamId,callback){unsubscribe();teamPoll=setInterval(()=>{Promise.resolve().then(callback).catch(()=>{});},4000);return teamPoll;}
  function unsubscribe(){if(teamPoll!==null){clearInterval(teamPoll);teamPoll=null;}}
  return {isConfigured,getClient,getUser,getSession,signUp,signIn,signOut,onAuthChange,updateProfile,getProfile,getAll,save,remove,createTeam,joinTeam,getMyTeams,getTeamMembers,getProfiles,getTeamTasks,createTeamTask,updateTeamTask,removeTeamTask,getTeamMessages,sendTeamMessage,deleteTeam,leaveTeam,subscribeToTable,subscribeToTeam,unsubscribe};
})();
