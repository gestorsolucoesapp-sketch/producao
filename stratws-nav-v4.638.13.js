/* Rioplastic v4.638.13 — navegação por blocos + central de demandas Stratws */
(function(){
  'use strict';

  const AREA_LABELS = [
    ['Produção', ['plano','chao','painel','analise','analisemais','estrategia','oee','metas','ano']],
    ['Planejamento e estoque', ['programacao','demanda','estoque','comercial','conf','anrec']],
    ['Rotina e manutenção', ['tarefas','manut','tintas','rotulos','mapaproc']],
    ['Pessoas e gestão', ['organograma','rh','fcar']],
    ['Administração', ['importar','historico','usuarios','ferramentas']]
  ];

  function el(id){ return document.getElementById(id); }
  function esc(v){ try { return escapeHtml(String(v == null ? '' : v)); } catch(_) { return String(v == null ? '' : v).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); } }
  function agora(){ return new Date().toISOString(); }
  function hoje(){ try { return typeof hojeISO === 'function' ? hojeISO() : new Date().toISOString().slice(0,10); } catch(_) { return new Date().toISOString().slice(0,10); } }
  function pct(v){ v = Math.max(0, Math.min(100, Number(v)||0)); return v; }

  function instalarCss(){
    if (el('rpV463813Css')) return;
    const st = document.createElement('style');
    st.id = 'rpV463813Css';
    st.textContent = `
      #rpAreaBlocos,#rpAreaItens{display:flex;align-items:center;gap:6px;padding:6px 12px;background:#fff;border-top:1px solid var(--linha);overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      #rpAreaBlocos::-webkit-scrollbar,#rpAreaItens::-webkit-scrollbar{display:none}
      #rpAreaBlocos button,#rpAreaItens button{flex:0 0 auto;white-space:nowrap;border:1px solid var(--linha);border-radius:10px;background:var(--leve-s);color:var(--txt-2);min-height:34px;padding:6px 11px;font-size:12px;font-weight:750}
      #rpAreaBlocos button.ativa{background:var(--navy);border-color:var(--navy);color:#fff}
      #rpAreaItens button.ativa{background:#e6f4ec;border-color:#b4dcc5;color:#066c38}
      body.rp-organizado #rpQuickNav{display:none!important}
      @media(max-width:680px){#rpAreaBlocos,#rpAreaItens{padding:5px 8px;gap:5px}#rpAreaBlocos button,#rpAreaItens button{font-size:11px;padding:6px 9px}}
      .rp-stratws-resumo{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0 10px}
      .rp-stratws-kpi{background:var(--leve-s);border:1px solid var(--linha);border-radius:11px;padding:10px;text-align:center}
      .rp-stratws-kpi b{display:block;font-size:20px;color:var(--navy);line-height:1.1}.rp-stratws-kpi span{font-size:10px;color:var(--fraco);text-transform:uppercase;font-weight:800;letter-spacing:.04em}
      .rp-stratws-box{margin-top:10px;padding:10px 11px;border:1px solid var(--linha);border-radius:11px;background:#fbfdff}
      .rp-stratws-cab{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--fraco);margin-bottom:5px}
      .rp-stratws-cab b{font-size:13px;color:var(--navy)}
      .rp-stratws-bar{width:100%;accent-color:var(--verde)}
      .rp-stratws-obs{width:100%;min-height:58px;margin-top:7px;padding:8px 9px;border:1px solid var(--borda);border-radius:9px;font:inherit;font-size:13px;background:#fff;resize:vertical;box-sizing:border-box}
      .rp-stratws-acoes{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.rp-stratws-acoes button{width:auto!important;padding:7px 10px!important;font-size:12px!important}
      .rp-stratws-sync{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800;background:var(--leve);color:var(--fraco)}
      .rp-stratws-sync.ok{background:#e6f4ec;color:#066c38}.rp-stratws-sync.pend{background:#fff3d6;color:#946100}.rp-stratws-sync.err{background:#fdecec;color:#a62f2f}
      @media(max-width:680px){.rp-stratws-resumo{grid-template-columns:repeat(2,minmax(0,1fr))}.rp-stratws-acoes button{flex:1 1 46%}}
    `;
    document.head.appendChild(st);
  }

  let areaEscolhida = null;
  function gruposDisponiveis(){
    const d = el('rpNavDialog');
    if (!d) return [];
    return [...d.querySelectorAll('.rp-nav-grupo')].filter(g => {
      return [...g.querySelectorAll('.aba')].some(b => !b.classList.contains('oculto') && b.style.display !== 'none');
    });
  }
  function nomeGrupo(g){ const h=g && g.querySelector('h3'); return h ? h.textContent.trim() : ''; }
  function grupoAtivo(){
    const d=el('rpNavDialog'); if(!d) return null;
    const a=d.querySelector('.aba.ativa'); return a ? a.closest('.rp-nav-grupo') : null;
  }
  function renderItensGrupo(g){
    const sub=el('rpAreaItens'); if(!sub) return;
    sub.replaceChildren();
    if(!g) return;
    [...g.querySelectorAll('.aba')].filter(b=>!b.classList.contains('oculto') && b.style.display!=='none').forEach(orig=>{
      const b=document.createElement('button'); b.type='button'; b.textContent=orig.textContent.trim();
      if(orig.classList.contains('ativa')) b.classList.add('ativa');
      b.addEventListener('click',()=>{ orig.click(); areaEscolhida=nomeGrupo(g); setTimeout(renderAreasTopo,0); });
      sub.appendChild(b);
    });
  }
  function renderAreasTopo(){
    const blocos=el('rpAreaBlocos'), d=el('rpNavDialog'); if(!blocos||!d) return;
    const grupos=gruposDisponiveis(); const ativo=grupoAtivo();
    if(!areaEscolhida || !grupos.some(g=>nomeGrupo(g)===areaEscolhida)) areaEscolhida=nomeGrupo(ativo||grupos[0]);
    blocos.replaceChildren();
    grupos.forEach(g=>{
      const n=nomeGrupo(g); const b=document.createElement('button'); b.type='button'; b.textContent=n;
      if(n===areaEscolhida) b.classList.add('ativa');
      b.addEventListener('click',()=>{ areaEscolhida=n; renderAreasTopo(); });
      blocos.appendChild(b);
    });
    const sel=grupos.find(g=>nomeGrupo(g)===areaEscolhida) || ativo || grupos[0];
    renderItensGrupo(sel);
  }
  function iniciarAreasTopo(){
    const nav=document.querySelector('#topoFixo nav'); const bar=nav&&nav.querySelector('.rp-nav-bar');
    if(!bar || el('rpAreaBlocos')) return;
    const blocos=document.createElement('div'); blocos.id='rpAreaBlocos'; blocos.setAttribute('aria-label','Blocos do aplicativo');
    const itens=document.createElement('div'); itens.id='rpAreaItens'; itens.setAttribute('aria-label','Telas do bloco selecionado');
    bar.insertAdjacentElement('afterend',blocos); blocos.insertAdjacentElement('afterend',itens);
    renderAreasTopo();
    const d=el('rpNavDialog');
    if(d){
      const mo=new MutationObserver(()=>renderAreasTopo());
      mo.observe(d,{subtree:true,attributes:true,attributeFilter:['class','style']});
    }
  }

  function statusSync(f){
    const s=String(f.sincronizacao_status||'local');
    if(s==='sincronizado') return ['ok','🟢 sincronizado'];
    if(s==='pendente') return ['pend','🟡 pendente'];
    if(s==='erro') return ['err','🔴 erro'];
    return ['','⚪ somente Rioplastic'];
  }
  function painelResumoStratws(){
    const L=(typeof _fcarLista!=='undefined'&&_fcarLista)||[];
    const vivos=L.filter(f=>f.status!=='descartado');
    const concl=vivos.filter(f=>f.status==='concluido').length;
    const and=vivos.filter(f=>f.status!=='concluido' && (Number(f.progresso)||0)>0).length;
    const media=vivos.length ? Math.round(vivos.reduce((a,f)=>a+pct(f.progresso),0)/vivos.length) : 0;
    return '<div class="card" id="rpStratwsCentral">'
      +'<div class="titulo-sec">🎯 Central Stratws · demandas</div>'
      +'<p class="desc" style="margin:-2px 0 8px">Acompanhe o andamento aqui. Progresso, comentário e conclusão ficam registrados no Rioplastic. A tarefa pode ser vinculada ao link/ID do Stratws para acesso rápido.</p>'
      +'<div class="rp-stratws-resumo">'
      +'<div class="rp-stratws-kpi"><b>'+vivos.length+'</b><span>demandas</span></div>'
      +'<div class="rp-stratws-kpi"><b>'+and+'</b><span>em andamento</span></div>'
      +'<div class="rp-stratws-kpi"><b>'+concl+'</b><span>concluídas</span></div>'
      +'<div class="rp-stratws-kpi"><b>'+media+'%</b><span>progresso médio</span></div>'
      +'</div>'
      +'<div style="display:flex;gap:7px;flex-wrap:wrap">'
      +'<button class="btn btn-borda" style="width:auto;padding:8px 12px;font-size:12px" onclick="fcarAbrir()">🔄 Atualizar painel</button>'
      +'<button class="btn btn-borda" style="width:auto;padding:8px 12px;font-size:12px" onclick="window.open(FCAR_STRATWS,\'_blank\',\'noopener\')">🔗 Abrir Stratws</button>'
      +'</div>'
      +'<p class="desc" style="margin-top:8px;font-size:11px">🔐 A senha do Stratws não é gravada neste app. A sincronização automática com o Stratws exige a autorização oficial da conta; enquanto ela não estiver configurada, o app mantém o histórico local e abre a tarefa vinculada no Stratws.</p>'
      +'</div>';
  }

  const cardBase = (typeof _fcarCardSalvo==='function') ? _fcarCardSalvo : null;
  if(cardBase){
    window._fcarCardSalvo=function(f){
      const base=cardBase(f); const p=pct(f.progresso); const ss=statusSync(f);
      const extra='<div class="rp-stratws-box">'
        +'<div class="rp-stratws-cab"><b>Andamento da demanda</b><span id="rpProgTxt-'+f.id+'">'+p+'%</span></div>'
        +'<input class="rp-stratws-bar" id="rpProg-'+f.id+'" type="range" min="0" max="100" step="5" value="'+p+'" oninput="rpFcarPrev(\''+f.id+'\',this.value)">'
        +'<textarea class="rp-stratws-obs" id="rpObs-'+f.id+'" placeholder="Comentário / evidência da atualização">'+esc(f.observacao||'')+'</textarea>'
        +'<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:7px"><span class="rp-stratws-sync '+ss[0]+'">'+ss[1]+'</span>'
        +(f.stratws_id ? '<span style="font-size:10px;color:var(--fraco)">ID '+esc(f.stratws_id)+'</span>' : '')+'</div>'
        +'<div class="rp-stratws-acoes">'
        +'<button class="btn btn-navy" onclick="rpFcarSalvarAndamento(\''+f.id+'\')">💾 Salvar andamento</button>'
        +(f.status!=='concluido' ? '<button class="btn btn-verde" onclick="rpFcarConcluir(\''+f.id+'\')">✅ Concluir demanda</button>' : '')
        +'<button class="btn btn-borda" onclick="rpFcarHistorico(\''+f.id+'\')">🕘 Histórico</button>'
        +'<button class="btn btn-borda" onclick="rpFcarVincular(\''+f.id+'\')">🔗 '+(f.stratws_id?'Alterar vínculo':'Vincular Stratws')+'</button>'
        +'<button class="btn btn-borda" onclick="rpFcarAbrirStratws(\''+f.id+'\')">↗ Abrir no Stratws</button>'
        +'</div></div>';
      return base.replace(/<\/div>\s*$/,extra+'</div>');
    };
  }

  const renderBase=(typeof fcarRender==='function')?fcarRender:null;
  if(renderBase){
    window.fcarRender=function(){
      renderBase();
      const box=el('fcarBox'); if(box && !el('rpStratwsCentral')) box.insertAdjacentHTML('afterbegin',painelResumoStratws());
    };
  }

  window.rpFcarPrev=function(id,v){ const t=el('rpProgTxt-'+id); if(t)t.textContent=pct(v)+'%'; };

  async function registrarHistorico(f,deProg,paraProg,deStatus,paraStatus,obs,acao){
    try{
      await sb.from('fcar_historico').insert({fcar_id:f.id,usuario:(typeof fcarEu==='function'?fcarEu():''),acao:acao||'atualizacao',progresso_de:deProg,progresso_para:paraProg,status_de:deStatus,status_para:paraStatus,observacao:obs||null});
    }catch(_){ }
  }

  async function salvarFcar(id,novoProg,concluir){
    const f=(typeof _fcarLista!=='undefined'?_fcarLista:[]).find(x=>x.id===id); if(!f)return;
    const obs=((el('rpObs-'+id)||{}).value||'').trim();
    const deProg=pct(f.progresso), deStatus=f.status||'rascunho', p=pct(novoProg);
    const patch={progresso:p,observacao:obs||null};
    if(concluir || p===100){ patch.progresso=100; patch.status='concluido'; patch.concluido_em=agora(); patch.concluido_por=(typeof fcarEu==='function'?fcarEu():''); }
    else if(deStatus==='concluido' && p<100){ patch.status='rascunho'; patch.concluido_em=null; patch.concluido_por=null; }
    if(f.stratws_id) patch.sincronizacao_status='pendente';
    try{
      const {error}=await sb.from('fcar').update(patch).eq('id',id); if(error) throw error;
      Object.assign(f,patch);
      await registrarHistorico(f,deProg,pct(patch.progresso),deStatus,patch.status||deStatus,obs,concluir?'conclusao':'progresso');
      try{toast(concluir?'✅ Demanda concluída':'✅ Andamento salvo');}catch(_){ }
      if(typeof fcarRender==='function') fcarRender();
    }catch(e){ try{_mostrarErro('Stratws/demanda: '+((e&&e.message)||e),'');}catch(_){alert((e&&e.message)||e);} }
  }

  window.rpFcarSalvarAndamento=function(id){ const r=el('rpProg-'+id); salvarFcar(id,r?r.value:0,false); };
  window.rpFcarConcluir=function(id){
    const obs=((el('rpObs-'+id)||{}).value||'').trim();
    if(!obs){ try{toast('Escreva um comentário/evidência antes de concluir.');}catch(_){alert('Escreva um comentário/evidência antes de concluir.');} return; }
    if(!confirm('Concluir esta demanda em 100%?')) return;
    salvarFcar(id,100,true);
  };
  window.rpFcarVincular=async function(id){
    const f=_fcarLista.find(x=>x.id===id); if(!f)return;
    const atual=f.stratws_url||f.stratws_id||'';
    const v=prompt('Cole o link da tarefa do Stratws ou o ID (Guid):',atual); if(v==null)return;
    const txt=v.trim(); if(!txt)return;
    const m=txt.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    const patch={stratws_id:m?m[0]:txt,stratws_url:/^https?:\/\//i.test(txt)?txt:(f.stratws_url||FCAR_STRATWS),sincronizacao_status:'pendente'};
    try{ const {error}=await sb.from('fcar').update(patch).eq('id',id); if(error)throw error; Object.assign(f,patch); await registrarHistorico(f,pct(f.progresso),pct(f.progresso),f.status,f.status,'Vínculo Stratws: '+patch.stratws_id,'vinculo'); toast('Vínculo Stratws salvo'); fcarRender(); }catch(e){try{_mostrarErro((e&&e.message)||e,'');}catch(_){}}
  };
  window.rpFcarAbrirStratws=function(id){ const f=_fcarLista.find(x=>x.id===id); const u=(f&&f.stratws_url)||FCAR_STRATWS; window.open(u,'_blank','noopener'); };
  window.rpFcarHistorico=async function(id){
    try{
      const {data,error}=await sb.from('fcar_historico').select('*').eq('fcar_id',id).order('criado_em',{ascending:false}).limit(100); if(error)throw error;
      const rows=data||[];
      const h=rows.length?rows.map(x=>'<div style="padding:9px 0;border-bottom:1px solid var(--borda)"><b>'+esc(x.acao||'atualização')+'</b> · '+new Date(x.criado_em).toLocaleString('pt-BR')+'<div class="desc" style="font-size:11px">'+esc(x.usuario||'')+(x.progresso_para!=null?' · '+(x.progresso_de==null?'':x.progresso_de+'% → ')+x.progresso_para+'%':'')+(x.status_para?' · '+esc(x.status_para):'')+'</div>'+(x.observacao?'<div style="font-size:12px;margin-top:3px">'+esc(x.observacao)+'</div>':'')+'</div>').join(''):'<p class="desc">Ainda não há alterações registradas.</p>';
      abreDet('Histórico da demanda',h);
    }catch(e){ try{_mostrarErro((e&&e.message)||e,'');}catch(_){} }
  };

  function iniciar(){ instalarCss(); setTimeout(()=>{ iniciarAreasTopo(); renderAreasTopo(); },0); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar); else iniciar();
})();
