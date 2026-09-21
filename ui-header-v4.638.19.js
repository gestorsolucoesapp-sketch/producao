/* Rioplastic v4.638.19 — atalhos visiveis sem observador recursivo */
(function(){
  'use strict';

  function exporAtalhos(){
    try{
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

      const alvo = info || opcoes || null;
      if(atalhos.parentElement !== host || atalhos.nextElementSibling !== alvo){
        host.insertBefore(atalhos, alvo);
      }
    }catch(_){}
  }

  function iniciar(){
    exporAtalhos();
    setTimeout(exporAtalhos, 150);
    setTimeout(exporAtalhos, 700);
    setTimeout(exporAtalhos, 1800);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, {once:true});
  else iniciar();
})();