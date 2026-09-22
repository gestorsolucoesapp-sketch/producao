from pathlib import Path

def rep(text, old, new, label):
    n=text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {n}")
    return text.replace(old,new,1)

p=Path("index.html")
s=p.read_text(encoding="utf-8")

old="""async function tintaCompraCopiar() {
  const t = _tintaCompraTexto();
  try { await navigator.clipboard.writeText(t); toast('Pedido copiado.'); }
  catch (_) { try { prompt('Copie o pedido:', t); } catch (__) { toast('Não consegui copiar.'); } }
}"""

new=r"""function _tintaCompraHtmlCopiar() {
  const itens = Object.keys(_tintaCarrinho).map(id => {
    const p = _tintaSaldo.find(x => x.id === id); return p ? { p: p, q: _tintaCarrinho[id] } : null;
  }).filter(Boolean).sort((a, b) => (a.p.fornecedor || '').localeCompare(b.p.fornecedor || '') || a.p.nome.localeCompare(b.p.nome));
  if (!itens.length) return '';

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
    corpo += '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:15px;color:#102a43;text-align:left">Solicito a compra do fornecedor <b>' + escapeHtml(marca.toUpperCase()) + '</b> das tintas abaixo:</p>';
    corpo += '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:#102a43;margin:0 0 18px">'
      + '<thead><tr>'
      + '<th style="width:24%;background:#0b5fa5;color:#fff;border:1px solid #9fb4c7;padding:9px 10px;text-align:left">CÓDIGO DA TINTA</th>'
      + '<th style="width:56%;background:#0b5fa5;color:#fff;border:1px solid #9fb4c7;padding:9px 10px;text-align:left">COR</th>'
      + '<th style="width:20%;background:#0b5fa5;color:#fff;border:1px solid #9fb4c7;padding:9px 10px;text-align:right;white-space:nowrap">QUANTIDADE (KG)</th>'
      + '</tr></thead><tbody>';
    G.forEach((x,i) => {
      const kg = (+x.q || 0) * (+x.p.peso_lata_kg || 2);
      sub += kg; totalKg += kg;
      const cod = x.p.cod_erp || x.p.cod_barras || x.p.codigo || '';
      const bg = i % 2 ? '#eaf3fb' : '#ffffff';
      corpo += '<tr style="background:' + bg + '">'
        + '<td style="border:1px solid #9fb4c7;padding:9px 10px;text-align:left;background:' + bg + '">' + escapeHtml(cod) + '</td>'
        + '<td style="border:1px solid #9fb4c7;padding:9px 10px;text-align:left;background:' + bg + '">' + escapeHtml(x.p.nome || '') + '</td>'
        + '<td style="border:1px solid #9fb4c7;padding:9px 10px;text-align:right;white-space:nowrap;background:' + bg + '"><b>' + kg.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg</b></td>'
        + '</tr>';
    });
    corpo += '</tbody><tfoot><tr>'
      + '<td colspan="2" style="background:#d6e8f7;border:1px solid #9fb4c7;padding:9px 10px;text-align:left;font-weight:bold">Subtotal</td>'
      + '<td style="background:#d6e8f7;border:1px solid #9fb4c7;padding:9px 10px;text-align:right;white-space:nowrap;font-weight:bold">' + sub.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg</td>'
      + '</tr></tfoot></table>';
  });

  return '<div style="font-family:Arial,sans-serif;color:#102a43;text-align:left">'
    + '<div style="font-size:22px;font-weight:bold;color:#0b3558;margin:0 0 4px">PEDIDO DE COMPRA · CASA DE TINTAS</div>'
    + '<div style="font-size:13px;color:#52697d;margin:0 0 22px">' + new Date().toLocaleDateString('pt-BR') + '</div>'
    + corpo
    + '<div style="margin-top:18px;border:2px solid #0b5fa5;background:#eaf3fb;padding:12px 14px;text-align:right;font-size:18px;font-weight:bold">Total geral: ' + totalKg.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg</div>'
    + '</div>';
}

async function tintaCompraCopiar() {
  const t = _tintaCompraTexto();
  const h = _tintaCompraHtmlCopiar();
  if (!t) { toast('Nenhum item no pedido.'); return; }

  try {
    if (navigator.clipboard && window.ClipboardItem && h) {
      const item = new ClipboardItem({
        'text/html': new Blob([h], { type: 'text/html' }),
        'text/plain': new Blob([t], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      toast('Pedido copiado com formulário azul e branco.');
      return;
    }
    await navigator.clipboard.writeText(t);
    toast('Pedido copiado em texto.');
  } catch (_) {
    try {
      const area = document.createElement('div');
      area.contentEditable = 'true';
      area.style.position = 'fixed';
      area.style.left = '-99999px';
      area.innerHTML = h || escapeHtml(t).replace(/\n/g,'<br>');
      document.body.appendChild(area);
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(area);
      sel.removeAllRanges(); sel.addRange(range);
      const ok = document.execCommand && document.execCommand('copy');
      sel.removeAllRanges();
      area.remove();
      if (ok) { toast('Pedido copiado com formulário.'); return; }
    } catch (__) {}
    try { prompt('Copie o pedido:', t); } catch (__) { toast('Não consegui copiar.'); }
  }
}"""

s=rep(s,old,new,"copiar rico")

s=rep(s, '>v4.638.41<small id="verData"', '>v4.638.42<small id="verData"', "badge")
s=rep(s, "const APP_VER = '4.638.41';", "const APP_VER = '4.638.42';", "APP_VER")
s=rep(s, '<script src="./tinta-nfe-v4.638.22.js?v=4.638.41"></script>', '<script src="./tinta-nfe-v4.638.22.js?v=4.638.42"></script>', "script NF-e")
s=rep(s, '<script src="./tinta-balanco-historico-v4.638.30.js?v=4.638.41"></script>', '<script src="./tinta-balanco-historico-v4.638.30.js?v=4.638.42"></script>', "script balanço")
s=rep(s, '<script src="./tinta-saida-sugestoes-v4.638.32.js?v=4.638.41"></script>', '<script src="./tinta-saida-sugestoes-v4.638.32.js?v=4.638.42"></script>', "script saída")
p.write_text(s,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
w=rep(w, '// Produção Rioplastic — v4.638.41', '// Produção Rioplastic — v4.638.42', 'sw versão')
w=rep(w, "const CACHE = 'producao-rioplastic-v4.638.41';", "const CACHE = 'producao-rioplastic-v4.638.42';", 'sw cache')
sw.write_text(w,encoding='utf-8')
