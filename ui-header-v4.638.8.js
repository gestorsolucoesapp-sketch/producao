/* Rioplastic v4.638.8 — ações principais sempre visíveis no cabeçalho */
(function(){
  function exporAcoes(){
    const host=document.querySelector('#topoFixo .h-acoes');
    if(!host) return;
    const ids=['btnTema','btnAtualizar','btnDicas'];
    ids.forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.style.display='';
      el.style.visibility='visible';
      el.style.opacity='1';
      el.style.position='relative';
      el.style.zIndex='20';
      el.style.fontSize='20px';
      el.style.padding='6px';
      host.insertBefore(el,document.getElementById('rpOpcoesBtn')||null);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(exporAcoes,0));
  else setTimeout(exporAcoes,0);
  setTimeout(exporAcoes,500);
})();