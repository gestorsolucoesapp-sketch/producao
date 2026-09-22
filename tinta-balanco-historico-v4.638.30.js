/* Rioplastic v4.638.31 — clicar em Balanço mostra o último balanço fechado completo */
(function(){
  'use strict';

  let _balHistUI=[];
  let _balHistCarregando=false;
  let _balHistCarregado=false;
  let _balSelecionado='';
  let _balFiltro='';

  const num=v=>Number(v||0);
  const fmt=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1});

  async function carregarHistoricoBalanco(){
    if(_balHistCarregando) return;
    _balHistCarregando=true;
    try{
      const {data,error}=await sb.from('tinta_balanco')
        .select('id,data,status,criado_nome,criado_em,fechado_nome,fechado_em,tinta_balanco_item(id,produto_id,contado,saldo_sistema,ajustado,contado_nome,contado_em)')
        .eq('status','fechado')
        .order('data',{ascending:false})
        .limit(24);
      if(error) throw error;
      _balHistUI=(data||[]).map(b=>{
        const itens=b.tinta_balanco_item||[];
        let difItens=0,difLiq=0,difAbs=0,ajustados=0;
        itens.forEach(x=>{
          const d=num(x.contado)-num(x.saldo_sistema);
          if(d!==0) difItens++;
          difLiq+=d;
          difAbs+=Math.abs(d);
          if(x.ajustado) ajustados++;
        });
        return Object.assign({},b,{itens,difItens,difLiq,difAbs,ajustados});
      });
      _balHistCarregado=true;
    }catch(e){
      _balHistUI=[];
      _balHistCarregado=true;
      try{console.warn('historico balanco:',e&&e.message);}catch(_){}
    }finally{
      _balHistCarregando=false;
      try{if(_tintaVista==='balanco') renderBalancoFechadoInline();}catch(_){}
    }
  }

  function nomeProduto(id){
    const p=(_tintaSaldo||[]).find(x=>String(x.id)===String(id));
    return p ? p.nome : 'Produto';
  }

  function historicoHtml(){
    if(!_balHistCarregado){
      if(!_balHistCarregando) setTimeout(carregarHistoricoBalanco,0);
      return '<div style="margin-top:16px"><div class="titulo-sec">Histórico de balanços</div><p class="desc">Carregando balanços fechados…</p></div>';
    }
    if(!_balHistUI.length){
      return '<div style="margin-top:16px"><div class="titulo-sec">Histórico de balanços</div><p class="desc">Nenhum balanço fechado encontrado.</p></div>';
    }
    return '<div style="margin-top:16px"><div class="titulo-sec">Histórico de balanços fechados</div>'
      +'<div style="overflow-x:auto"><table style="width:100%;font-size:12px"><thead><tr>'
      +'<th>Data</th><th>Contadas</th><th>Com diferença</th><th>Dif. líquida</th><th>Dif. absoluta</th><th>Fechado por</th><th></th>'
      +'</tr></thead><tbody>'
      +_balHistUI.map(b=>'<tr style="border-top:1px solid var(--linha)">'
        +'<td style="text-align:center"><b>'+escapeHtml(fmtData(String(b.data)))+'</b></td>'
        +'<td style="text-align:center">'+fmt((b.itens||[]).length)+'</td>'
        +'<td style="text-align:center;font-weight:800;color:'+(b.difItens?'var(--critico)':'var(--verde)')+'">'+fmt(b.difItens)+'</td>'
        +'<td style="text-align:center;font-weight:800">'+(b.difLiq>0?'+':'')+fmt(b.difLiq)+'</td>'
        +'<td style="text-align:center">'+fmt(b.difAbs)+'</td>'
        +'<td style="text-align:center">'+escapeHtml(b.fechado_nome||b.criado_nome||'—')+'</td>'
        +'<td style="text-align:right"><span onclick="tintaBalancoHistoricoDetalhe(\''+b.id+'\')" style="cursor:pointer;color:var(--azul-2);font-weight:800">ver ›</span></td>'
        +'</tr>').join('')
      +'</tbody></table></div></div>';
  }

  function balancoSelecionado(){
    if(!_balHistUI.length) return null;
    return _balHistUI.find(x=>String(x.id)===String(_balSelecionado)) || _balHistUI[0];
  }

  function renderBalancoFechadoInline(){
    const box=document.getElementById('tintaConteudo');
    if(!box) return;
    if(!_balHistCarregado){
      box.innerHTML='<p class="desc">Carregando último balanço…</p>';
      if(!_balHistCarregando) carregarHistoricoBalanco();
      return;
    }
    const b=balancoSelecionado();
    if(!b){
      box.innerHTML='<p class="desc">Nenhum balanço fechado encontrado.</p>'
        +'<span onclick="tintaBalancoAbrir()" style="cursor:pointer;display:inline-block;margin-top:8px;background:var(--navy);color:#fff;font-weight:800;border-radius:10px;padding:11px 18px">⚖️ Abrir balanço de hoje</span>';
      return;
    }
    _balSelecionado=b.id;
    const filtro=String(_balFiltro||'').trim().toLowerCase();
    const itens=(b.itens||[]).slice().sort((a,z)=>nomeProduto(a.produto_id).localeCompare(nomeProduto(z.produto_id),'pt-BR'))
      .filter(x=>!filtro || nomeProduto(x.produto_id).toLowerCase().includes(filtro));
    box.innerHTML=
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'
      +'<div><div class="titulo-sec">⚖️ Balanço de '+escapeHtml(fmtData(String(b.data)))+'</div>'
      +'<p class="desc" style="margin:2px 0 0">Fechado por <b>'+escapeHtml(b.fechado_nome||b.criado_nome||'—')+'</b></p></div>'
      +'<div style="display:flex;gap:7px;flex-wrap:wrap">'
      +(_balHistUI.length>1?'<select onchange="tintaBalancoSelecionar(this.value)" style="padding:8px 10px;border:1px solid var(--borda);border-radius:9px;font-size:12px">'
        +_balHistUI.map(x=>'<option value="'+escapeHtml(x.id)+'"'+(String(x.id)===String(b.id)?' selected':'')+'>'+escapeHtml(fmtData(String(x.data)))+' · '+escapeHtml(x.fechado_nome||x.criado_nome||'')+'</option>').join('')
        +'</select>':'')
      +'<span onclick="tintaBalancoAbrir()" style="cursor:pointer;background:var(--navy);color:#fff;font-weight:800;border-radius:9px;padding:8px 12px;font-size:12px">＋ Novo balanço</span>'
      +'</div></div>'
      +'<div class="idet-grid" style="margin-top:10px">'
      +'<div><b>'+fmt((b.itens||[]).length)+'</b><span>cores contadas</span></div>'
      +'<div><b style="color:'+(b.difItens?'var(--critico)':'var(--verde)')+'">'+fmt(b.difItens)+'</b><span>com diferença</span></div>'
      +'<div><b>'+(b.difLiq>0?'+':'')+fmt(b.difLiq)+'</b><span>diferença líquida</span></div>'
      +'<div><b>'+fmt(b.difAbs)+'</b><span>diferença absoluta</span></div>'
      +'</div>'
      +'<input type="search" placeholder="🔎 buscar cor no balanço…" value="'+escapeHtml(_balFiltro||'')+'" oninput="tintaBalancoFiltrar(this.value)" style="width:100%;margin:10px 0;padding:9px 11px;border:1px solid var(--borda);border-radius:10px;font-size:14px">'
      +'<div style="overflow-x:auto"><table style="width:100%;font-size:12.5px"><thead><tr>'
      +'<th style="text-align:left">Cor</th><th>Sistema</th><th>Contado</th><th>Dif.</th><th>Ajustado</th>'
      +'</tr></thead><tbody>'
      +itens.map(x=>{
        const d=num(x.contado)-num(x.saldo_sistema);
        const atual=(_tintaSaldo||[]).find(p=>String(p.id)===String(x.produto_id));
        return '<tr style="border-top:1px solid var(--linha)">'
          +'<td style="text-align:left"><b>'+escapeHtml(nomeProduto(x.produto_id))+'</b>'
          +(atual?'<div class="desc" style="font-size:10px">saldo atual: <b>'+fmt(atual.saldo)+'</b></div>':'')+'</td>'
          +'<td style="text-align:center">'+fmt(x.saldo_sistema)+'</td>'
          +'<td style="text-align:center;font-weight:800">'+fmt(x.contado)+'</td>'
          +'<td style="text-align:center;font-weight:800;color:'+(d===0?'var(--verde)':'var(--critico)')+'">'+(d>0?'+':'')+fmt(d)+'</td>'
          +'<td style="text-align:center">'+(x.ajustado?'✓':'—')+'</td>'
          +'</tr>';
      }).join('')
      +'</tbody></table></div>'
      +(itens.length?'<p class="desc" style="margin-top:8px">Mostrando '+itens.length+' de '+(b.itens||[]).length+' cores.</p>':'<p class="desc">Nenhuma cor encontrada.</p>')
      +historicoHtml();
  }

  function detalhe(id){
    const b=_balHistUI.find(x=>String(x.id)===String(id));
    if(!b) return;
    const itens=(b.itens||[]).slice().sort((a,z)=>nomeProduto(a.produto_id).localeCompare(nomeProduto(z.produto_id),'pt-BR'));
    const h='<div class="desc" style="margin-bottom:8px">Balanço de '+escapeHtml(fmtData(String(b.data)))
      +' · fechado por '+escapeHtml(b.fechado_nome||b.criado_nome||'—')+'</div>'
      +'<div class="idet-grid" style="margin-bottom:10px">'
      +'<div><b>'+fmt(itens.length)+'</b><span>cores contadas</span></div>'
      +'<div><b style="color:'+(b.difItens?'var(--critico)':'var(--verde)')+'">'+fmt(b.difItens)+'</b><span>com diferença</span></div>'
      +'<div><b>'+(b.difLiq>0?'+':'')+fmt(b.difLiq)+'</b><span>diferença líquida</span></div>'
      +'<div><b>'+fmt(b.difAbs)+'</b><span>diferença absoluta</span></div>'
      +'</div>'
      +'<div style="overflow-x:auto;max-height:65vh"><table style="width:100%;font-size:12px"><thead><tr>'
      +'<th style="text-align:left">Cor</th><th>Sistema</th><th>Contado</th><th>Dif.</th><th>Ajustado</th>'
      +'</tr></thead><tbody>'
      +itens.map(x=>{
        const d=num(x.contado)-num(x.saldo_sistema);
        return '<tr style="border-top:1px solid var(--linha)">'
          +'<td style="text-align:left"><b>'+escapeHtml(nomeProduto(x.produto_id))+'</b></td>'
          +'<td style="text-align:center">'+fmt(x.saldo_sistema)+'</td>'
          +'<td style="text-align:center">'+fmt(x.contado)+'</td>'
          +'<td style="text-align:center;font-weight:800;color:'+(d===0?'var(--verde)':'var(--critico)')+'">'+(d>0?'+':'')+fmt(d)+'</td>'
          +'<td style="text-align:center">'+(x.ajustado?'✓':'—')+'</td>'
          +'</tr>';
      }).join('')
      +'</tbody></table></div>';
    abreDet('⚖️ Balanço · '+escapeHtml(fmtData(String(b.data))),h);
  }

  const verOriginal=window.tintaVer;
  if(typeof verOriginal==='function'){
    window.tintaVer=function(v){
      const r=verOriginal.apply(this,arguments);
      if(v==='balanco'){
        _balFiltro='';
        Promise.resolve(carregarHistoricoBalanco()).then(()=>{
          if(_balHistUI.length && !_balSelecionado) _balSelecionado=_balHistUI[0].id;
          renderBalancoFechadoInline();
        });
      }
      return r;
    };
  }

  const abrirOriginal=window.tintaAbrir;
  if(typeof abrirOriginal==='function'){
    window.tintaAbrir=async function(){
      const r=await abrirOriginal.apply(this,arguments);
      try{carregarHistoricoBalanco();}catch(_){}
      return r;
    };
  }

  window.tintaBalancoHistoricoDetalhe=detalhe;
  window.tintaBalancoSelecionar=function(id){ _balSelecionado=String(id||''); _balFiltro=''; renderBalancoFechadoInline(); };
  window.tintaBalancoFiltrar=function(v){ _balFiltro=String(v||''); renderBalancoFechadoInline(); };
  window.tintaBalancoHistoricoRecarregar=async function(){
    _balHistCarregado=false;
    _balHistUI=[];
    await carregarHistoricoBalanco();
    renderBalancoFechadoInline();
  };
})();