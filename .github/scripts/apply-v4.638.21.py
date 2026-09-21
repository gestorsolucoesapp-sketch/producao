from pathlib import Path

def rep(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {n}")
    return text.replace(old, new, 1)

p = Path("index.html")
s = p.read_text(encoding="utf-8")

s = rep(s, '>v4.638.20<small id="verData"', '>v4.638.21<small id="verData"', "versao cabecalho")
s = rep(s, "const APP_VER = '4.638.20';", "const APP_VER = '4.638.21';", "APP_VER")
s = rep(s,
    "const SETORES_PADRAO = ['Termoformagem', 'Impressão', 'Extrusão', 'Rotulagem', 'Sleeve', 'Embaladeiras', 'Manutenção', 'KIT', 'Qualidade', 'PCP / Programação', 'Almoxarifado', 'Administrativo', 'Outro'];",
    "const SETORES_PADRAO = ['Termoformagem', 'Impressão', 'Extrusão', 'Rotulagem', 'Sleeve', 'Embaladeiras', 'Injeção', 'Compressão', 'Manutenção', 'KIT', 'Qualidade', 'PCP / Programação', 'Almoxarifado', 'Administrativo', 'Outro'];",
    "setores padrao")
s = rep(s, "  'Impressão': [702, 703, 704, 705, 706, 707, 708, 709, 710],", "  'Impressão': [702, 703, 704, 705, 706, 707, 708, 709, 710, 711],", "maquina 711")
s = rep(s, "  'Sleeve': [1901, 1902, 1903],", "  'Sleeve': [1901, 1902, 1903, 1904],", "maquina 1904")
s = rep(s, "  'Extrusão': [501, 502, 503, 504, 505, 506, 507],", "  'Extrusão': [500, 501, 502, 503, 504, 505, 506, 507],", "maquina 500")
s = rep(s,
    "  // 1804 e 1904 NAO existem no chao de fabrica (confirmado pelo Joao em 31/07/2026)\n  // e nunca produziram: manter no mapa criava maquina fantasma nas metas, nos",
    "  // 1804 continua fora do cadastro. A 1904 pertence ao Sleeve e voltou ao mapa\n  // conforme a lista atual da fábrica; manter máquina inexistente criaria fantasma nas metas, nos",
    "comentario maquinas")
s = rep(s,
    '<button id="btnDicas" onclick="togDicas()" title="Esconder as dicas e deixar só os dados" aria-label="Dicas" style="background:transparent;border:0;font-size:18px;cursor:pointer;padding:4px">💬</button>',
    '<button id="btnDicas" onclick="togDicas()" title="Informações e explicações" aria-label="Informações" style="background:transparent;border:0;font-size:21px;cursor:pointer;padding:4px">ⓘ</button>',
    "icone informacoes")
s = rep(s,
    "  const labels = {onlineBadge:'Usuários online',btnBanco:'Espaço do banco',btnTema:'Aparência',btnAtualizar:'Atualizar aplicativo',btnDicas:'Explicações',btnInstalar:'Instalar aplicativo',btnSair:'Sair'};\n  ['verBadge','onlineBadge','btnBanco','btnInstalar','atalhoApps','btnSair'].forEach(id => {",
    "  const labels = {onlineBadge:'Usuários online',btnBanco:'Espaço do banco',btnTema:'Aparência',btnAtualizar:'Atualizar aplicativo',btnDicas:'Informações',btnInstalar:'Instalar aplicativo',btnSair:'Sair',atalhoApps:'Atalhos de aplicativos'};\n  ['btnBanco','btnTema','btnInstalar','btnSair'].forEach(id => {",
    "menu opcoes")
s = rep(s,
    "  ['btnTema','btnAtualizar','btnDicas'].forEach(id => { const el=$(id); if(el){ if(labels[id]){el.dataset.rpLabel=labels[id];el.setAttribute('aria-label',labels[id]);} acoesTopo.appendChild(el); } });",
    "  ['btnAtualizar','atalhoApps','btnDicas'].forEach(id => { const el=$(id); if(el){ if(labels[id]){el.dataset.rpLabel=labels[id];el.setAttribute('aria-label',labels[id]);} acoesTopo.appendChild(el); } });",
    "acoes topo")

css_old = """body.rp-organizado #topoFixo .h-acoes{order:initial;flex:0 0 auto;gap:4px!important}
body.rp-organizado #topoFixo .h-acoes>button{position:relative!important;inset:auto!important;transform:none!important;min-width:36px;min-height:36px;margin:0!important}"""
css_new = """body.rp-organizado #topoFixo .h-acoes{order:initial;flex:0 0 auto;gap:4px!important}
body.rp-organizado #topoFixo .h-acoes>button{position:relative!important;inset:auto!important;transform:none!important;min-width:36px;min-height:36px;margin:0!important}
body.rp-organizado #topoFixo #btnDicas,body.rp-organizado #topoFixo #rpOpcoesBtn{color:#fff!important;opacity:1!important;text-shadow:none!important}
body.rp-organizado #topoFixo #verBadge,body.rp-organizado #topoFixo #onlineBadge{position:relative!important;inset:auto!important;transform:none!important;margin:0!important;flex:none;color:#fff!important;border:1px solid rgba(255,255,255,.18)!important;background:rgba(255,255,255,.10)!important;box-shadow:none!important}
body.rp-organizado #topoFixo #verBadge{padding:4px 7px!important;font-size:10px!important;min-width:64px}
body.rp-organizado #topoFixo #verBadge #verData{font-size:8px!important;margin-top:2px!important;white-space:nowrap}
body.rp-organizado #topoFixo #onlineBadge{padding:5px 7px!important;font-size:10px!important;white-space:nowrap}
body.rp-organizado #topoFixo #atalhoApps{position:relative!important;inset:auto!important;transform:none!important;float:none!important;flex:none;align-items:center;gap:3px;margin:0!important;padding:0!important;background:transparent!important}
body.rp-organizado #topoFixo #atalhoApps a{display:inline-flex!important;align-items:center;justify-content:center;min-width:34px;min-height:34px;padding:4px 5px!important;border-radius:9px;background:rgba(255,255,255,.08);color:#fff!important}
body.rp-organizado #topoFixo #atalhoApps img{display:block;max-width:72px;height:auto;max-height:20px;object-fit:contain}
@media(max-width:680px){
  body.rp-organizado #topoFixo .h-linha{flex-wrap:wrap!important;row-gap:4px}
  body.rp-organizado #topoFixo .marca{flex:1 1 100%!important}
  body.rp-organizado #topoFixo .h-acoes{flex:1 1 100%!important;justify-content:flex-end;gap:3px!important}
  body.rp-organizado #topoFixo #verBadge{min-width:58px;padding:3px 5px!important}
  body.rp-organizado #topoFixo #onlineBadge{padding:4px 5px!important}
  body.rp-organizado #topoFixo #atalhoApps img{max-width:62px;max-height:18px}
}"""
s = rep(s, css_old, css_new, "css cabecalho")

s = rep(s, "let _linkApps = [];\nasync function carregarLinkApps() {", """let _linkApps = [];
/* 21/09/2026 — o atalho do STRATWs usa o logotipo oficial da Siteware. */
const _STRATWS_LOGO_OFICIAL = 'https://conteudo.siteware.com.br/hs-fs/hubfs/LOGO_STRATWS_NEGATIVO-02.png?height=24&name=LOGO_STRATWS_NEGATIVO-02.png&width=98';
function _iconeAppTopo(a) {
  const ehStratws = /stratws/i.test(String((a && a.nome) || '')) || /stratws[.]com/i.test(String((a && a.url) || ''));
  if (ehStratws) return '<img src="' + _STRATWS_LOGO_OFICIAL + '" alt="STRATWs One" width="82" height="20">';
  return '<span aria-hidden="true">' + escapeHtml((a && a.icone) || '🔗') + '</span>';
}
async function carregarLinkApps() {""", "logo Stratws")
s = rep(s,
    "      + ' style=\"text-decoration:none;font-size:17px;line-height:1;padding:2px 4px\">' + (a.icone || '🔗') + '</a>').join('');",
    "      + ' aria-label=\"Abrir ' + escapeHtml(a.nome || 'aplicativo') + '\" style=\"text-decoration:none;font-size:17px;line-height:1;padding:2px 4px\">' + _iconeAppTopo(a) + '</a>').join('');",
    "render logo Stratws")
p.write_text(s, encoding="utf-8")

nav = Path("nav-config-v4.638.17.js")
n = nav.read_text(encoding="utf-8")
n = rep(n, "#topoFixo nav{position:relative;background:#fff;border-bottom:1px solid var(--linha);z-index:25}", "#topoFixo nav{position:relative;background:#EEF3F1;border-bottom:1px solid #D8E2DD;z-index:25}", "fundo nav")
n = rep(n, "#rpNav15{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:7px 10px;background:#fff}", "#rpNav15{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:7px 10px;background:#EEF3F1}", "fundo faixa")
n = rep(n, "#topoFixo nav{order:1}", "#topoFixo nav{order:1}\n      #topoFixo nav .rp-nav-bar{background:#EEF3F1!important;border-bottom:0!important;padding:0!important}", "fundo barra")
nav.write_text(n, encoding="utf-8")

sw = Path("sw.js")
w = sw.read_text(encoding="utf-8")
w = rep(w, "// Produção Rioplastic — v4.638.20", "// Produção Rioplastic — v4.638.21", "sw versao")
w = rep(w, "const CACHE = 'producao-rioplastic-v4.638.20';", "const CACHE = 'producao-rioplastic-v4.638.21';", "sw cache")
sw.write_text(w, encoding="utf-8")
