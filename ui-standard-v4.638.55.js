/* Rioplastic v4.638.55 — padronização entre dispositivos */
(function(){
  'use strict';
  if(window.__RIO_STD_463855__) return;
  window.__RIO_STD_463855__ = true;

  function limparEstadoMonitor(){
    try{
      for(const storage of [localStorage,sessionStorage]){
        for(let i=storage.length-1;i>=0;i--){
          const k=storage.key(i);
          if(k && /monitor|modo[-_ ]?monitor/i.test(k)) storage.removeItem(k);
        }
      }
    }catch(_){}
  }

  function normalizarUrl(){
    try{
      const u=new URL(location.href);
      let mudou=false;
      if(u.searchParams.has('monitor')){u.searchParams.delete('monitor');mudou=true;}
      if(u.searchParams.has('modoMonitor')){u.searchParams.delete('modoMonitor');mudou=true;}
      if(mudou){
        const clean=u.pathname+(u.search||'')+(u.hash||'');
        location.replace(clean);
        return false;
      }
    }catch(_){}
    return true;
  }

  limparEstadoMonitor();
  if(!normalizarUrl()) return;

  function atualizarImportacao(){
    try{
      if(typeof window.iniflexPortalRender==='function') window.iniflexPortalRender(true);
    }catch(_){}
    try{
      if(typeof window.iniflexCicloAtualizar==='function') window.iniflexCicloAtualizar();
    }catch(_){}
  }

  function refresh(){
    atualizarImportacao();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();

  setTimeout(refresh,800);
  setTimeout(refresh,2500);
  setTimeout(refresh,6000);


  try{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.ready.then(reg=>reg.update()).catch(()=>{});
    }
  }catch(_){}
})();