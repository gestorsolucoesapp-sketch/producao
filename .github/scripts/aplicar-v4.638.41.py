from pathlib import Path

def rep(text, old, new, label):
    n=text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {n}")
    return text.replace(old,new,1)

p=Path("index.html")
s=p.read_text(encoding="utf-8")

ini=s.find("function _tintaCompraTexto() {")
fim=s.find("function tintaCompraEmail() {", ini)
if ini<0 or fim<0:
    raise SystemExit("bloco _tintaCompraTexto não encontrado")

novo=r"""function _tintaCompraTexto() {
  const itens = Object.keys(_tintaCarrinho).map(id => {
    const p = _tintaSaldo.find(x => x.id === id); return p ? { p: p, q: _tintaCarrinho[id] } : null;
  }).filter(Boolean).sort((a, b) => (a.p.fornecedor || '').localeCompare(b.p.fornecedor || '') || a.p.nome.localeCompare(b.p.nome));

  let t = 'PEDIDO DE COMPRA · CASA DE TINTAS\n' + new Date().toLocaleDateString('pt-BR') + '\n\n';
  const grupos = {};
  itens.forEach(x => {
    const marca = String(x.p.fornecedor || 'sem fornecedor').trim() || 'sem fornecedor';
    (grupos[marca] || (grupos[marca] = [])).push(x);
  });

  let totalKg = 0;
  Object.keys(grupos).sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(marca => {
    const G = grupos[marca].map(x => {
      const peso = (+x.p.peso_lata_kg || 2);
      const kg = (+x.q || 0) * peso;
      const cod = String(x.p.cod_erp || x.p.cod_barras || x.p.codigo || '');
      const cor = String(x.p.nome || '');
      const kgTxt = kg.toLocaleString('pt-BR',{maximumFractionDigits:2});
      totalKg += kg;
      return {cod,cor,kg,kgTxt};
    });
    const maxCod = Math.max('CÓDIGO DA TINTA'.length, ...G.map(x=>x.cod.length));
    const maxCor = Math.max('COR'.length, ...G.map(x=>x.cor.length));
    const maxKg = Math.max('QUANTIDADE'.length, ...G.map(x=>x.kgTxt.length));

    t += 'Solicito a compra do fornecedor ' + marca.toUpperCase() + ' das tintas abaixo:\n\n';
    t += 'CÓDIGO DA TINTA'.padEnd(maxCod) + '   ' + 'COR'.padEnd(maxCor) + '   ' + 'QUANTIDADE'.padStart(maxKg) + '\n';
    t += '-'.repeat(maxCod) + '   ' + '-'.repeat(maxCor) + '   ' + '-'.repeat(maxKg) + '\n';
    G.forEach(x => {
      t += x.cod.padEnd(maxCod) + '   ' + x.cor.padEnd(maxCor) + '   ' + x.kgTxt.padStart(maxKg) + ' kg\n';
    });
    const sub = G.reduce((a,x)=>a+x.kg,0);
    t += '\nSubtotal: ' + sub.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg\n\n';
  });

  t += 'Total geral: ' + totalKg.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg.\n';
  return t;
}
"""
s=s[:ini]+novo+s[fim:]

ini=s.find("function tintaCompraImprimir() {")
fim=s.find("\n\n/* ---------- ETIQUETAS",ini)
if ini<0 or fim<0:
    raise SystemExit("bloco tintaCompraImprimir não encontrado")

