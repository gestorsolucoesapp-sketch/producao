/* Rioplastic v4.638.38 — autocomplete + lote e fabricação opcionais na Saída */
(function(){
  'use strict';

  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  let _tSaidaLote='';
  let _tSaidaFab='';
  function candidatos(q){
    const s=norm(q);
    if(!s) return [];
    let L=(_tintaSaldo||[]).filter(x=>x&&x.ativo);
    try{ if(typeof _tintaFiltra==='function') L=_tintaFiltra(L); }catch(_){}
    return L.map(x=>{
      const nome=norm(x.nome), erp=norm(x.cod_erp), barra=norm(x.cod_barras), cod=norm(x.codigo), forn=norm(x.fornecedor);
      let score=99;
      if(barra===s||erp===s||cod===s) score=0;
      else if(nome===s) score=1;
      else if(nome.startsWith(s)) score=2;
      else if(erp.startsWith(s)||barra.startsWith(s)||cod.startsWith(s)) score=3;
      else if(nome.includes(s)) score=4;
      else if(forn.includes(s)||erp.includes(s)||barra.includes(s)||cod.includes(s)) score=5;
      return {x,score};
    }).filter(z=>z.score<99)
      .sort((a,b)=>a.score-b.score || String(a.x.nome||'').localeCompare(String(b.x.nome||''),'pt-BR'))
      .slice(0,8).map(z=>z.x);
  }

  function renderSugestoes(){
    const inp=document.getElementById('tintaBip');
    if(!inp) return;
    inp.placeholder='🔎 digite cor, código ERP ou código de barras…';
    inp.setAttribute('autocomplete','off');
    inp.setAttribute('aria-autocomplete','list');
    inp.setAttribute('aria-controls','tintaSugestoes');

    /* O campo original redesenhava a tela inteira a cada tecla.
       Isso recriava o input e o cursor voltava para o começo:
       digitava A, depois Z, e aparecia ZA. Aqui a busca passa a
       atualizar SOMENTE as sugestões, mantendo o mesmo input e o cursor. */
    inp.removeAttribute('oninput');
    inp.oninput=function(){
      _tintaBusca=this.value;
      renderSugestoes();
    };

    /* Enter só dá baixa quando o texto identifica exatamente um item.
       Em busca parcial, força escolher uma sugestão para evitar baixar a cor errada. */
    inp.removeAttribute('onkeydown');
    inp.onkeydown=function(ev){
      if(ev.key!=='Enter') return;
      ev.preventDefault();
      const s=norm(inp.value);
      const ex=(_tintaSaldo||[]).filter(p=>p&&p.ativo).filter(p=>
        norm(p.cod_barras)===s || norm(p.cod_erp)===s || norm(p.codigo)===s || norm(p.nome)===s
      );
      if(ex.length===1){
        tintaSaidaUma(ex[0].id);
        _tintaBusca='';
        tintaRender();
        return;
      }
      const C=candidatos(inp.value);
      if(C.length===1){
        tintaSaidaEscolherSugestao(C[0].id);
        return;
      }
      try{toast(C.length?'Escolha uma das sugestões abaixo.':'Nenhuma tinta encontrada.');}catch(_){}
    };

    const velho=document.getElementById('tintaSugestoes');
    if(velho) velho.remove();

    const q=String(inp.value||_tintaBusca||'').trim();
    if(!q) return;
    const L=candidatos(q);
    if(!L.length) return;

    const box=document.createElement('div');
    box.id='tintaSugestoes';
    box.setAttribute('role','listbox');
    box.style.cssText='margin:-3px 0 9px;border:1px solid var(--linha-2s);border-radius:10px;background:#fff;overflow:hidden';
    box.innerHTML=L.map((p,i)=>
      '<button type="button" role="option" onclick="tintaSaidaEscolherSugestao(\''+String(p.id).replace(/'/g,'')+'\')" '
      +'style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:9px 11px;border:0;border-top:'+(i?'1px solid var(--linha)':'0')+';background:#fff;cursor:pointer">'
      +'<span style="min-width:0"><b style="display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_bolinha(p.nome)+escapeHtml(p.nome||'')+'</b>'
      +'<span class="desc" style="font-size:10.5px">'+escapeHtml(p.fornecedor||'')
      +(p.cod_erp?' · ERP '+escapeHtml(p.cod_erp):'')
      +(p.cod_barras?' · '+escapeHtml(p.cod_barras):'')+'</span></span>'
      +'<span style="white-space:nowrap;text-align:right"><b>'+_tNum(p.saldo)+'</b><span class="desc" style="display:block;font-size:9.5px">latas</span></span>'
      +'</button>'
    ).join('');
    inp.insertAdjacentElement('afterend',box);

  }

  function renderMetaSaida(){
    const inp=document.getElementById('tintaBip');
    if(!inp) return;
    const velho=document.getElementById('tintaSaidaMeta');
    if(velho) velho.remove();

    const box=document.createElement('div');
    box.id='tintaSaidaMeta';
    box.style.cssText='display:grid;grid-template-columns:minmax(150px,1fr) minmax(170px,1fr) auto;gap:8px;align-items:end;margin:0 0 10px;padding:9px;border:1px solid var(--linha-2s);border-radius:10px;background:var(--leve-s)';
    box.innerHTML=
      '<label style="font-size:11px;font-weight:800;color:var(--navy)">Lote <span class="desc" style="font-weight:600">(opcional)</span><br>'
      +'<input id="tintaSaidaLote" type="text" value="'+escapeHtml(_tSaidaLote)+'" placeholder="ex.: L240901" style="width:100%;margin-top:4px;padding:8px;border:1px solid var(--borda);border-radius:8px;font-size:14px"></label>'
      +'<label style="font-size:11px;font-weight:800;color:var(--navy)">Data de fabricação <span class="desc" style="font-weight:600">(opcional)</span><br>'
      +'<input id="tintaSaidaFab" type="date" value="'+escapeHtml(_tSaidaFab)+'" style="width:100%;margin-top:4px;padding:7px;border:1px solid var(--borda);border-radius:8px;font-size:14px"></label>'
      +'<button type="button" id="tintaSaidaMetaLimpar" style="cursor:pointer;border:1px solid var(--linha-2s);background:#fff;color:var(--navy);font-weight:800;border-radius:8px;padding:8px 10px;font-size:11px">Limpar</button>'
      +'<div class="desc" style="grid-column:1/-1;font-size:10.5px">Se preenchido, lote e fabricação serão gravados junto com a próxima baixa e permanecerão para as próximas leituras até você limpar ou alterar.</div>';
    const sug=document.getElementById('tintaSugestoes');
    (sug||inp).insertAdjacentElement('afterend',box);
    const l=document.getElementById('tintaSaidaLote');
    const d=document.getElementById('tintaSaidaFab');
    const bt=document.getElementById('tintaSaidaMetaLimpar');
    if(l) l.addEventListener('input',()=>{_tSaidaLote=l.value;});
    if(d) d.addEventListener('change',()=>{_tSaidaFab=d.value;});
    if(bt) bt.addEventListener('click',()=>{
      _tSaidaLote='';_tSaidaFab='';
      if(l) l.value=''; if(d) d.value='';
      try{toast('Lote e fabricação limpos.');}catch(_){}
    });
  }

  window.tintaSaidaEscolherSugestao=function(id){
    const p=(_tintaSaldo||[]).find(x=>String(x.id)===String(id));
    if(!p) return;
    _tintaBusca=String(p.nome||'');
    tintaRender();
    setTimeout(()=>{
      const e=document.getElementById('tintaBip');
      if(e){e.value=_tintaBusca;e.focus();try{e.setSelectionRange(e.value.length,e.value.length);}catch(_){}}
    },30);
  };

  const original=window.tintaTelaSaida;
  if(typeof original==='function'){
    window.tintaTelaSaida=function(box){
      const r=original.apply(this,arguments);
      try{renderSugestoes();renderMetaSaida();}catch(_){}
      return r;
    };
  }
  const saidaOriginal=window.tintaSaidaUma;
  if(typeof saidaOriginal==='function'){
    window.tintaSaidaUma=async function(id){
      const before=((_tintaMov||[])[0]||{}).id||'';
      const lote=String(_tSaidaLote||'').trim();
      const fab=String(_tSaidaFab||'').trim();
      const r=await saidaOriginal.apply(this,arguments);
      if(!lote&&!fab) return r;
      const mov=(_tintaMov||[])[0];
      if(!mov||!mov.id||String(mov.id)===String(before)) return r;
      try{
        const {error}=await sb.from('tinta_movimento')
          .update({lote:lote||null,data_fabricacao:fab||null})
          .eq('id',mov.id);
        if(error) throw error;
        mov.lote=lote||null;
        mov.data_fabricacao=fab||null;
        try{toast('Baixa registrada'+(lote?' · lote '+lote:'')+(fab?' · fabricação '+fab.split('-').reverse().join('/'):'')+'.');}catch(_){}
      }catch(e){
        try{toast('Baixa feita, mas não consegui gravar lote/fabricação: '+((e&&e.message)||e));}catch(_){}
      }
      return r;
    };
  }

})();