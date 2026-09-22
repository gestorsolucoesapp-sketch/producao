/* Rioplastic v4.638.38 — coluna Tinta compacta e Contado maximizado */
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

  function produtosParaFolha(){
    let L=(_tintaSaldo||[]).filter(x=>x&&x.ativo).slice();
    try{if(typeof _tintaFiltra==='function') L=_tintaFiltra(L);}catch(_){}
    return L.sort((a,b)=>{
      const fa=String(a.fornecedor||''),fb=String(b.fornecedor||'');
      const d=fa.localeCompare(fb,'pt-BR');
      return d||String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');
    });
  }

  function imprimirFolhaBalanco(){
    const L=produtosParaFolha();
    if(!L.length){try{toast('Nenhuma tinta ativa para imprimir.');}catch(_){} return;}
    const totalVirtual=L.reduce((a,x)=>a+num(x.saldo),0);
    const hoje=new Date().toLocaleDateString('pt-BR');
    const w=window.open('','_blank');
    if(!w){try{toast('O navegador bloqueou a janela de impressão.');}catch(_){} return;}
    const linhas=L.map((x,i)=>'<tr>'
      +'<td class="n">'+(i+1)+'</td>'
      +'<td class="nome"><b>'+escapeHtml(x.nome||'')+'</b><span>'+escapeHtml(x.fornecedor||'')+(x.cod_erp?' · ERP '+escapeHtml(x.cod_erp):'')+'</span></td>'
      +'<td class="num">'+num(x.saldo).toLocaleString('pt-BR',{maximumFractionDigits:1})+'</td>'
      +'<td class="anot"></td>'
      +'<td class="anot"></td>'
      +'</tr>').join('');
    const html='<!doctype html><html><head><meta charset="utf-8"><title>Folha de Balanço · Casa de Tintas</title><style>'
      +'@page{size:A4 portrait;margin:9mm 8mm 11mm}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:9pt}'
      +'h1{font-size:15pt;margin:0 0 2mm}.sub{font-size:8pt;color:#555;margin-bottom:4mm}.top{display:flex;justify-content:space-between;gap:10mm;border-bottom:1.5px solid #222;padding-bottom:3mm;margin-bottom:4mm}'
      +'.campos{font-size:8.5pt;line-height:1.8;white-space:nowrap}.linha{display:inline-block;min-width:42mm;border-bottom:1px solid #444;height:4mm;vertical-align:bottom}'
      +'table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{page-break-inside:avoid}'
      +'th,td{border:1px solid #888;padding:2.1mm 1.5mm;vertical-align:middle}th{background:#eee;font-size:8pt;text-transform:uppercase}'
      +'th:nth-child(1),td.n{width:7mm;text-align:center}.nome{width:auto}.nome span{display:block;font-size:7pt;color:#555;margin-top:1px}'
      +'th:nth-child(2),td.nome{width:82mm}th:nth-child(3),td.num{width:16mm;text-align:center;font-weight:700}th:nth-child(4){width:72mm}th:nth-child(5){width:17mm}'
      +'td:nth-child(4).anot{width:72mm;height:12mm;border-left:2px solid #444;border-right:2px solid #444}td:nth-child(5).anot{width:17mm;height:12mm}.totais{margin-top:5mm;border:1.5px solid #333;padding:3mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm}'
      +'.totais div{font-size:8.5pt}.totais b{font-size:12pt}.blank{display:block;border-bottom:1px solid #333;height:7mm;margin-top:2mm}'
      +'.obs{margin-top:4mm;border:1px solid #888;min-height:18mm;padding:2mm;font-size:8pt}.rod{margin-top:3mm;font-size:7.5pt;color:#555;text-align:right}'
      +'</style></head><body>'
      +'<div class="top"><div><h1>Casa de Tintas · Folha de Balanço</h1><div class="sub">Contagem física para conferência com o estoque virtual · emitido em '+hoje+'</div></div>'
      +'<div class="campos">Data da contagem: <span class="linha"></span><br>Responsável: <span class="linha"></span></div></div>'
      +'<table><thead><tr><th>#</th><th>Tinta</th><th>Virtual</th><th>Contado</th><th>Dif.</th></tr></thead><tbody>'+linhas+'</tbody></table>'
      +'<div class="totais"><div>TOTAL VIRTUAL<br><b>'+totalVirtual.toLocaleString('pt-BR',{maximumFractionDigits:1})+' latas</b></div>'
      +'<div>TOTAL CONTADO<span class="blank"></span></div><div>DIFERENÇA TOTAL<span class="blank"></span></div></div>'
      +'<div class="obs"><b>Observações:</b></div>'
      +'<div class="rod">'+L.length+' item(ns) na folha de balanço</div>'
      +'</body></html>';
    w.document.write(html);
    w.document.close();
    setTimeout(()=>{try{w.focus();w.print();}catch(_){}},250);
  }

  function adicionarBotaoFolha(){
    try{
      if(_tintaVista!=='balanco') return;
      const box=document.getElementById('tintaConteudo');
      if(!box||document.getElementById('balFolhaPrintBar')) return;
      const bar=document.createElement('div');
      bar.id='balFolhaPrintBar';
      bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px';
      bar.innerHTML='<button type="button" onclick="tintaImprimirFolhaBalanco()" style="cursor:pointer;border:0;background:var(--navy);color:#fff;font-weight:800;border-radius:9px;padding:9px 13px;font-size:12px">🖨️ Imprimir folha para contagem</button>';
      box.insertAdjacentElement('afterbegin',bar);
    }catch(_){}
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
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><span onclick="tintaBalancoAbrir()" style="cursor:pointer;display:inline-block;background:var(--navy);color:#fff;font-weight:800;border-radius:10px;padding:11px 18px">⚖️ Abrir balanço de hoje</span>'
        +'<span onclick="tintaImprimirFolhaBalanco()" style="cursor:pointer;display:inline-block;background:var(--leve-2);color:var(--navy);border:1px solid var(--linha-2s);font-weight:800;border-radius:10px;padding:11px 18px">🖨️ Imprimir folha de contagem</span></div>';
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
      +'<span onclick="tintaImprimirFolhaBalanco()" style="cursor:pointer;background:var(--leve-2);color:var(--navy);border:1px solid var(--linha-2s);font-weight:800;border-radius:9px;padding:8px 12px;font-size:12px">🖨️ Folha de contagem</span>'
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
        const aberto=(typeof _balAtual!=='undefined' && _balAtual);
        if(aberto){
          setTimeout(adicionarBotaoFolha,0);
        }else{
          Promise.resolve(carregarHistoricoBalanco()).then(()=>{
            if(_balHistUI.length && !_balSelecionado) _balSelecionado=_balHistUI[0].id;
            renderBalancoFechadoInline();
          });
        }
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

  const abrirBalOriginal=window.tintaBalancoAbrir;
  if(typeof abrirBalOriginal==='function'){
    window.tintaBalancoAbrir=async function(){
      const r=await abrirBalOriginal.apply(this,arguments);
      setTimeout(adicionarBotaoFolha,0);
      return r;
    };
  }

  try{
    const alvo=document.getElementById('tintaConteudo');
    if(alvo && typeof MutationObserver!=='undefined'){
      const obs=new MutationObserver(()=>{if(typeof _balAtual!=='undefined' && _balAtual) adicionarBotaoFolha();});
      obs.observe(alvo,{childList:true});
    }
  }catch(_){}

  window.tintaImprimirFolhaBalanco=imprimirFolhaBalanco;
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