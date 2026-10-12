// FocusAI Storage — almacenamiento remoto obligatorio en Neon a través del backend.
// No existe fallback a localStorage ni IndexedDB: si el servidor falla, se informa el error.
window.FlowStorage = (() => {
  const STORES = new Set(['tasks','events','habits','habit_logs','goals','projects','time_logs','journal','mood_logs','focus_logs','meta','attachments','teams','messages']);
  async function request(path, options={}) {
    const response = await fetch(path, { credentials:'same-origin', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options });
    const body = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(body.error || (response.status===401 ? 'Inicia sesión para guardar o consultar tus datos.' : `Error del servidor (${response.status})`));
    return body;
  }
  function valid(store){ if(!STORES.has(store)) throw new Error(`Almacén no permitido: ${store}`); }
  async function init(){ await request('/api/health'); }
  async function getAll(storeName){ valid(storeName); return request(`/api/data/${encodeURIComponent(storeName)}`); }
  async function get(storeName,key){ valid(storeName); return request(`/api/data/${encodeURIComponent(storeName)}/${encodeURIComponent(key)}`); }
  async function save(storeName,record){ valid(storeName); return request(`/api/data/${encodeURIComponent(storeName)}`,{method:'POST',body:JSON.stringify(record)}); }
  async function saveMany(storeName,records){ const out=[]; for(const r of records) out.push(await save(storeName,r)); return out; }
  async function remove(storeName,key){ valid(storeName); return request(`/api/data/${encodeURIComponent(storeName)}/${encodeURIComponent(key)}`,{method:'DELETE'}); }
  async function removeMany(storeName,keys){ for(const key of keys) await remove(storeName,key); }
  async function clear(storeName){ valid(storeName); return request(`/api/data/${encodeURIComponent(storeName)}`,{method:'DELETE'}); }
  async function count(storeName){ return (await getAll(storeName)).length; }
  async function getByIndex(storeName,indexName,value){ return (await getAll(storeName)).filter(r=>String(r[indexName])===String(value)); }
  async function getByDateRange(storeName,indexName,start,end){ const a=start instanceof Date?start.toISOString():String(start), b=end instanceof Date?end.toISOString():String(end); return (await getAll(storeName)).filter(r=>r[indexName] && String(r[indexName])>=a && String(r[indexName])<=b); }
  async function query(storeName,predicate,limit=Infinity){ return (await getAll(storeName)).filter(predicate).slice(0,limit); }
  async function getMeta(key){ return get('meta',key); }
  async function setMeta(key,value){ return save('meta',{id:key,key,value,updatedAt:new Date().toISOString()}); }
  async function removeMeta(key){ return remove('meta',key); }
  async function exportAll(){ const data={}; for(const s of STORES){try{data[s]=await getAll(s)}catch{data[s]=[]}} return {version:2,exportedAt:new Date().toISOString(),app:'FocusAI',data}; }
  async function importAll(exported){ if(!exported?.data) throw new Error('Formato inválido'); for(const [s,records] of Object.entries(exported.data)){if(!STORES.has(s)||!Array.isArray(records))continue;await clear(s);await saveMany(s,records);} }
  async function exportCSV(storeName){ const records=await getAll(storeName);if(!records.length)return '';const headers=Object.keys(records[0]);const rows=records.map(r=>headers.map(h=>{const v=r[h];if(v==null)return '';const x=String(v).replace(/"/g,'""');return /[",\n]/.test(x)?`"${x}"`:x}).join(','));return [headers.join(','),...rows].join('\n'); }
  function generateId(prefix=''){return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;}
  async function estimateSize(){ return null; }
  async function requestPersistence(){ return false; }
  return {init,getAll,get,save,saveMany,remove,removeMany,clear,count,getByIndex,getByDateRange,query,getMeta,setMeta,removeMeta,exportAll,importAll,exportCSV,generateId,estimateSize,requestPersistence};
})();
