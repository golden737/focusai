// ── FocusAI Supabase ──────────────────────────────────────────────────────────
// Cliente de Supabase para autenticación y base de datos en la nube.

window.FlowSupabase = (() => {

  // Configuración — reemplazar con tus credenciales de Supabase
  const CONFIG = {
    url:    window.SUPABASE_URL    || '',
    anonKey: window.SUPABASE_ANON_KEY || '',
  };

  let _client = null;

  function getClient() {
    if (_client) return _client;
    if (!CONFIG.url || !CONFIG.anonKey) return null;
    try {
      _client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
    } catch(e) {
      console.warn('[Supabase] No se pudo inicializar:', e.message);
    }
    return _client;
  }

  function isConfigured() {
    return !!(CONFIG.url && CONFIG.anonKey);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function signUp(email, password, name) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name } }
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const sb = getClient();
    if (!sb) return;
    await sb.auth.signOut();
  }

  async function getSession() {
    const sb = getClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function updateProfile({ name, accentColor } = {}) {
    const sb = getClient();
    const user = await getUser();
    if (!sb || !user) return null;
    const payload = { id: user.id };
    if (name !== undefined) payload.name = name;
    if (accentColor !== undefined) payload.accent_color = accentColor;
    const { data, error } = await sb.from('profiles').upsert(payload).select().single();
    if (error) throw error;
    if (name !== undefined) await sb.auth.updateUser({ data: { name } });
    return data;
  }

  async function getProfile(userId) {
    const sb = getClient();
    if (!sb || !userId) return null;
    const { data, error } = await sb.from('profiles').select('id,name,accent_color,role').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }

  function onAuthChange(callback) {
    const sb = getClient();
    if (!sb) return;
    sb.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user || null);
    });
  }

  // ── Database ──────────────────────────────────────────────────────────────

  async function getAll(table) {
    const sb   = getClient();
    const user = await getUser();
    if (!sb || !user) return [];
    const { data, error } = await sb.from(table).select('*').eq('user_id', user.id);
    if (error) { console.warn(`[Supabase] getAll ${table}:`, error.message); return []; }
    return data || [];
  }

  async function save(table, record) {
    const sb   = getClient();
    const user = await getUser();
    if (!sb || !user) return null;
    const payload = { ...record, user_id: user.id };
    const { data, error } = await sb.from(table).upsert(payload).select().single();
    if (error) { console.warn(`[Supabase] save ${table}:`, error.message); return null; }
    return data;
  }

  async function remove(table, id) {
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) console.warn(`[Supabase] remove ${table}:`, error.message);
  }

  // ── Teams / Salas de colaboración ─────────────────────────────────────────

  async function createTeam(name, description = '') {
    const sb   = getClient();
    const user = await getUser();
    if (!sb || !user) throw new Error('Conecta Supabase e inicia sesión antes de crear un equipo');
    const team = {
      name, description,
      owner_id:    user.id,
      invite_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
      created_at:  new Date().toISOString(),
    };
    const { data, error } = await sb.from('teams').insert(team).select().single();
    if (error) throw error;
    // Agregar al creador como miembro admin
    await sb.from('team_members').insert({ team_id: data.id, user_id: user.id, role: 'admin', joined_at: new Date().toISOString() });
    return data;
  }

  async function joinTeam(inviteCode) {
    const sb   = getClient();
    if (!sb) throw new Error('Conecta Supabase e inicia sesión antes de unirte a un equipo');
    const { data: teamId, error } = await sb.rpc('join_team_by_code', { p_invite_code: inviteCode });
    if (error) throw error;
    return teamId;
  }

  async function getMyTeams() {
    const sb   = getClient();
    const user = await getUser();
    if (!sb || !user) return [];
    const { data } = await sb.from('team_members').select('team_id, role, teams(*)').eq('user_id', user.id);
    return (data || []).map(d => ({ ...d.teams, myRole: d.role }));
  }

  async function getTeamMembers(teamId) {
    const sb = getClient();
    if (!sb) return [];
    const { data } = await sb.from('team_members').select('user_id, role, joined_at').eq('team_id', teamId);
    return data || [];
  }

  async function getProfiles(userIds) {
    const sb = getClient();
    if (!sb || !userIds?.length) return [];
    const { data, error } = await sb.from('profiles').select('id,name,accent_color').in('id', [...new Set(userIds)]);
    if (error) throw error;
    return data || [];
  }

  async function getTeamTasks(teamId) {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb.from('team_tasks').select('*').eq('team_id', teamId).order('completed').order('created_at');
    if (error) throw error;
    return data || [];
  }

  async function createTeamTask(teamId, { title, description = '', priority = 'none', dueDate = null, assignedTo = null }) {
    const sb = getClient(); const user = await getUser();
    if (!sb || !user) throw new Error('Inicia sesión para crear una tarea');
    const { data, error } = await sb.from('team_tasks').insert({ team_id: teamId, title, description, priority, due_date: dueDate || null, assigned_to: assignedTo || null, created_by: user.id }).select().single();
    if (error) throw error;
    return data;
  }

  async function updateTeamTask(id, changes) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('team_tasks').update(changes).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async function removeTeamTask(id) {
    const sb = getClient(); if (!sb) return;
    const { error } = await sb.from('team_tasks').delete().eq('id', id);
    if (error) throw error;
  }

  async function getTeamMessages(teamId) {
    const sb = getClient(); if (!sb) return [];
    const { data, error } = await sb.from('team_messages').select('*').eq('team_id', teamId).order('created_at').limit(100);
    if (error) throw error;
    return data || [];
  }

  async function sendTeamMessage(teamId, content) {
    const sb = getClient(); const user = await getUser();
    if (!sb || !user) throw new Error('Inicia sesión para enviar mensajes');
    const { data, error } = await sb.from('team_messages').insert({ team_id: teamId, user_id: user.id, content }).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteTeam(teamId) {
    const sb = getClient(); if (!sb) return;
    const { error } = await sb.from('teams').delete().eq('id', teamId);
    if (error) throw error;
  }

  async function leaveTeam(teamId) {
    const sb = getClient(); const user = await getUser();
    if (!sb || !user) return;
    const { error } = await sb.from('team_members').delete().eq('team_id', teamId).eq('user_id', user.id);
    if (error) throw error;
  }

  // ── Realtime ──────────────────────────────────────────────────────────────

  function subscribeToTable(table, userId, callback) {
    const sb = getClient();
    if (!sb) return null;
    return sb.channel(`${table}_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, callback)
      .subscribe();
  }

  function subscribeToTeam(teamId, callback) {
    const sb = getClient();
    if (!sb) return null;
    return sb.channel(`team_${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${teamId}` }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages', filter: `team_id=eq.${teamId}` }, callback)
      .subscribe();
  }

  function unsubscribe(channel) { if (channel) getClient()?.removeChannel(channel); }

  return {
    isConfigured, getClient, getUser, getSession,
    signUp, signIn, signOut, onAuthChange, updateProfile, getProfile,
    getAll, save, remove,
    createTeam, joinTeam, getMyTeams, getTeamMembers, getProfiles,
    getTeamTasks, createTeamTask, updateTeamTask, removeTeamTask,
    getTeamMessages, sendTeamMessage, deleteTeam, leaveTeam,
    subscribeToTable, subscribeToTeam, unsubscribe,
  };

})();
