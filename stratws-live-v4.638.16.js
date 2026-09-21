/* Rioplastic v4.638.16 — painel de tarefas reais do Stratws via Supabase */
(function(){
  'use strict';

  const STATE = { tasks: [], sync: null, filtro: 'minhas', loading: false, erro: '' };

  function el(id){ return document.getElementById(id); }
  function esc(v){
    try { return escapeHtml(String(v == null ? '' : v)); }
    catch(_){ return String(v == null ? '' : v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  }
  function nomeAtual(){
    try {
      if (typeof fcarEu === 'function') return String(fcarEu()||'').trim();
    } catch(_){}
    return '';
  }
  function norm(v){ return String(v||'').trim().toLocaleLowerCase('pt-BR'); }
  function fmtData(v){
    if(!v) return '—';
    const p=String(v).slice(0,10).split('-');
    return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : String(v);
  }
  function fmtHora(v){
    if(!v) return 'ainda não sincronizado';
    try { return new Date(v).toLocaleString('pt-BR'); } catch(_) { return String(v); }
  }
  function statusClasse(t){
    const s=norm(t.status);
    if(t.completion_percentage >= 100 || s.includes('conclu')) return 'ok';
    if(s.includes('atras')) return 'bad';
    if((Number(t.completion_percentage)||0) > 0) return 'run';
    return 'plan';
  }
  function statusTexto(t){
    const p=Number(t.completion_percentage)||0;
    if(p>=100) return 'Concluída';
    const s=String(t.status||'');
    if(/atras/i.test(s)) return p>0 ? 'Em andamento · atrasada' : 'Planejada · atrasada';
    if(p>0) return 'Em andamento';
    return 'Planejada';
  }

  function instalarCss(){
    if(el('rpStratwsLiveCss')) return;
    const st=document.createElement('style');
    st.id='rpStratwsLiveCss';
    st.textContent=`
      #rpStratwsLive{margin-top:10px}
      .rp-sw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .rp-sw-head h3{margin:0;color:var(--navy);font-size:16px}
      .rp-sw-head p{margin:3px 0 0;font-size:11px;color:var(--fraco)}
      .rp-sw-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
      .rp-sw-tabs button{border:1px solid var(--linha);background:#fff;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;color:var(--txt-2)}
      .rp-sw-tabs button.ativa{background:var(--navy);border-color:var(--navy);color:#fff}
      .rp-sw-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:8px 0 10px}
      .rp-sw-kpi{border:1px solid var(--linha);border-radius:10px;background:var(--leve-s);padding:8px;text-align:center}
      .rp-sw-kpi b{display:block;color:var(--navy);font-size:18px}.rp-sw-kpi span{font-size:9px;color:var(--fraco);font-weight:800;text-transform:uppercase}
      .rp-sw-lista{display:grid;gap:8px}
      .rp-sw-task{border:1px solid var(--linha);border-radius:11px;background:#fff;padding:10px}
      .rp-sw-task-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .rp-sw-task-title{font-weight:800;color:var(--txt);font-size:13px;line-height:1.3}
      .rp-sw-pill{flex:0 0 auto;border-radius:999px;padding:3px 7px;font-size:9px;font-weight:900}
      .rp-sw-pill.ok{background:#e6f4ec;color:#066c38}.rp-sw-pill.bad{background:#fdecec;color:#a62f2f}.rp-sw-pill.run{background:#eaf1ff;color:#2859a8}.rp-sw-pill.plan{background:#f1f3f5;color:#626a73}
      .rp-sw-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:10px;color:var(--fraco)}
      .rp-sw-owner{margin-top:6px;font-size:10px;color:var(--txt-2);font-weight:700}
      .rp-sw-bar{height:7px;border-radius:999px;background:#edf0f2;overflow:hidden;margin-top:8px}.rp-sw-bar i{display:block;height:100%;background:var(--verde);border-radius:inherit}
      .rp-sw-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.rp-sw-actions a,.rp-sw-actions button{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--linha);background:#fff;border-radius:8px;padding:6px 9px;font-size:10px;font-weight:800;color:var(--navy);text-decoration:none}
      .rp-sw-empty{padding:16px;text-align:center;color:var(--fraco);font-size:12px;border:1px dashed var(--linha);border-radius:10px}
      @media(max-width:680px){.rp-sw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.rp-sw-task-top{display:block}.rp-sw-pill{display:inline-flex;margin-top:5px}}
    `;
    document.head.appendChild(st);
  }

  function tarefasFiltradas(){
    if(STATE.filtro==='todas') return STATE.tasks;
    const eu=norm(nomeAtual());
    if(!eu) return STATE.tasks;
    return STATE.tasks.filter(t=>norm(t.responsible_name)===eu);
  }

  function render(){
    instalarCss();
    const central=el('rpStratwsCentral');
    if(!central) return;
    let box=el('rpStratwsLive');
    if(!box){
      box=document.createElement('div');
      box.id='rpStratwsLive';
      box.className='card';
      central.insertAdjacentElement('afterend',box);
    }
    const L=tarefasFiltradas();
    const concl=L.filter(t=>(Number(t.completion_percentage)||0)>=100).length;
    const atras=L.filter(t=>/atras/i.test(String(t.status||'')) && (Number(t.completion_percentage)||0)<100).length;
    const and=L.filter(t=>(Number(t.completion_percentage)||0)>0 && (Number(t.completion_percentage)||0)<100).length;
    const sync=STATE.sync;
    const syncTxt=sync&&sync.last_success_at ? 'Última importação: '+fmtHora(sync.last_success_at)+' · '+(sync.item_count||0)+' tarefas' : 'Sem importação registrada';

    let html='<div class="rp-sw-head"><div><h3>🔗 Tarefas reais do Stratws</h3><p>'+esc(syncTxt)+'</p></div>'
      +'<button class="btn btn-borda" style="width:auto;padding:7px 10px;font-size:11px" onclick="rpStratwsLiveAtualizar()">↻ Atualizar tela</button></div>';

    if(STATE.erro){
      html+='<div class="rp-sw-empty" style="color:#a62f2f">'+esc(STATE.erro)+'</div>';
      box.innerHTML=html; return;
    }
    if(STATE.loading && !STATE.tasks.length){
      html+='<div class="rp-sw-empty">Carregando tarefas do Stratws…</div>';
      box.innerHTML=html; return;
    }

    html+='<div class="rp-sw-tabs">'
      +'<button class="'+(STATE.filtro==='minhas'?'ativa':'')+'" onclick="rpStratwsLiveFiltro(\'minhas\')">Minhas tarefas</button>'
      +'<button class="'+(STATE.filtro==='todas'?'ativa':'')+'" onclick="rpStratwsLiveFiltro(\'todas\')">Todas acessíveis</button>'
      +'</div>'
      +'<div class="rp-sw-kpis">'
      +'<div class="rp-sw-kpi"><b>'+L.length+'</b><span>tarefas</span></div>'
      +'<div class="rp-sw-kpi"><b>'+and+'</b><span>em andamento</span></div>'
      +'<div class="rp-sw-kpi"><b>'+atras+'</b><span>atrasadas</span></div>'
      +'<div class="rp-sw-kpi"><b>'+concl+'</b><span>concluídas</span></div>'
      +'</div>';

    if(!L.length){
      html+='<div class="rp-sw-empty">Nenhuma tarefa encontrada para este filtro.</div>';
    } else {
      html+='<div class="rp-sw-lista">';
      L.slice().sort((a,b)=>{
        const ac=(Number(a.completion_percentage)||0)>=100, bc=(Number(b.completion_percentage)||0)>=100;
        if(ac!==bc) return ac?1:-1;
        return String(a.planned_end||'9999').localeCompare(String(b.planned_end||'9999'));
      }).forEach(t=>{
        const p=Math.max(0,Math.min(100,Number(t.completion_percentage)||0));
        const cls=statusClasse(t);
        html+='<div class="rp-sw-task">'
          +'<div class="rp-sw-task-top"><div class="rp-sw-task-title">'+esc(t.what||'Tarefa sem descrição')+'</div><span class="rp-sw-pill '+cls+'">'+esc(statusTexto(t))+'</span></div>'
          +'<div class="rp-sw-owner">'+esc(t.owner_entity_name||t.action_plan_name||'Plano de ação')+'</div>'
          +'<div class="rp-sw-meta"><span>👤 '+esc(t.responsible_name||'Sem responsável')+'</span><span>📅 '+fmtData(t.planned_end)+'</span><span>📈 '+p+'%</span></div>'
          +'<div class="rp-sw-bar"><i style="width:'+p+'%"></i></div>'
          +'<div class="rp-sw-actions">'+(t.url?'<a href="'+esc(t.url)+'" target="_blank" rel="noopener">↗ Abrir no Stratws</a>':'')+'</div>'
          +'</div>';
      });
      html+='</div>';
    }
    box.innerHTML=html;
  }

  async function carregar(){
    if(STATE.loading) return;
    STATE.loading=true; STATE.erro=''; render();
    try{
      if(typeof sb==='undefined' || !sb) throw new Error('Supabase não disponível.');
      const [a,b]=await Promise.all([
        sb.from('stratws_tasks').select('id,action_plan_id,action_plan_name,action_plan_kind,owner_entity_name,what,responsible_name,planned_start,planned_end,actual_start,actual_end,completion_percentage,status,url,synced_at').order('planned_end',{ascending:true}).limit(200),
        sb.from('stratws_sync_state').select('*').eq('source','stratws_tasks').maybeSingle()
      ]);
      if(a.error) throw a.error;
      STATE.tasks=a.data||[];
      if(!b.error) STATE.sync=b.data||null;
    }catch(e){
      STATE.erro='Não foi possível carregar as tarefas reais do Stratws: '+((e&&e.message)||e);
    }finally{
      STATE.loading=false; render();
    }
  }

  window.rpStratwsLiveAtualizar=carregar;
  window.rpStratwsLiveFiltro=function(f){ STATE.filtro=f==='todas'?'todas':'minhas'; render(); };

  const baseRender=typeof fcarRender==='function'?fcarRender:null;
  if(baseRender){
    window.fcarRender=function(){
      baseRender();
      setTimeout(()=>{ render(); if(!STATE.tasks.length && !STATE.loading) carregar(); },0);
    };
  }

  function iniciar(){
    instalarCss();
    setTimeout(()=>{ render(); carregar(); },100);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();
})();