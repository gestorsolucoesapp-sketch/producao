// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const U=Deno.env.get("SUPABASE_URL");
function serviceKey(){
  try{const o=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");if(o.default)return o.default;}catch(_){}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
const db=createClient(U,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type,x-connector-token",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...CORS,"content-type":"application/json; charset=utf-8"}});
async function shaText(text){
  const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authenticate(req){
  const raw=String(req.headers.get("x-connector-token")||"").trim();
  if(!raw.startsWith("ifx_"))return{error:json({ok:false,erro:"Token do conector ausente."},401)};
  const hash=await shaText(raw);
  const {data,error}=await db.from("iniflex_connector_devices")
    .select("id,user_id,label,enabled").eq("token_hash",hash).eq("enabled",true).maybeSingle();
  if(error||!data)return{error:json({ok:false,erro:"Conector não autorizado."},401)};
  await db.from("iniflex_connector_devices").update({last_seen_at:new Date().toISOString()}).eq("id",data.id);
  return{device:data};
}
function reportId(q){
  const explicit=String(q?.report_id||"").trim().toUpperCase();
  if(explicit)return explicit;
  const c=String(q?.codigo||"").toLowerCase();
  if(c==="rven304-pedido")return"304-PED";
  if(c==="rven304-proposta")return"304-PROP";
  if(c.startsWith("rven002"))return"002";
  if(c.startsWith("rsmi005"))return"005";
  if(c.startsWith("rsmi010"))return"010";
  if(c.startsWith("rest196"))return"196";
  if(c.startsWith("rest241"))return"241";
  if(c.startsWith("rger339"))return"339";
  const m=/^(?:rpcp)(\d{3})/.exec(c);
  return m?m[1]:"";
}
function matches(id,i){
  const r=String(i?.rotina||"").toUpperCase();
  const ir=String(i?.report_id||"").toLowerCase();
  switch(String(id||"").toUpperCase()){
    case"304-PED":return ir==="rven304-pedido";
    case"304-PROP":return ir==="rven304-proposta";
    case"002":return r==="RVEN002";
    case"005":return r==="RSMI005"||r==="005";
    case"010":return r==="RSMI010"||r==="010";
    case"196":return r==="196"||r==="REST196";
    case"241":return r==="241"||r==="REST241";
    case"339":return r==="339"||r==="RGER339";
    default:return r===String(id||"").toUpperCase();
  }
}
function covers(q,i){
  if(!q?.periodo_inicio&&!q?.periodo_fim)return true;
  if(!i?.periodo_de||!i?.periodo_ate)return false;
  if(q.periodo_inicio&&String(i.periodo_de)>String(q.periodo_inicio))return false;
  if(q.periodo_fim&&String(i.periodo_ate)<String(q.periodo_fim))return false;
  return true;
}
async function hashesDoArquivo(q, rawHash) {
  const code = String(q.codigo || '').toLowerCase();
  const start = q.periodo_inicio, end = q.periodo_fim;
  const hashes = [rawHash];
  if (['rpcp621', 'rpcp054'].includes(code)) hashes.push(await shaText(`${rawHash}|${code}|${start}|${end}|small-v3-621fix`));
  if (['rpcp643', 'rpcp646'].includes(code)) hashes.push(await shaText(`${rawHash}|${code}|${start}|${end}`));
  if (code === 'rpcp622') hashes.push(await shaText(`${rawHash}|rpcp622|${start}|${end}|operational-day-v5-text-ident`));
  if (code === 'rpcp624') hashes.push(await shaText(`${rawHash}|${start}|${end}|recorte-v4-content`));
  if (['rven304-pedido', 'rven304-proposta'].includes(code)) {
    const origin = code.endsWith('-proposta') ? 'Proposta' : 'Pedido';
    hashes.push(await shaText([rawHash, code, start || '', end || '', origin, 'dual-v2'].join('|')));
  }
  return hashes;
}


async function conferirContagemComercial(db, id, imp) {
  if (!imp || imp.conf_ok === false || !["002","304-PED","304-PROP"].includes(id)) return imp;
  const table=id==="002"?"pedidos_regiao":"fluxo_pedido";
  let query=db.from(table).select("id",{count:"exact",head:true}).eq("importacao_id",imp.id);
  if(id.startsWith("304-"))query=query.eq("origem",id==="304-PED"?"Pedido":"Proposta");
  const {count,error}=await query;
  if(error)throw new Error("Conferência de registros: "+error.message);
  const expected=Number(imp.registros);
  const ok=Number.isInteger(expected)&&expected>0&&count===expected;
  return {...imp,conf_ok:ok,conf_msg:ok
    ?"OK por registros — "+count+" gravados e conferidos; sem Total Geral comparável."
    :"DIVERGENTE — esperados "+expected+", gravados "+count,
    conf_esperado:{...imp.conf_esperado,Registros:expected},
    conf_obtido:{...imp.conf_obtido,Registros:count}};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,erro:"Método não permitido."},405);
  const auth=await authenticate(req);if(auth.error)return auth.error;
  const url=new URL(req.url),qid=String(url.searchParams.get("queue_id")||"").trim();
  const requestedReport=String(url.searchParams.get("report_id")||"").trim().toUpperCase();
  const requestedStart=String(url.searchParams.get("period_start")||"").trim();
  const requestedEnd=String(url.searchParams.get("period_end")||"").trim();
  const {data:userDevices,error:ude}=await db.from("iniflex_connector_devices").select("id").eq("user_id",auth.device.user_id);
  if(ude)return json({ok:false,erro:ude.message},500);
  const deviceIds=(userDevices||[]).map(x=>x.id);
  let q=null,qe=null;
  if(qid){
    let query=db.from("iniflex_pdf_queue")
      .select("id,device_id,codigo,caminho,report_id,run_slot,exec_slot,run_requested_at,run_at,periodo_inicio,periodo_fim,status,erro,criado_em,atualizado_em,processado_em")
      .eq("id",qid);
    if(deviceIds.length)query=query.in("device_id",deviceIds);
    const x=await query.maybeSingle();
    q=x.data;qe=x.error;
  }else if(requestedReport){
    const codeMap={
      "621":"rpcp621","624":"rpcp624","643":"rpcp643","646":"rpcp646","622":"rpcp622","054":"rpcp054",
      "005":"rsmi005","010":"rsmi010","196":"rest196","241":"rest241","339":"rger339","002":"rven002-pedido",
      "304-PED":"rven304-pedido","304-PROP":"rven304-proposta"
    };
    let query=db.from("iniflex_pdf_queue")
      .select("id,device_id,codigo,caminho,report_id,run_slot,exec_slot,run_requested_at,run_at,periodo_inicio,periodo_fim,status,erro,criado_em,atualizado_em,processado_em");
    if(deviceIds.length)query=query.in("device_id",deviceIds);
    const expectedCode=codeMap[requestedReport];
    if(expectedCode)query=query.eq("codigo",expectedCode);
    else query=query.eq("report_id",requestedReport);
    if(requestedStart)query=query.eq("periodo_inicio",requestedStart);
    if(requestedEnd)query=query.eq("periodo_fim",requestedEnd);
    const x=await query.order("atualizado_em",{ascending:false}).limit(1).maybeSingle();
    q=x.data;qe=x.error;
  }else return json({ok:false,erro:"queue_id ou report_id ausente."},400);
  if(qe||!q)return json({ok:false,erro:"Item da fila não encontrado."},404);
  const id=reportId(q);
  let imp=null;
  if(String(q.status)==="processado"){
    const {data:pdf,error:pe}=await db.storage.from("relatorios-dia").download(q.caminho);
    if(pe||!pdf)return json({ok:false,erro:"Não foi possível conferir o PDF atual da fila."},503);
    const digest=await crypto.subtle.digest("SHA-256",await pdf.arrayBuffer());
    const rawHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
    const expectedHashes=await hashesDoArquivo(q,rawHash);
    const {data:list,error:ie}=await db.from("importacoes")
      .select("id,hash,rotina,report_id,periodo_de,periodo_ate,registros,conf_ok,conf_msg,conf_esperado,conf_obtido,criado_em")
      .in("hash",expectedHashes).order("criado_em",{ascending:false}).limit(20);
    if(ie)return json({ok:false,erro:ie.message},500);
    imp=(list||[]).find(i=>matches(id,i)&&covers(q,i))||null;
    const {data:current,error:ce}=await db.from("iniflex_pdf_queue").select("atualizado_em,status,caminho").eq("id",q.id).maybeSingle();
    if(ce||!current||current.atualizado_em!==q.atualizado_em||current.status!==q.status||current.caminho!==q.caminho)
      return json({ok:true,queue:q,certification:{state:"processing",report_id:id,importacao_id:null,conf_ok:null,message:"A fila mudou durante a conferência; aguardando o arquivo atual."}});
  }

  // Auto-certificação do RPCP622: o job é assíncrono e pode terminar depois que a fila
  // já virou processado. O status endpoint corrige a evidência sem exigir intervenção manual.
  if(id==="622" && String(q.status)==="processado" && imp && imp.conf_ok!==true){
    try{
      const {data:j}=await db.from("iniflex_622_jobs")
        .select("status,registros,total_pages,next_page,erro")
        .eq("importacao_id",imp.id).maybeSingle();
      if(j?.status==="processado"){
        const {data:tot,error:te}=await db.rpc("importacao_totais",{p_importacao_id:imp.id,p_rotina:"622"});
        if(!te){
          const jobRecords=Number(j.registros||0), bankRecords=Number(tot?.Registros||0);
          const ok=jobRecords>0 && jobRecords===bankRecords;
          const msg=ok
            ? "OK — RPCP622 concluído e banco confere com o job final ("+bankRecords+" registros); total bruto do PDF não é usado porque o turno 5 é realocado ao dia operacional anterior"
            : "DIVERGENTE — job final "+jobRecords+" registros, banco "+bankRecords;
          await db.from("importacoes").update({conf_ok:ok,conf_msg:msg}).eq("id",imp.id);
          imp={...imp,conf_ok:ok,conf_msg:msg};
        }
      }
    }catch(_){}
  }

  if(String(q.status)==="processado" && imp) imp=await conferirContagemComercial(db,id,imp);

  let state="processing";
  let message=String(q.erro||"");
  if(String(q.status)==="erro")state="error";
  else if(String(q.status)==="processado"){
    if(imp?.conf_ok===true){state="ok";message=String(imp.conf_msg||"OK");}
    else if(imp?.conf_ok===false){state="error";message=String(imp.conf_msg||"Importação divergente.");}
    else {state="uncertified";message=String(imp?.conf_msg||"Importado sem evidência de certificação.");}
  }else if(!["novo","processando","processing"].includes(String(q.status||"").toLowerCase()))state="missing";
  return json({
    ok:true,
    queue:q,
    certification:{
      state,
      report_id:id,
      importacao_id:imp?.id||null,
      conf_ok:imp?.conf_ok??null,
      message,
      records:imp?.registros??null,
      periodo_de:imp?.periodo_de??null,
      periodo_ate:imp?.periodo_ate??null,
      expected:imp?.conf_esperado??null,
      obtained:imp?.conf_obtido??null
    }
  });
});