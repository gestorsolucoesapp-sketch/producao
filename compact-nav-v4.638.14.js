/* Rioplastic v4.638.14 — menu de áreas compacto */
(function(){
  'use strict';
  let aberto=false, grupoAberto='';

  function $(id){return document.getElementById(id);}
  function vis(b){return b && !b.classList.contains('oculto') && b.style.display!=='none';}
  function nomeGrupo(g){const h=g&&g.querySelector('h3');return h?h.textContent.trim():'';}

  function css(){
    if($('rpCompactCss')) return;
    const s=document.createElement('style'); s.id='rpCompactCss';
    s.textContent=`
      #rpAreaBlocos,#rpAreaItens{display:none!important}
      #rpCompactAreaBtn{border:1px solid var(--linha);background:#fff;border-radius:10px;padding:7px 11px;font-size:12px;font-weight:800;color:var(--navy);cursor:pointer;white-space:nowrap}
      #rpCompactAreaBtn[aria-expanded="true"]{background:var(--navy);color:#fff;border-color:var(--navy)}
      #rpCompactMenu{position:absolute;z-index:9998;top:calc(100% + 6px);left:0;min-width:280px;max-width:min(92vw,520px);background:#fff;border:1px solid var(--linha);border-radius:13px;box-shadow:0 14px 35px rgba(11,42,74,.18);padding:8px;display:none}
      #rpCompactMenu.aberto{display:block}
      #rpCompactMenu .rp-cg{border:1px solid var(--linha);border-radius:10px;overflow:hidden;margin:6px 0}
      #rpCompactMenu .rp-cg-head{width:100%;border:0;background:var(--leve-s);padding:9px 11px;text-align:left;font-weight:800;color:var(--navy);cursor:pointer;display:flex;justify-content:space-between;align-items:center}
      #rpCompactMenu .rp-cg-itens{display:none;padding:6px;background:#fff;gap:5px;flex-wrap:wrap}
      #rpCompactMenu .rp-cg.aberta .rp-cg-itens{display:flex}
      #rpCompactMenu .rp-cg-itens button{border:1px solid var(--linha);background:#fff;border-radius:9px;padding:7px 10px;font-size:12px;font-weight:700;color:var(--txt-2);cursor:pointer}
      #rpCompactMenu .rp-cg-itens button.ativa{background:#e6f4ec;border-color:#b4dcc5;color:#066c38}
      #topoFixo nav .rp-nav-bar{position:relative;display:flex;align-items:center;gap:7px}
      #rpAreaAtual{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
      @media(max-width:680px){#rpCompactAreaBtn{font-size:11px;padding:6px 9px}#rpAreaAtual{max-width:120px}#rpCompactMenu{min-width:260px;left:0}}
    `;
    document.head.appendChild(s);
  }

  function grupos(){
    const d=$('rpNavDialog');
    return d?[...d.querySelectorAll('.rp-nav-grupo')].filter(g=>[...g.querySelectorAll('.aba')].some(vis)):[];
  }
  function ativo(){
    const d=$('rpNavDialog'); if(!d)return null;
    const a=d.querySelector('.aba.ativa'); return a?a.closest('.rp-nav-grupo'):null;
  }
  function desenhar(){
    const m=$('rpCompactMenu'), b=$('rpCompactAreaBtn'); if(!m||!b)return;
    const ag=ativo(), atual=nomeGrupo(ag)||'Áreas';
    b.textContent=atual+' ▾';
    if(!grupoAberto) grupoAberto=atual;
    m.replaceChildren();
    grupos().forEach(g=>{
      const n=nomeGrupo(g), box=document.createElement('div'); box.className='rp-cg'+(n===grupoAberto?' aberta':'');
      const h=document.createElement('button'); h.type='button'; h.className='rp-cg-head'; h.innerHTML='<span>'+n+'</span><span>'+(n===grupoAberto?'▴':'▾')+'</span>';
      const itens=document.createElement('div'); itens.className='rp-cg-itens';
      [...g.querySelectorAll('.aba')].filter(vis).forEach(orig=>{
        const q=document.createElement('button');q.type='button';q.textContent=orig.textContent.trim();
        if(orig.classList.contains('ativa')) q.classList.add('ativa');
        q.onclick=()=>{orig.click(); aberto=false; m.classList.remove('aberto'); b.setAttribute('aria-expanded','false'); setTimeout(desenhar,0);};
        itens.appendChild(q);
      });
      h.onclick=()=>{grupoAberto=(grupoAberto===n?'':n);desenhar();};
      box.append(h,itens);m.appendChild(box);
    });
  }
  function montar(){
    css();
    const bar=document.querySelector('#topoFixo nav .rp-nav-bar');
    if(!bar || $('rpCompactAreaBtn')) return;
    const btn=document.createElement('button');btn.type='button';btn.id='rpCompactAreaBtn';btn.setAttribute('aria-expanded','false');
    const menu=document.createElement('div');menu.id='rpCompactMenu';
    btn.onclick=(e)=>{e.stopPropagation();aberto=!aberto;menu.classList.toggle('aberto',aberto);btn.setAttribute('aria-expanded',String(aberto));if(aberto)desenhar();};
    bar.insertBefore(btn,$('rpAreaAtual'));
    bar.appendChild(menu);
    document.addEventListener('click',e=>{if(aberto && !menu.contains(e.target) && e.target!==btn){aberto=false;menu.classList.remove('aberto');btn.setAttribute('aria-expanded','false');}});
    const d=$('rpNavDialog'); if(d)new MutationObserver(()=>desenhar()).observe(d,{subtree:true,attributes:true,attributeFilter:['class','style']});
    desenhar();
  }
  function start(){setTimeout(montar,0);setTimeout(montar,500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();