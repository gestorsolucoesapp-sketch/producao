/* Rioplastic v4.638.18 — expõe atalhos de aplicativos no cabeçalho */
(function(){
  'use strict';

  function exporAtalhos(){
    const host = document.querySelector('#topoFixo .h-acoes');
    const atalhos = document.getElementById('atalhoApps');
    const opcoes = document.getElementById('rpOpcoesBtn');
    const info = document.getElementById('btnDicas');
    if(!host || !atalhos) return;

    atalhos.style.display = 'flex';
    atalhos.style.alignItems = 'center';
    atalhos.style.justifyContent = 'center';
    atalhos.style.gap = '4px';
    atalhos.style.width = 'auto';
    atalhos.style.minHeight = '36px';
    atalhos.style.padding = '0';
    atalhos.style.margin = '0';
    atalhos.style.background = 'transparent';
    atalhos.style.border = '0';
    atalhos.style.position = 'relative';
    atalhos.style.inset = 'auto';
    atalhos.style.transform = 'none';
    atalhos.style.float = 'none';
    atalhos.style.zIndex = '20';

    atalhos.querySelectorAll('button,a').forEach(el=>{
      el.style.display = '';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      el.style.position = 'relative';
      el.style.inset = 'auto';
      el.style.transform = 'none';
      el.style.margin = '0';
      el.style.padding = '5px';
      el.style.minWidth = '34px';
      el.style.minHeight = '34px';
      el.style.width = 'auto';
      el.style.background = 'transparent';
      el.style.border = '0';
      el.style.boxShadow = 'none';
      el.style.fontSize = '20px';
      el.style.lineHeight = '1';
    });

    /* João pediu os atalhos imediatamente antes do ícone de informação e dos ... */
    host.insertBefore(atalhos, info || opcoes || null);
  }

  function iniciar(){
    exporAtalhos();
    setTimeout(exporAtalhos, 100);
    setTimeout(exporAtalhos, 500);
    setTimeout(exporAtalhos, 1200);

    const host = document.querySelector('#topoFixo .h-acoes');
    if(host){
      const obs = new MutationObserver(()=>exporSeguro());
      function exporSeguro(){ try{ exporAtalhos(); }catch(_){} }
      obs.observe(host,{childList:true,subtree:true});
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();