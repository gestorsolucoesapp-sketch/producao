/* Rioplastic v4.638.55 — padronização entre dispositivos */
(function(){
  'use strict';
  if(window.__RIO_STD_463855__) return;
  window.__RIO_STD_463855__ = true;

  const VERSION='v4.638.55';

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

  if(!normalizarUrl()) return;

  function atualizarVersao(){
    try{
      document.querySelectorAll('span,div,b,strong,small').forEach(el=>{
        if(el.children.length) return;
        const t=String(el.textContent||'').trim();
        if(/^v4\.638\.\d+$/i.test(t)) el.textContent=VERSION;
      });
    }catch(_){}
  }

  function atualizarImportacao(){
    try{
      if(typeof window.iniflexPortalRender==='function') window.iniflexPortalRender(true);
    }catch(_){}
    try{
      if(typeof window.iniflexCicloAtualizar==='function') window.iniflexCicloAtualizar();
    }catch(_){}
  }

  function refresh(){
    atualizarVersao();
    atualizarImportacao();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();

  setTimeout(refresh,800);
  setTimeout(refresh,2500);
  setTimeout(refresh,6000);

  try{
    const mo=new MutationObserver(()=>atualizarVersao());
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),30000);
  }catch(_){}

  try{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.ready.then(reg=>reg.update()).catch(()=>{});
    }
  }catch(_){}
})();