novo_print=r"""function tintaCompraImprimir() {
  const itens = Object.keys(_tintaCarrinho).map(id => {
    const p = _tintaSaldo.find(x => x.id === id); return p ? { p: p, q: _tintaCarrinho[id] } : null;
  }).filter(Boolean).sort((a, b) => (a.p.fornecedor || '').localeCompare(b.p.fornecedor || '') || a.p.nome.localeCompare(b.p.nome));
  if (!itens.length) { toast('Nenhum item no pedido.'); return; }

  const grupos = {};
  itens.forEach(x => {
    const marca = String(x.p.fornecedor || 'sem fornecedor').trim() || 'sem fornecedor';
    (grupos[marca] || (grupos[marca] = [])).push(x);
  });

  let totalKg = 0;
  let corpo = '';
  Object.keys(grupos).sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(marca => {
    const G = grupos[marca];
    let sub = 0;
    corpo += '<section><p class="sol">Solicito a compra do fornecedor <b>' + escapeHtml(marca.toUpperCase()) + '</b> das tintas abaixo:</p>';
    corpo += '<table><thead><tr><th>Código da tinta</th><th>Cor</th><th class="kg">Quantidade (kg)</th></tr></thead><tbody>';
    G.forEach(x => {
      const kg = (+x.q || 0) * (+x.p.peso_lata_kg || 2);
      sub += kg; totalKg += kg;
      const cod = x.p.cod_erp || x.p.cod_barras || x.p.codigo || '';
      corpo += '<tr><td>' + escapeHtml(cod) + '</td><td>' + escapeHtml(x.p.nome || '') + '</td><td class="kg"><b>' + kg.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg</b></td></tr>';
    });
    corpo += '</tbody><tfoot><tr><td colspan="2">Subtotal</td><td class="kg">' + sub.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg</td></tr></tfoot></table></section>';
  });

  const w = window.open('', '_blank'); if (!w) { toast('O navegador bloqueou a janela.'); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Pedido de compra · Casa de Tintas</title>'
    + '<style>@page{margin:12mm}body{font-family:Arial,sans-serif;font-size:10.5pt;color:#102a43;margin:0;text-align:left}'
    + 'h1{font-size:17pt;margin:0 0 2mm;color:#0b3558}.data{font-size:9pt;color:#52697d;margin-bottom:7mm}'
    + '.sol{font-size:11pt;margin:0 0 3mm;text-align:left}section{margin-bottom:7mm}'
    + 'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #9fb4c7;padding:3mm 3.2mm;text-align:left}'
    + 'th{background:#0b5fa5;color:#fff;font-size:9pt;text-transform:uppercase;letter-spacing:.2px}'
    + 'tbody tr:nth-child(odd){background:#fff}tbody tr:nth-child(even){background:#eaf3fb}'
    + 'td:nth-child(1),th:nth-child(1){width:24%}td:nth-child(2),th:nth-child(2){width:56%}'
    + 'td.kg,th.kg{width:20%;text-align:right;white-space:nowrap}tfoot td{background:#d6e8f7;font-weight:800}'
    + '.total{margin-top:6mm;border:2px solid #0b5fa5;background:#eaf3fb;padding:4mm;text-align:right;font-size:13pt;font-weight:800}'
    + '</style></head><body>'
    + '<h1>Pedido de Compra · Casa de Tintas</h1><div class="data">' + new Date().toLocaleDateString('pt-BR') + '</div>'
    + corpo
    + '<div class="total">Total geral: ' + totalKg.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg</div>'
    + '</body></html>');
  w.document.close();
  setTimeout(() => { try { w.print(); } catch (_) { } }, 400);
}
"""
s=s[:ini]+novo_print+s[fim:]

s=rep(s, '>v4.638.40<small id="verData"', '>v4.638.41<small id="verData"', 'badge')
s=rep(s, "const APP_VER = '4.638.40';", "const APP_VER = '4.638.41';", 'APP_VER')
s=rep(s, '<script src="./tinta-nfe-v4.638.22.js?v=4.638.40"></script>', '<script src="./tinta-nfe-v4.638.22.js?v=4.638.41"></script>', 'script NF-e')
s=rep(s, '<script src="./tinta-balanco-historico-v4.638.30.js?v=4.638.40"></script>', '<script src="./tinta-balanco-historico-v4.638.30.js?v=4.638.41"></script>', 'script balanço')
s=rep(s, '<script src="./tinta-saida-sugestoes-v4.638.32.js?v=4.638.40"></script>', '<script src="./tinta-saida-sugestoes-v4.638.32.js?v=4.638.41"></script>', 'script saída')
p.write_text(s,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
w=rep(w, '// Produção Rioplastic — v4.638.40', '// Produção Rioplastic — v4.638.41', 'sw versão')
w=rep(w, "const CACHE = 'producao-rioplastic-v4.638.40';", "const CACHE = 'producao-rioplastic-v4.638.41';", 'sw cache')
sw.write_text(w,encoding='utf-8')
