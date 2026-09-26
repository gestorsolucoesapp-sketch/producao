// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const U=Deno.env.get("SUPABASE_URL")!;
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const sb=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const C={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const reply=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...C,"content-type":"application/json; charset=utf-8"}});
let PDF:any=null;
async function pdfjs(){
  if(PDF)return PDF;
  const m:any=await import("npm:pdfjs-dist@3.11.174/legacy/build/pdf.js");
  PDF=typeof m?.getDocument==="function"?m:m?.default;
  if(!PDF?.getDocument)throw new Error("pdfjs indisponível");
  if(PDF.GlobalWorkerOptions)PDF.GlobalWorkerOptions.workerSrc="";
  return PDF;
}
async function keyOk(u:URL){
  const {data}=await sb.from("app_config").select("valor").eq("chave","cron_key").maybeSingle();
  return String(data?.valor||"").replace(/^"|"$/g,"")===String(u.searchParams.get("key")||"");
}
function num(v:any){
  const s=String(v??"").trim().replace(/\s/g,"");
  if(!s)return null;
  const n=Number(s.includes(",")?s.replace(/\./g,"").replace(",","."):s);
  return Number.isFinite(n)?n:null;
}
function dateBR(v:any){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v||"").trim());
  return m?`${m[3]}-${m[2]}-${m[1]}`:null;
}
function addDays(iso:string,delta:number){
  const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);
}
async function fetchPdf(path:string){
  const r=await fetch(`${U}/storage/v1/object/relatorios-dia/${path}`,{headers:{apikey:K,Authorization:`Bearer ${K}`},cache:"no-store"});
  if(!r.ok)throw new Error(`storage ${r.status}`);
  return await r.arrayBuffer();
}
async function pageLines(page:any){
  const tc=await page.getTextContent({disableCombineTextItems:false});
  const a:any[]=[];
  for(const i of tc.items||[]){
    const s=String(i?.str||"").trim();
    if(s)a.push({x:Number(i.transform?.[4]||0),y:Number(i.transform?.[5]||0),w:Number(i.width||0),s});
  }
  a.sort((x,y)=>y.y-x.y||x.x-y.x);
  const g:any[]=[];
  for(const i of a){let z=g[g.length-1];if(!z||Math.abs(z.y-i.y)>=2.5){z={y:i.y,itens:[]};g.push(z)}z.itens.push(i)}
  return g.map(z=>{z.itens.sort((x:any,y:any)=>x.x-y.x);return{itens:z.itens,texto:z.itens.map((x:any)=>x.s).join(" ").replace(/\s+/g," ").trim()}});
}
function headerInfo(lines:any[]){
  const t=lines.slice(0,100).map(x=>x.texto).join("\n");
  const p=/(?:Per[ií]odo|Apontamentos):\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t);
  const d=/\bDATA:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t);
  return{sourceStart:dateBR(p?.[1]),sourceEnd:dateBR(p?.[2]),generated:dateBR(d?.[1]),text:t};
}
function parseRange(all:any[],start:string,end:string){
  const context:any[]=[];
  let recursoCausa:any=null,tipoGrupo:any=null,turno:any=null,op:any=null,item:any=null;
  all.forEach((l,i)=>{
    let m;
    if((m=/^Recurso Causa:\s*(\d*)\s*-\s*(.*)$/.exec(l.texto)))recursoCausa={cod:m[1]||null,nome:m[2].trim()};
    else if((m=/^Tipo Perda:\s*(\d*)\s*-\s*(.*)$/.exec(l.texto)))tipoGrupo={cod:m[1]||null,nome:m[2].trim()};
    else if((m=/^Turno:\s*(\d)$/.exec(l.texto)))turno=+m[1];
    else if((m=/^OP:\s*(\d+)$/.exec(l.texto)))op=m[1];
    else if((m=/^Item:\s*(\d+)\s*-\s*(.+)$/.exec(l.texto)))item={cod:m[1],desc:m[2].trim()};
    context[i]={recursoCausa,tipoGrupo,turno,op,item};
  });
  const cols=[
    {nome:"Data",chave:"data"},{nome:"Ordem",chave:"ordem"},{nome:"Item/Versão",chave:"item"},
    {nome:"Acessório",chave:"acessorio"},{nome:"Tipo Perda",chave:"tipo_perda"},
    {nome:"Turno",chave:"turno_col"},{nome:"Quantidade",chave:"quantidade"},
    {nome:"UN",chave:"un"},{nome:"Peso",chave:"peso"}
  ];
  const records:any[]=[];let colX:any=null,current:any=null;
  const close=()=>{if(current){records.push(current);current=null}};
  all.forEach((line,i)=>{
    const t=line.texto;
    if(t.startsWith("Data Ordem")&&t.includes("Tipo Perda")){
      const known:any={};
      for(const c of cols){const it=line.itens.find((x:any)=>x.s===c.nome||x.s.startsWith(c.nome));if(it)known[c.chave]=it.x;}
      if(known.turno_col==null&&known.tipo_perda!=null&&known.quantidade!=null)known.turno_col=(known.tipo_perda+known.quantidade)/2;
      colX=cols.map((c,idx)=>{
        let x=known[c.chave];
        if(x==null){let l=null,r=null;for(let j=idx-1;j>=0;j--)if(known[cols[j].chave]!=null){l=known[cols[j].chave];break}for(let j=idx+1;j<cols.length;j++)if(known[cols[j].chave]!=null){r=known[cols[j].chave];break}x=l!=null&&r!=null?(l+r)/2:l!=null?l+50:r!=null?r-50:idx*100}
        return{chave:c.chave,x};
      }).sort((a,b)=>a.x-b.x);close();return;
    }
    if(!colX)return;
    if(/^(Total|Turno:|OP:|Item:|Data Ordem)/.test(t)||/Rioplastic|ROTINA|PÁGINA|DATA:|HORA:/.test(t)){close();return}
    const begins=/^\d{2}\/\d{2}\/\d{4}\s+\d+\s+/.test(t);
    if(!begins&&!current)return;
    if(begins){close();current={v:{},ctx:context[i]}}
    if(!current)return;
    for(const it of line.itens){const cx=it.x+(it.w||0)/2;let col=colX[0];for(const c of colX){if(cx>=c.x-6)col=c;else break}current.v[col.chave]=((current.v[col.chave]||"")+" "+it.s).trim()}
  });close();
  const out:any[]=[];
  for(const r of records){
    const v=r.v,c=r.ctx||{};
    const md=/^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d+))?$/.exec(v.data||"");
    if(md){v.data=md[1];if(md[2]&&!v.ordem)v.ordem=md[2]}
    const raw=dateBR(v.data),trn=parseInt(v.turno_col||c.turno,10)||null;
    if(!raw||!trn)continue;
    const operationalDay=trn===5?addDays(raw,-1):raw;
    if(operationalDay<start||operationalDay>end)continue;
    const mi=/^(\d+)\/(\d+)\s*-\s*(.*)$/.exec(v.item||""),tp=/^(\d+)\s*-\s*(.*)$/.exec(v.tipo_perda||"");
    const q=num(v.quantidade),p=num(v.peso);if(q==null)continue;
    out.push({
      dia:operationalDay,turno:trn,op:c.op||null,
      item_cod:c.item?.cod||(mi?mi[1]:null),item_desc:c.item?.desc||(mi?mi[3]:null),item_versao:mi?mi[2]:null,
      data:raw,ordem:v.ordem||null,acessorio:v.acessorio||null,
      tipo_perda_cod:tp?tp[1]:c.tipoGrupo?.cod||null,
      tipo_perda_desc:tp?tp[2].trim():c.tipoGrupo?.nome||v.tipo_perda||null,
      recurso_cod:c.recursoCausa?.cod||null,recurso_nome:c.recursoCausa?.nome||null,
      quantidade:q,unidade:v.un||null,peso:p
    });
  }
  return out;
}
async function insertBatches(rows:any[]){for(let i=0;i<rows.length;i+=300){const{error}=await sb.from("perdas").insert(rows.slice(i,i+300));if(error)throw new Error(error.message)}}
async function markQueue(id:string,status:string,error:any=null){const now=new Date().toISOString();await sb.from("iniflex_pdf_queue").update({status,erro:error?String(error).slice(0,1000):null,atualizado_em:now,processado_em:status==="processado"?now:null}).eq("id",id)}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:C});
  const u=new URL(req.url);let qid=String(u.searchParams.get("queue_id")||"");
  try{
    if(!(await keyOk(u)))return reply({ok:false,erro:"chave inválida"},401);
    if(!qid)return reply({ok:false,erro:"queue_id ausente"},400);
    const{data:q,error:qe}=await sb.from("iniflex_pdf_queue").select("id,codigo,arquivo,caminho,periodo_inicio,periodo_fim,exec_slot,report_id").eq("id",qid).maybeSingle();
    if(qe||!q)throw new Error(qe?.message||"fila não encontrada");
    if(String(q.codigo).toLowerCase()!=="rpcp624")throw new Error("fila não é RPCP624");
    if(!q.periodo_inicio||!q.periodo_fim)throw new Error("fila 624 sem período");
    const buf=await fetchPdf(q.caminho);
    const fileDigest=await crypto.subtle.digest("SHA-256",buf);
    const fileHash=[...new Uint8Array(fileDigest)].map(b=>b.toString(16).padStart(2,"0")).join("");
    const lib=await pdfjs(),doc=await lib.getDocument({data:new Uint8Array(buf),disableWorker:true,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0}).promise;
    const all:any[]=[];let first:any[]=[];
    for(let p=1;p<=doc.numPages;p++){const ls=await pageLines(await doc.getPage(p));all.push(...ls);if(p===1)first=ls;if(p%8===0)await new Promise(r=>setTimeout(r,0))}
    try{await doc.destroy()}catch(_){}
    const h=headerInfo(first);
    if(!/ROTINA:\s*RPCP624/i.test(h.text)&&!/Análise Detalhada de Perda/i.test(h.text))throw new Error("PDF não é RPCP624");
    const start=String(q.periodo_inicio),end=String(q.periodo_fim);
    if(h.sourceStart&&h.sourceStart>start)throw new Error(`PDF começa em ${h.sourceStart}, depois do início solicitado ${start}`);
    if(h.sourceEnd&&h.sourceEnd<end)throw new Error(`PDF termina em ${h.sourceEnd}, antes do fim solicitado ${end}`);
    const rows=parseRange(all,start,end);if(!rows.length)throw new Error("RPCP624 não produziu registros no recorte solicitado");
    const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${fileHash}|${start}|${end}|recorte-v4-content`));
    const hashHex=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
    const{data:dup}=await sb.from("importacoes").select("id,registros").eq("hash",hashHex).maybeSingle();
    if(dup){await markQueue(qid,"processado");return reply({ok:true,duplicate:true,importacao_id:dup.id,linhas:dup.registros});}
    const total={Registros:rows.length,Quantidade:+rows.reduce((a,x)=>a+Number(x.quantidade||0),0).toFixed(3),Peso:+rows.reduce((a,x)=>a+Number(x.peso||0),0).toFixed(3)};
    const msg=`OK — PDF fonte ${h.sourceStart||"?"}→${h.sourceEnd||"?"} recortado exatamente para ${start}→${end}; ${rows.length} registros gravados`;
    const{data:imp,error:ie}=await sb.from("importacoes").insert({hash:hashHex,rotina:"624",report_id:q.report_id||"624",exec_slot:q.exec_slot||null,arquivo:q.arquivo,periodo_de:start,periodo_ate:end,registros:rows.length,conf_ok:true,conf_esperado:{PeriodoSolicitado:`${start}→${end}`,FontePDF:`${h.sourceStart||"?"}→${h.sourceEnd||"?"}`},conf_obtido:total,conf_msg:msg}).select("id").single();
    if(ie||!imp)throw new Error(`importacoes: ${ie?.message||"sem id"}`);
    try{
      await insertBatches(rows.map(x=>({importacao_id:imp.id,...x})));
      const{error:de}=await sb.from("perdas").delete().gte("dia",start).lte("dia",end).neq("importacao_id",imp.id);if(de)throw new Error(`limpeza perdas: ${de.message}`);
      await sb.from("importacoes").delete().eq("rotina","624").gte("periodo_de",start).lte("periodo_ate",end).neq("id",imp.id);
      await sb.from("app_config").upsert({chave:"dados_carimbo",valor:JSON.stringify(new Date().toISOString())});
      await markQueue(qid,"processado");
      return reply({ok:true,rotina:"624",linhas:rows.length,importacao_id:imp.id,conf_ok:true,conf_msg:msg,totais:total,source:{start:h.sourceStart,end:h.sourceEnd}});
    }catch(e){await sb.from("perdas").delete().eq("importacao_id",imp.id);await sb.from("importacoes").delete().eq("id",imp.id);throw e;}
  }catch(e){const msg=e instanceof Error?e.message:String(e);if(qid)await markQueue(qid,"erro",msg);return reply({ok:false,erro:msg},200);}
});