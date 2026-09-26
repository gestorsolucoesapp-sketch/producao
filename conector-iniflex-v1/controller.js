(()=>{
  if(window.__RIO_V11_CONTROLLER__)return; window.__RIO_V11_CONTROLLER__=true;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let busy=false,lastAction=0,lastHeartbeat=0;
  const send=m=>new Promise(resolve=>chrome.runtime.sendMessage(m,r=>resolve(r||{ok:false,error:chrome.runtime.lastError?.message||'sem resposta'})));
  const out=()=>String(document.getElementById('rioOut')?.textContent||'').trim();
  const prep=()=>[...document.querySelectorAll('#iniflexApiBody *')].map(e=>String(e.textContent||'')).find(t=>/preparado no Iniflex/i.test(t))||'';
  const reportButton=id=>document.querySelector('.rioOne[data-id="'+CSS.escape(id)+'"]')||document.querySelector('.rioOne[data-code="'+CSS.escape(id)+'"]');
  const matches=(id,t)=>{
    t=String(t||'').toUpperCase();
    if(t.includes(String(id||'').toUpperCase()))return true;
    if(id==='304-PED')return t.includes('304')&&t.includes('PEDIDO');
    if(id==='304-PROP')return t.includes('304')&&t.includes('PROPOSTA');
    if(id==='002')return t.includes('002');
    return false;
  };
  const errorFor=(id,t)=>{
    t=String(t||'');
    if(!/❌|não consegui|não foi possível|falha|erro|bloqueou|rejeitou|divergente/i.test(t))return false;
    if(/Extension context invalidated|Conector reiniciou|Sessão.*expir/i.test(t))return true;
    return matches(id,t);
  };
  const retryKey=(run,id)=>'rio-v11-retry:'+run+':'+id;
  const retryCount=(run,id)=>Number(sessionStorage.getItem(retryKey(run,id))||0);
  const setRetry=(run,id,n)=>sessionStorage.setItem(retryKey(run,id),String(n));
  const clearRetry=(run,id)=>sessionStorage.removeItem(retryKey(run,id));

  async function phase(run,phase,error=null){
    return send({action:'v1-api',payload:{action:'phase',run_id:run,phase,error}});
  }
  async function fail(run,msg){
    return send({action:'v1-api',payload:{action:'fail',run_id:run,error:String(msg||'falha local').slice(0,1200)}});
  }
  async function retryPrepare(run,id,msg){
    const n=retryCount(run,id)+1;
    setRetry(run,id,n);
    if(n>3){await fail(run,'Falhou após 3 novas tentativas em '+id+': '+String(msg||'erro'));return}
    const cancel=document.getElementById('rioCancelPrepared');
    if(cancel){try{cancel.click();await sleep(700)}catch(_){}}
    await phase(run,'prepare','Retentativa '+n+'/3: '+String(msg||''));
    lastAction=Date.now();
  }

  async function tick(){
    if(busy)return;busy=true;
    try{
      const s=await send({action:'v1-status'});
      const st=s?.state;
      if(!s?.ok||!st||st.status!=='running')return;
      const run=st.run_id,id=st.report_id;
      if(!id)return;

      const proc=document.getElementById('rioProcessPrepared');
      const cancel=document.getElementById('rioCancelPrepared');
      const ptxt=prep(),ot=out();
      const now=Date.now();
      const stepAt=Date.parse(st.step_started_at||st.started_at||'')||now;
      const stepAge=Math.max(0,now-stepAt);

      if(st.phase==='prepare'){
        if(proc){
          if(matches(id,ptxt)){
            await phase(run,'process');
            proc.click();
            lastAction=now;
            return;
          }
          if(cancel&&now-lastAction>1200){
            cancel.click();
            lastAction=now;
            await sleep(700);
            return;
          }
        }
        const b=reportButton(id);
        if(!b){
          if(stepAge>60000)await fail(run,'Botão '+id+' não apareceu no app em 60 s');
          return;
        }
        if(!b.disabled&&now-lastAction>2500){
          await phase(run,'waiting');
          b.click();
          lastAction=now;
          return;
        }
      }else if(st.phase==='waiting'){
        if(proc&&matches(id,ptxt)){
          await phase(run,'process');
          proc.click();
          lastAction=now;
          return;
        }
        if(errorFor(id,ot)&&now-lastAction>5000){
          await retryPrepare(run,id,ot);
          return;
        }
        if(stepAge>180000){
          await retryPrepare(run,id,'tempo limite preparando '+id);
          return;
        }
      }else if(st.phase==='process'){
        const c=await send({action:'v1-api',payload:{action:'confirm',run_id:run}});
        if(c?.ready){
          clearRetry(run,id);
          lastAction=now;
          return;
        }
        if(c?.check?.queue?.status==='erro'){
          await retryPrepare(run,id,c.check.error||'fila em erro');
          return;
        }
        if(errorFor(id,ot)&&now-lastAction>8000){
          await retryPrepare(run,id,ot);
          return;
        }
        if(stepAge>50*60*1000){
          await fail(run,'Tempo limite processando '+id);
          return;
        }
      }

      if(now-lastHeartbeat>10000){
        lastHeartbeat=now;
        await send({action:'v1-api',payload:{action:'heartbeat',run_id:run}});
      }
    }catch(e){console.error('RIO Supervisor v1.1',e)}
    finally{busy=false}
  }
  setInterval(tick,2500);
  setTimeout(tick,1000);
})();