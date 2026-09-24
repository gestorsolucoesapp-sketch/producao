(()=>{
  if(window.__RIO_V1_CONTROLLER__)return; window.__RIO_V1_CONTROLLER__=true;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let busy=false,lastAction=0;
  const send=m=>new Promise(resolve=>chrome.runtime.sendMessage(m,r=>resolve(r||{ok:false,error:chrome.runtime.lastError?.message||'sem resposta'})));
  const bodyText=()=>String(document.body?.innerText||'').replace(/\s+/g,' ').trim();
  const out=()=>String(document.getElementById('rioOut')?.textContent||'').trim();
  const prep=()=>[...document.querySelectorAll('#iniflexApiBody *')].map(e=>String(e.textContent||'')).find(t=>/preparado no Iniflex/i.test(t))||'';
  const reportButton=id=>document.querySelector('.rioOne[data-id="'+CSS.escape(id)+'"]')||document.querySelector('.rioOne[data-code="'+CSS.escape(id)+'"]');
  const matches=(id,t)=>{
    t=String(t||'').toUpperCase();
    if(t.includes(id))return true;
    if(id==='304-PED')return t.includes('304')&&t.includes('PEDIDO');
    if(id==='304-PROP')return t.includes('304')&&t.includes('PROPOSTA');
    return false;
  };
  async function phase(run,phase,error=null){
    return send({action:'v1-api',payload:{action:'phase',run_id:run,phase,error}});
  }
  async function fail(run,msg){
    return send({action:'v1-api',payload:{action:'fail',run_id:run,error:String(msg||'falha local').slice(0,1200)}});
  }
  async function tick(){
    if(busy)return;busy=true;
    try{
      const s=await send({action:'v1-status'});
      const st=s?.state;
      if(!s?.ok||!st||st.status!=='running')return;
      const run=st.run_id,id=st.report_id;
      if(!id)return;
      const proc=document.getElementById('rioProcessPrepared'),cancel=document.getElementById('rioCancelPrepared');
      const ptxt=prep(),ot=out(),bt=bodyText();
      const now=Date.now();
      if(st.phase==='prepare'){
        if(proc){
          if(matches(id,ptxt)){await phase(run,'process');proc.click();lastAction=now;return}
          if(cancel){cancel.click();lastAction=now;await sleep(1200);return}
        }
        const b=reportButton(id);
        if(!b){await fail(run,'Motor local v0.8 não encontrado no app: botão '+id+' ausente');return}
        if(!b.disabled&&now-lastAction>3000){
          await phase(run,'waiting');
          b.click();lastAction=now;return;
        }
      }else if(st.phase==='waiting'){
        if(proc&&matches(id,ptxt)){await phase(run,'process');proc.click();lastAction=now;return}
        if(/não consegui|não foi possível|falha|erro|bloqueou|rejeitou/i.test(ot) && now-lastAction>5000){await fail(run,ot);return}
        if(st.updated_at && Date.now()-Date.parse(st.updated_at)>120000){await fail(run,'Tempo limite preparando '+id);return}
      }else if(st.phase==='process'){
        if(/❌|não foi possível|falha|erro|bloqueou|rejeitou/i.test(ot) && !/0 erro/i.test(ot)){await fail(run,ot);return}
        const c=await send({action:'v1-api',payload:{action:'confirm',run_id:run}});
        if(c?.ready){lastAction=now;return}
        if(c?.check?.queue?.status==='erro'){await fail(run,c.check.error||'fila em erro');return}
        if(st.updated_at && Date.now()-Date.parse(st.updated_at)>2700000){await fail(run,'Tempo limite processando '+id);return}
      }
      await send({action:'v1-api',payload:{action:'heartbeat',run_id:run}});
    }catch(e){console.error('RIO v1',e)}finally{busy=false}
  }
  setInterval(tick,2500);setTimeout(tick,1200);
})();