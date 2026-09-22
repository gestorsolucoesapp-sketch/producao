from pathlib import Path

def rep(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {n}")
    return text.replace(old, new, 1)

p = Path("index.html")
s = p.read_text(encoding="utf-8")

ini = s.find("function _tintaCompraTexto() {")
fim = s.find("function tintaCompraEmail() {", ini)
if ini < 0 or fim < 0:
    raise SystemExit("bloco _tintaCompraTexto não encontrado")

novo = """function _tintaCompraTexto() {
  const itens = Object.keys(_tintaCarrinho).map(id => {
    const p = _tintaSaldo.find(x => x.id === id); return p ? { p: p, q: _tintaCarrinho[id] } : null;
  }).filter(Boolean).sort((a, b) => (a.p.fornecedor || '').localeCompare(b.p.fornecedor || '') || a.p.nome.localeCompare(b.p.nome));

  let t = 'PEDIDO DE COMPRA · CASA DE TINTAS\\n' + new Date().toLocaleDateString('pt-BR') + '\\n\\n';
  const grupos = {};
  itens.forEach(x => {
    const marca = String(x.p.fornecedor || 'sem fornecedor').trim() || 'sem fornecedor';
    (grupos[marca] || (grupos[marca] = [])).push(x);
  });

  let totalKg = 0;
  Object.keys(grupos).sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(marca => {
    const G = grupos[marca];
    t += 'Solicito a compra do fornecedor ' + marca.toUpperCase() + ' das tintas abaixo:\\n\\n';
    t += 'CÓDIGO DA TINTA | COR | QUANTIDADE (KG)\\n';
    G.forEach(x => {
      const peso = (+x.p.peso_lata_kg || 2);
      const kg = (+x.q || 0) * peso;
      totalKg += kg;
      const cod = x.p.cod_erp || x.p.cod_barras || x.p.codigo || '';
      t += cod + ' | ' + x.p.nome + ' | ' + kg.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg\\n';
    });
    const sub = G.reduce((a,x)=>a + (+x.q||0) * (+x.p.peso_lata_kg||2),0);
    t += 'Subtotal: ' + sub.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg\\n\\n';
  });

  t += 'Total geral: ' + totalKg.toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' kg.\\n';
  return t;
}
"""
s = s[:ini] + novo + s[fim:]

s = rep(
    s,
    "const assunto = 'Pedido de compra · Casa de Tintas · ' + new Date().toLocaleDateString('pt-BR');",
    "const assunto = 'Solicitação de compra · Casa de Tintas · ' + new Date().toLocaleDateString('pt-BR');",
    "assunto email"
)

s = rep(s, '>v4.638.39<small id="verData"', '>v4.638.40<small id="verData"', "badge")
s = rep(s, "const APP_VER = '4.638.39';", "const APP_VER = '4.638.40';", "APP_VER")
s = rep(s, '<script src="./tinta-nfe-v4.638.22.js?v=4.638.39"></script>', '<script src="./tinta-nfe-v4.638.22.js?v=4.638.40"></script>', "script NF-e")
s = rep(s, '<script src="./tinta-balanco-historico-v4.638.30.js?v=4.638.39"></script>', '<script src="./tinta-balanco-historico-v4.638.30.js?v=4.638.40"></script>', "script balanço")
s = rep(s, '<script src="./tinta-saida-sugestoes-v4.638.32.js?v=4.638.39"></script>', '<script src="./tinta-saida-sugestoes-v4.638.32.js?v=4.638.40"></script>', "script saída")
p.write_text(s, encoding="utf-8")

sw = Path("sw.js")
w = sw.read_text(encoding="utf-8")
w = rep(w, "// Produção Rioplastic — v4.638.39", "// Produção Rioplastic — v4.638.40", "sw versão")
w = rep(w, "const CACHE = 'producao-rioplastic-v4.638.39';", "const CACHE = 'producao-rioplastic-v4.638.40';", "sw cache")
sw.write_text(w, encoding="utf-8")
