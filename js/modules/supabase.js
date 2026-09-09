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
    if (!sb || !user) return null;
    const team = {
      id:          crypto.randomUUID(),
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
    const user = await getUser();
    if (!sb || !user) return null;
    const { data: team, error } = await sb.from('teams').select('*').eq('invite_code', inviteCode).single();
    if (error || !team) throw new Error('Código de invitación inválido');
    // Verificar si ya es miembro
    const { data: existing } = await sb.from('team_members').select('id').eq('team_id', team.id).eq('user_id', user.id).single();
    if (existing) return team;
    await sb.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'member', joined_at: new Date().toISOString() });
    return team;
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
      .subscribe();
  }

  return {
    isConfigured, getClient, getUser, getSession,
    signUp, signIn, signOut, onAuthChange,
    getAll, save, remove,
    createTeam, joinTeam, getMyTeams, getTeamMembers,
    subscribeToTable, subscribeToTeam,
  };

})();
