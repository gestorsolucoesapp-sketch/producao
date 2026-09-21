/* Rioplastic v4.638.17 — corrige navegação por áreas e posição do letreiro */
(function(){
  'use strict';

  const PADRAO = [
    {id:'producao',nome:'Produção',abas:['plano','chao','painel','analise','analisemais','estrategia','oee','metas','ano']},
    {id:'planejamento',nome:'Planejamento e estoque',abas:['programacao','demanda','estoque','comercial','conf','anrec']},
    {id:'rotina',nome:'Rotina e manutenção',abas:['tarefas','manut','tintas','rotulos','mapaproc']},
    {id:'pessoas',nome:'Pessoas e gestão',abas:['organograma','rh','fcar']},
    {id:'administracao',nome:'Administração',abas:['importar','historico','usuarios','ferramentas']}
  ];
  let CFG = null, painelAberto = '', cfgEdit = null;

  const $ = id => document.getElementById(id);
  const clone = x => JSON.parse(JSON.stringify(x));
  const slug = v => String(v||'area').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || ('area-'+Date.now());

  function css(){
    if($('rpNav15Css')) return;
    const st=document.createElement('style'); st.id='rpNav15Css';
    st.textContent=`
      #rpAreaBlocos,#rpAreaItens,#rpCompactAreaBtn,#rpCompactMenu,#rpMenuBtn,#rpAreaAtual,#rpQuickNav{display:none!important}
      #topoFixo nav{position:relative;background:#fff;border-bottom:1px solid var(--linha);z-index:25}
      #rpNav15{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;padding:7px 10px;background:#fff}
      #rpNav15::-webkit-scrollbar{display:none}
      #rpNav15>button{flex:0 0 auto;border:1px solid var(--linha);background:#fff;color:var(--navy);border-radius:10px;padding:7px 11px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
      #rpNav15>button.ativa,#rpNav15>button[aria-expanded="true"]{background:var(--navy);border-color:var(--navy);color:#fff}
      #rpNav15Drop{position:absolute;left:10px;right:auto;top:calc(100% + 5px);z-index:9998;display:none;min-width:230px;max-width:min(92vw,540px);background:#fff;border:1px solid var(--linha);border-radius:12px;box-shadow:0 16px 38px rgba(11,42,74,.20);padding:7px;gap:6px;flex-wrap:wrap}
      #rpNav15Drop.aberto{display:flex}
      #rpNav15Drop button{border:1px solid var(--linha);background:#fff;color:var(--txt-2);border-radius:9px;padding:8px 10px;font-size:12px;font-weight:750;cursor:pointer;white-space:nowrap}
      #rpNav15Drop button.ativa{background:#e6f4ec;border-color:#b4dcc5;color:#066c38}
      #letreiroNav{order:0;margin:0!important}
      #topoFixo nav{order:1}
      #rpAreaCfgCard .rp-area-row{display:grid;grid-template-columns:minmax(160px,1fr) auto auto auto;gap:6px;align-items:center;padding:7px 0;border-bottom:1px solid var(--linha)}
      #rpAreaCfgCard .rp-area-row input{width:100%;padding:8px 9px;border:1px solid var(--borda);border-radius:9px;font-size:13px;box-sizing:border-box}
      #rpAreaCfgCard .rp-area-row button{width:auto;padding:7px 9px}
      #rpAreaCfgCard .rp-tab-map{display:grid;grid-template-columns:minmax(180px,1fr) minmax(170px,260px);gap:7px;align-items:center;padding:6px 0;border-bottom:1px solid var(--linha)}
      #rpAreaCfgCard .rp-tab-map select{width:100%;padding:8px;border:1px solid var(--borda);border-radius:9px;background:#fff}
      @media(max-width:680px){
        #rpNav15{padding:5px 7px;gap:5px}
        #rpNav15>button{font-size:11px;padding:6px 9px}
        #rpNav15Drop{left:7px;min-width:240px}
        #rpAreaCfgCard .rp-area-row{grid-template-columns:1fr auto auto auto}
        #rpAreaCfgCard .rp-tab-map{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(st);
  }

  function moverLetreiro(){
    const topo=$('topoFixo'), ticker=$('letreiroNav'), nav=topo&&topo.querySelector('nav');
    if(topo&&ticker&&nav&&ticker.nextElementSibling!==nav) topo.insertBefore(ticker,nav);
  }

  function abasDom(){
    const seen=new Set(), out=[];
    document.querySelectorAll('.aba[data-aba]').forEach(b=>{
      const id=b.dataset.aba; if(!id||seen.has(id)) return; seen.add(id);
      out.push({id,nome:b.textContent.trim()||id,el:b});
    });
    return out;
  }

  async function carregarCfg(force){
    if(CFG&&!force) return CFG;
    try{
      const {data,error}=await sb.from('app_config').select('valor').eq('chave','nav_areas_v1').maybeSingle();
      if(error) throw error;
      const v=data&&data.valor?JSON.parse(data.valor):null;
      CFG=Array.isArray(v)&&v.length?v:clone(PADRAO);
    }catch(_){ CFG=clone(PADRAO); }
    return CFG;
  }

  function grupoDoAtivo(){
    const a=document.querySelector('#rpNavDialog .aba.ativa')||document.querySelector('.aba.ativa[data-aba]');
    const id=a&&a.dataset&&a.dataset.aba;
    return (CFG||[]).find(g=>(g.abas||[]).includes(id))||null;
  }

  function montarNav(){
    const nav=document.querySelector('#topoFixo nav'), bar=nav&&nav.querySelector('.rp-nav-bar');
    if(!nav||!bar||!CFG) return;
    let host=$('rpNav15'); if(!host){host=document.createElement('div');host.id='rpNav15';bar.appendChild(host);}
    let drop=$('rpNav15Drop'); if(!drop){drop=document.createElement('div');drop.id='rpNav15Drop';nav.appendChild(drop);}
    host.replaceChildren();
    const ativo=grupoDoAtivo();
    (CFG||[]).forEach(g=>{
      const tabs=(g.abas||[]).map(id=>abasDom().find(x=>x.id===id)).filter(x=>x&&x.el&&!x.el.classList.contains('oculto')&&x.el.style.display!=='none');
      if(!tabs.length) return;
      const b=document.createElement('button'); b.type='button'; b.textContent=g.nome+' ▾'; b.dataset.area=g.id;
      if(ativo&&ativo.id===g.id) b.classList.add('ativa');
      b.setAttribute('aria-expanded',String(painelAberto===g.id));
      b.onclick=e=>{
        e.stopPropagation();
        painelAberto=painelAberto===g.id?'':g.id;
        montarNav();
      };
      host.appendChild(b);
    });
    drop.replaceChildren();
    const g=(CFG||[]).find(x=>x.id===painelAberto);
    if(g){
      const btnArea=host.querySelector('[data-area="'+CSS.escape(g.id)+'"]');
      if(btnArea){
        const r=btnArea.getBoundingClientRect(), nr=nav.getBoundingClientRect();
        drop.style.left=Math.max(7,Math.min(r.left-nr.left, Math.max(7,nr.width-260)))+'px';
      }
      (g.abas||[]).forEach(id=>{
        const t=abasDom().find(x=>x.id===id); if(!t||!t.el||t.el.classList.contains('oculto')||t.el.style.display==='none') return;
        const q=document.createElement('button'); q.type='button';q.textContent=t.nome;
        if(t.el.classList.contains('ativa')) q.classList.add('ativa');
        q.onclick=()=>{t.el.click();painelAberto='';setTimeout(montarNav,0);};
        drop.appendChild(q);
      });
      drop.classList.add('aberto');
    }else drop.classList.remove('aberto');
  }

  function fecharFora(e){
    const host=$('rpNav15'),drop=$('rpNav15Drop');
    if(painelAberto && (!host||!host.contains(e.target)) && (!drop||!drop.contains(e.target))){
      painelAberto=''; montarNav();
    }
  }

  function telaLista(){
    return abasDom().map(x=>({id:x.id,nome:x.nome})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  }

  function renderEditor(){
    const card=$('rpAreaCfgCard'); if(!card||!cfgEdit) return;
    const areas=$('rpAreaCfgAreas'), mapa=$('rpAreaCfgMapa'); if(!areas||!mapa)return;
    areas.innerHTML='';
    cfgEdit.forEach((g,i)=>{
      const row=document.createElement('div');row.className='rp-area-row';
      row.innerHTML='<input value="'+String(g.nome||'').replace(/"/g,'&quot;')+'" data-nome="'+i+'">'
        +'<button class="btn btn-borda" data-up="'+i+'" title="subir">↑</button>'
        +'<button class="btn btn-borda" data-down="'+i+'" title="descer">↓</button>'
        +'<button class="btn btn-borda" data-del="'+i+'" title="excluir">🗑️</button>';
      areas.appendChild(row);
    });
    areas.querySelectorAll('[data-nome]').forEach(inp=>inp.oninput=()=>{cfgEdit[+inp.dataset.nome].nome=inp.value;});
    areas.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.up;if(i>0){[cfgEdit[i-1],cfgEdit[i]]=[cfgEdit[i],cfgEdit[i-1]];renderEditor();}});
    areas.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{const i=+b.dataset.down;if(i<cfgEdit.length-1){[cfgEdit[i+1],cfgEdit[i]]=[cfgEdit[i],cfgEdit[i+1]];renderEditor();}});
    areas.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const i=+b.dataset.del;if(!confirm('Excluir a área '+cfgEdit[i].nome+'? As telas dela ficarão fora da barra até você escolher outra área.'))return;cfgEdit.splice(i,1);renderEditor();});

    mapa.innerHTML='';
    telaLista().forEach(t=>{
      const row=document.createElement('div');row.className='rp-tab-map';
      const sel=document.createElement('select');
      sel.innerHTML='<option value="">— fora da barra —</option>'+cfgEdit.map(g=>'<option value="'+g.id+'">'+g.nome+'</option>').join('');
      const atual=cfgEdit.find(g=>(g.abas||[]).includes(t.id)); sel.value=atual?atual.id:'';
      sel.onchange=()=>{
        cfgEdit.forEach(g=>g.abas=(g.abas||[]).filter(x=>x!==t.id));
        const g=cfgEdit.find(x=>x.id===sel.value); if(g){g.abas=g.abas||[];g.abas.push(t.id);}
      };
      row.innerHTML='<b style="font-size:12.5px;color:var(--txt-2)">'+t.nome+'</b>';row.appendChild(sel);mapa.appendChild(row);
    });
  }

  function montarEditor(){
    const sec=$('abaUsuarios'); if(!sec||$('rpAreaCfgCard')) return;
    const card=document.createElement('div');card.className='card';card.id='rpAreaCfgCard';
    card.innerHTML='<div class="titulo-sec">🧭 Áreas da barra superior</div>'
      +'<p class="desc" style="margin-bottom:10px">Crie os blocos que quiser e escolha em qual bloco cada tela aparece. Isso altera só a organização da barra; as permissões de acesso de cada usuário continuam separadas.</p>'
      +'<div id="rpAreaCfgAreas"></div>'
      +'<div style="display:flex;gap:7px;margin:10px 0 14px"><input id="rpNovaArea" placeholder="Ex.: Processo" style="flex:1;padding:9px;border:1px solid var(--borda);border-radius:9px"><button class="btn btn-borda" style="width:auto" id="rpAddArea">+ Criar área</button></div>'
      +'<div style="font-weight:800;color:var(--navy);font-size:13px;margin:8px 0">Onde cada tela aparece</div><div id="rpAreaCfgMapa"></div>'
      +'<div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-verde" style="width:auto" id="rpSalvarAreas">💾 Salvar áreas</button><button class="btn btn-borda" style="width:auto" id="rpResetAreas">Restaurar padrão</button></div>';
    sec.insertBefore(card,sec.firstElementChild);
    cfgEdit=clone(CFG||PADRAO); renderEditor();
    $('rpAddArea').onclick=()=>{
      const inp=$('rpNovaArea'), nome=(inp.value||'').trim(); if(!nome)return;
      let id=slug(nome), n=2; while(cfgEdit.some(g=>g.id===id)) id=slug(nome)+'-'+n++;
      cfgEdit.push({id,nome,abas:[]});inp.value='';renderEditor();
    };
    $('rpResetAreas').onclick=()=>{if(confirm('Restaurar os blocos padrão?')){cfgEdit=clone(PADRAO);renderEditor();}};
    $('rpSalvarAreas').onclick=async()=>{
      cfgEdit.forEach((g,i)=>{g.nome=(g.nome||('Área '+(i+1))).trim();g.abas=[...new Set(g.abas||[])];});
      try{
        const {error}=await sb.from('app_config').upsert({chave:'nav_areas_v1',valor:JSON.stringify(cfgEdit)},{onConflict:'chave'}); if(error) throw error;
        CFG=clone(cfgEdit); painelAberto=''; montarNav(); try{toast('✅ Áreas salvas');}catch(_){}
      }catch(e){try{toast('❌ '+((e&&e.message)||e));}catch(_){}}
    };
  }

  async function iniciar(){
    css(); moverLetreiro(); await carregarCfg(false);
    setTimeout(()=>{moverLetreiro();montarNav(); if(typeof souAdmin!=='undefined'&&souAdmin) montarEditor();},120);
    setTimeout(()=>{moverLetreiro();montarNav(); if(typeof souAdmin!=='undefined'&&souAdmin) montarEditor();},800);
    document.addEventListener('click',fecharFora);
    const d=$('rpNavDialog'); if(d)new MutationObserver(()=>montarNav()).observe(d,{subtree:true,attributes:true,attributeFilter:['class','style']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();