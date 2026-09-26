// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const FUNCTION_URL = `${SB_URL}/functions/v1/importar-622`;
const PAGE_BATCH = 4;
const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST,GET,OPTIONS",
};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...CORS,"content-type":"application/json; charset=utf-8"}
});

let PDFJS=null;
async function pdfjs(){
  if(PDFJS)return PDFJS;
  const m=await import("npm:pdfjs-dist@3.11.174/legacy/build/pdf.js");
  PDFJS=typeof m?.getDocument==="function"?m:m?.default;
  if(!PDFJS?.getDocument)throw new Error("pdfjs indisponível");
  if(PDFJS.GlobalWorkerOptions)PDFJS.GlobalWorkerOptions.workerSrc="";
  return PDFJS;
}
function numBR(v){
  if(v==null||v==="")return null;
  const n=Number.parseFloat(String(v).replace(/\./g,"").replace(",","."));
  return Number.isFinite(n)?n:null;
}
function dataBR(v){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v||"").trim());
  return m?`${m[3]}-${m[2]}-${m[1]}`:null;
}
function addDays(iso,delta){
  if(!iso)return null;
  const d=new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+delta);
  return d.toISOString().slice(0,10);
}
function inPeriod(day,start,end){return !!day&&day>=start&&day<=end;}
async function sha256(buf){
  const h=await crypto.subtle.digest("SHA-256",buf);
  return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function shaText(text){
  const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function getKey(){
  const {data,error}=await sb.from("app_config").select("valor").eq("chave","cron_key").maybeSingle();
  if(error||!data?.valor)throw new Error("cron_key ausente");
  return String(data.valor).replace(/^\"|\"$/g,"");
}
async function validKey(url){return String(url.searchParams.get("key")||"")===await getKey();}
async function fetchPdf(path){
  const r=await fetch(`${SB_URL}/storage/v1/object/relatorios-dia/${path}`,{
    headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`},cache:"no-store"
  });
  if(!r.ok)throw new Error(`storage ${r.status} em ${path}`);
  return await r.arrayBuffer();
}
async function pageLines(page){
  const tc=await page.getTextContent({disableCombineTextItems:false});
  const items=[];
  for(const item of tc.items||[]){
    const s=String(item?.str||"").trim();
    if(!s)continue;
    items.push({x:Number(item.transform?.[4]||0),y:Number(item.transform?.[5]||0),s});
  }
  items.sort((a,b)=>b.y-a.y||a.x-b.x);
  const groups=[];
  for(const item of items){
    let g=groups[groups.length-1];
    if(!g||Math.abs(g.y-item.y)>=2.5){g={y:item.y,items:[]};groups.push(g);}
    g.items.push(item);
  }
  return groups.map(g=>{
    g.items.sort((a,b)=>a.x-b.x);
    return g.items.map(x=>x.s).join(" ").replace(/\s+/g," ").trim();
  }).filter(Boolean);
}
function scheduleChunk(jobId,key){
  const p=fetch(`${FUNCTION_URL}?action=chunk&job_id=${encodeURIComponent(jobId)}&key=${encodeURIComponent(key)}`,{
    method:"POST",headers:{"content-type":"application/json"},body:"{}"
  }).catch(()=>null);
  EdgeRuntime.waitUntil(p);
}
async function markFailure(jobId,queueId,error){
  const now=new Date().toISOString(),msg=String(error||"Falha RPCP622").slice(0,1000);
  if(jobId)await sb.from("iniflex_622_jobs").update({status:"erro",erro:msg,lease_token:null,lease_until:null,atualizado_em:now}).eq("id",jobId);
  if(queueId)await sb.from("iniflex_pdf_queue").update({status:"erro",erro:msg,atualizado_em:now,processado_em:null}).eq("id",queueId);
}
async function cleanupOldJob(oldJob){
  if(!oldJob)return;
  if(oldJob.importacao_id){
    await sb.from("producao").delete().eq("importacao_id",oldJob.importacao_id);
    await sb.from("importacoes").delete().eq("id",oldJob.importacao_id);
  }
  await sb.from("iniflex_622_jobs").delete().eq("id",oldJob.id);
}
async function start(queueId,key){
  const {data:q,error:qe}=await sb.from("iniflex_pdf_queue")
    .select("id,codigo,arquivo,caminho,periodo_inicio,periodo_fim,status,exec_slot,report_id")
    .eq("id",queueId).maybeSingle();
  if(qe||!q)throw new Error("fila RPCP622 não encontrada");
  if(String(q.codigo||"").toLowerCase()!=="rpcp622")throw new Error("fila não é RPCP622");
  if(!q.periodo_inicio||!q.periodo_fim)throw new Error("fila RPCP622 sem período");

  const buf=await fetchPdf(q.caminho);
  const fileHash=await sha256(buf);
  const effectiveHash=await shaText(`${fileHash}|rpcp622|${q.periodo_inicio}|${q.periodo_fim}|operational-day-v5-text-ident`);
  const {data:already}=await sb.from("importacoes").select("id,registros").eq("hash",effectiveHash).maybeSingle();
  if(already){
    const now=new Date().toISOString();
    await sb.from("iniflex_pdf_queue").update({status:"processado",erro:null,atualizado_em:now,processado_em:now}).eq("id",queueId);
    return{ok:true,duplicate:true,importacao_id:already.id,registros:already.registros};
  }

  const {data:oldJob}=await sb.from("iniflex_622_jobs").select("*").eq("queue_id",queueId).maybeSingle();
  if(oldJob?.status==="processando"&&oldJob.hash===effectiveHash){
    scheduleChunk(oldJob.id,key);
    return{ok:true,resumed:true,job_id:oldJob.id};
  }
  if(oldJob)await cleanupOldJob(oldJob);

  const {data:imp,error:ie}=await sb.from("importacoes").insert({
    hash:effectiveHash,rotina:"622",arquivo:q.arquivo||"rpcp622_atual.pdf",
    periodo_de:q.periodo_inicio,periodo_ate:q.periodo_fim,registros:0,
    exec_slot:q.exec_slot||null,report_id:q.report_id||"622"
  }).select("id").single();
  if(ie||!imp)throw new Error("falha ao criar importação RPCP622: "+(ie?.message||"sem id"));

  const {data:job,error:je}=await sb.from("iniflex_622_jobs").insert({
    queue_id:queueId,caminho:q.caminho,arquivo:q.arquivo||"rpcp622_atual.pdf",
    periodo_inicio:q.periodo_inicio,periodo_fim:q.periodo_fim,
    hash:effectiveHash,importacao_id:imp.id,status:"processando",next_page:1,registros:0
  }).select("id").single();
  if(je||!job){
    await sb.from("importacoes").delete().eq("id",imp.id);
    throw new Error("falha ao criar job RPCP622: "+(je?.message||"sem id"));
  }
  await sb.from("iniflex_pdf_queue").update({status:"processando",erro:null,atualizado_em:new Date().toISOString(),processado_em:null}).eq("id",queueId);
  scheduleChunk(job.id,key);
  return{ok:true,started:true,job_id:job.id,importacao_id:imp.id};
}
async function chunk(jobId,key){
  const token=crypto.randomUUID(),now=new Date(),leaseUntil=new Date(now.getTime()+90000).toISOString();
  const {data:job,error:claimErr}=await sb.from("iniflex_622_jobs").update({
    lease_token:token,lease_until:leaseUntil,atualizado_em:now.toISOString()
  }).eq("id",jobId).eq("status","processando")
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("*").maybeSingle();
  if(claimErr)throw new Error("falha ao obter lease RPCP622: "+claimErr.message);
  if(!job)return{ok:true,claimed:false};

  try{
    const buf=await fetchPdf(job.caminho),lib=await pdfjs();
    const doc=await lib.getDocument({data:new Uint8Array(buf),disableWorker:true,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0}).promise;
    const totalPages=Number(doc.numPages||0),pageStart=Number(job.next_page||1);
    if(pageStart>totalPages){
      try{await doc.destroy()}catch(_){}
      const {data:done,error:finErr}=await sb.rpc("iniflex_622_finalize",{p_job_id:jobId});
      if(finErr)throw new Error("falha ao finalizar RPCP622: "+finErr.message);
      return{ok:true,done:true,result:done?.[0]||null};
    }
    const pageEnd=Math.min(totalPages,pageStart+PAGE_BATCH-1);
    let turno=job.ctx_turno==null?null:Number(job.ctx_turno);
    let itemCod=job.ctx_item_cod==null?null:String(job.ctx_item_cod);
    let itemDesc=job.ctx_item_desc==null?null:String(job.ctx_item_desc);
    let gerado=job.gerado==null?null:String(job.gerado);
    const rows=[];
    const rx=/^(\d{2}\/\d{2}\/\d{4}) (\d{2}\/\d{2}\/\d{4}) (\d+) (?:(.+?) )?(\d+) - (.+?) ([\d.,]+) ([A-ZÇ]{1,5}) ([\d.,]+)(?: ([\d.,]+))?$/;

    for(let p=pageStart;p<=pageEnd;p++){
      const page=await doc.getPage(p),lines=await pageLines(page);
      for(const text of lines){
        let m;
        if(!gerado&&(m=/\bDATA:\s*(\d{2}\/\d{2}\/\d{4})/.exec(text)))gerado=dataBR(m[1]);
        if((m=/^Item:\s*(\d+)\s*-\s*(.+)$/.exec(text))){itemCod=m[1];itemDesc=m[2].trim();continue;}
        if((m=/^Turno:\s*(\d)$/.exec(text))){turno=Number(m[1]);continue;}
        if(!turno||!itemCod||!itemDesc){
          if(/^\d{2}\/\d{2}\/\d{4} \d{2}\/\d{2}\/\d{4} /.test(text))throw new Error("RPCP622: contexto ausente na página "+p+". Importação bloqueada.");
          continue;
        }
        m=rx.exec(text);
        if(!m){
          if(/^\d{2}\/\d{2}\/\d{4} \d{2}\/\d{2}\/\d{4} /.test(text))throw new Error("RPCP622: linha de produção não reconhecida na página "+p+". Importação bloqueada.");
          continue;
        }
        const rawStart=dataBR(m[1]),rawEnd=dataBR(m[2]);
        const operationalDay=turno===5?addDays(rawStart,-1):rawStart;
        const quantidade=numBR(m[7]);
        const peso=numBR(m[9]);
        if(!rawStart||!rawEnd||!operationalDay||quantidade==null||peso==null||!m[5])continue;
        if(!inPeriod(operationalDay,String(job.periodo_inicio),String(job.periodo_fim)))continue;
        const ident=m[4]&&m[4]!==","?m[4]:null;
        rows.push({
          dia:operationalDay,turno,op:m[3],item_cod:itemCod,item_desc:itemDesc,
          ident,data_inicio:rawStart,data_fim:rawEnd,
          recurso_cod:m[5],recurso_nome:m[6].trim(),quantidade,unidade:m[8],peso
        });
      }
      try{page.cleanup()}catch(_){}
    }
    try{await doc.destroy()}catch(_){}

    const {data:committed,error:commitErr}=await sb.rpc("iniflex_622_commit_chunk",{
      p_job_id:jobId,p_lease_token:token,p_page_end:pageEnd,p_total_pages:totalPages,
      p_ctx_turno:turno,p_ctx_item_cod:itemCod,p_ctx_item_desc:itemDesc,p_gerado:gerado,p_rows:rows
    });
    if(commitErr)throw new Error("falha ao confirmar bloco RPCP622: "+commitErr.message);
    const nextPage=Number(committed?.[0]?.next_page||pageEnd+1);
    if(nextPage>totalPages){
      const {data:done,error:finErr}=await sb.rpc("iniflex_622_finalize",{p_job_id:jobId});
      if(finErr)throw new Error("falha ao finalizar RPCP622: "+finErr.message);
      return{ok:true,done:true,job_id:jobId,total_pages:totalPages,result:done?.[0]||null};
    }
    scheduleChunk(jobId,key);
    return{ok:true,done:false,job_id:jobId,pages:[pageStart,pageEnd],next_page:nextPage,rows:rows.length};
  }catch(e){
    await sb.from("iniflex_622_jobs").update({lease_token:null,lease_until:null,atualizado_em:new Date().toISOString()}).eq("id",jobId).eq("lease_token",token);
    throw e;
  }
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  const url=new URL(req.url);let queueId=null,jobId=null;
  try{
    if(!(await validKey(url)))return reply({ok:false,error:"chave inválida"},401);
    const key=url.searchParams.get("key")||"",action=String(url.searchParams.get("action")||"start");
    queueId=url.searchParams.get("queue_id");jobId=url.searchParams.get("job_id");
    if(action==="start"){
      if(!queueId)return reply({ok:false,error:"queue_id ausente"},400);
      return reply(await start(queueId,key));
    }
    if(action==="chunk"){
      if(!jobId)return reply({ok:false,error:"job_id ausente"},400);
      return reply(await chunk(jobId,key));
    }
    if(action==="status"){
      const q=jobId?await sb.from("iniflex_622_jobs").select("*").eq("id",jobId).maybeSingle():await sb.from("iniflex_622_jobs").select("*").eq("queue_id",queueId).maybeSingle();
      return reply({ok:!q.error,job:q.data||null,error:q.error?.message||null});
    }
    return reply({ok:false,error:"ação inválida"},400);
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    let linkedQueue=queueId;
    if(!linkedQueue&&jobId){const {data:j}=await sb.from("iniflex_622_jobs").select("queue_id").eq("id",jobId).maybeSingle();linkedQueue=j?.queue_id||null;}
    await markFailure(jobId,linkedQueue,message);
    return reply({ok:false,error:message},200);
  }
});