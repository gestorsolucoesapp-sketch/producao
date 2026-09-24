const VERSION='1.0.0';
const APP='https://gestorsolucoesapp-sketch.github.io/producao/';
const IFX='https://sistema.rioplastic.com.br/portal/#/';
const SB='https://bweblwmgwutzdvqtpbww.supabase.co';
const STATE=SB+'/functions/v1/iniflex-run-state-v1';
const REGISTER=SB+'/functions/v1/iniflex-pdf-ingest-v8?action=register';
const SLOTS=['0620','1520','2120'];

async function findTab(pattern){
  const tabs=await chrome.tabs.query({url:pattern});
  return tabs&&tabs.length?tabs[0]:null;
}
async function ensureApp(){
  let t=await findTab('https://gestorsolucoesapp-sketch.github.io/producao/*');
  if(!t)t=await chrome.tabs.create({url:APP,active:false});
  return t;
}
async function ensureIniflex(){
  let t=await findTab('https://sistema.rioplastic.com.br/*');
  if(!t)t=await chrome.tabs.create({url:IFX,active:false});
  return t;
}
async function registration(){
  const saved=await chrome.storage.local.get(['v1_token','v1_device_id']);
  if(saved.v1_token)return saved;
  const tab=await ensureApp();
  const r=await chrome.scripting.executeScript({
    target:{tabId:tab.id},world:'MAIN',
    func:async (url,version)=>{
      if(!window.sb||!window.sb.auth)throw new Error('Supabase do app ainda não carregou');
      const {data:{session}}=await window.sb.auth.getSession();
      if(!session?.access_token)throw new Error('Faça login no app Rioplastic');
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({label:'Opera · Rioplastic v1',version})});
      const d=await res.json().catch(()=>null);
      if(!res.ok||!d?.ok)throw new Error(d?.erro||('HTTP '+res.status));
      return d;
    },args:[REGISTER,VERSION]
  });
  const d=r?.[0]?.result;
  if(!d?.connector_token)throw new Error('Falha ao registrar Supervisor v1');
  await chrome.storage.local.set({v1_token:d.connector_token,v1_device_id:d.device_id});
  return {v1_token:d.connector_token,v1_device_id:d.device_id};
}
async function api(payload){
  const s=await registration();
  const r=await fetch(STATE,{method:'POST',headers:{'Content-Type':'application/json','x-connector-token':s.v1_token},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>null);
  if(!r.ok||!d?.ok)throw new Error(d?.error||('HTTP '+r.status));
  return d;
}
function brDateParts(d=new Date()){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  return p;
}
function yesterday(){
  const now=new Date();
  now.setDate(now.getDate()-1);
  return brDateParts(now);
}
function firstOfMonth(iso){return iso.slice(0,8)+'01'}
function runId(slot){return 'v1-'+brDateParts().replaceAll('-','')+'-'+slot}
async function start(slot='manual'){
  await ensureIniflex();await ensureApp();
  const end=yesterday(),start=firstOfMonth(end),id=runId(slot);
  const d=await api({action:'start',run_id:id,slot,periodo_inicio:start,periodo_fim:end});
  await chrome.storage.local.set({v1_active_run:id});
  return d;
}
async function status(){
  const s=await chrome.storage.local.get(['v1_active_run']);
  if(!s.v1_active_run)return {ok:true,state:null,version:VERSION};
  try{return {...await api({action:'status',run_id:s.v1_active_run}),version:VERSION}}
  catch(e){return {ok:false,error:String(e?.message||e),version:VERSION}}
}
function nextSlotDate(hhmm){
  const now=new Date(),d=new Date(now);
  d.setHours(Number(hhmm.slice(0,2)),Number(hhmm.slice(2)),0,0);
  if(d<=now)d.setDate(d.getDate()+1);
  return d.getTime();
}
async function schedule(){
  for(const slot of SLOTS){
    await chrome.alarms.create('slot-'+slot,{when:nextSlotDate(slot)});
  }
}
chrome.runtime.onInstalled.addListener(()=>schedule());
chrome.runtime.onStartup.addListener(()=>schedule());
chrome.alarms.onAlarm.addListener(async a=>{
  if(!a.name.startsWith('slot-'))return;
  const slot=a.name.slice(5);
  try{await start(slot)}catch(e){console.error(e)}
  await chrome.alarms.create(a.name,{when:nextSlotDate(slot)});
});
chrome.runtime.onMessage.addListener((m,_s,send)=>{
  (async()=>{
    if(m?.action==='v1-status')return status();
    if(m?.action==='v1-register')return registration();
    if(m?.action==='v1-start')return start(m.slot||'manual');
    if(m?.action==='v1-api')return api(m.payload||{});
    if(m?.action==='v1-open-iniflex'){const t=await ensureIniflex();await chrome.tabs.update(t.id,{active:true});return {ok:true}}
    if(m?.action==='v1-open-app'){const t=await ensureApp();await chrome.tabs.update(t.id,{active:true});return {ok:true}}
    return {ok:false,error:'ação desconhecida'};
  })().then(send).catch(e=>send({ok:false,error:String(e?.message||e)}));
  return true;
});
schedule();
