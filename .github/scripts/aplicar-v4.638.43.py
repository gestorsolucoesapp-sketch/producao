from pathlib import Path

def rep(text, old, new, label):
    n=text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {n}")
    return text.replace(old,new,1)

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# Card da integração direta, antes do importador manual.
old_html='''      <div id="cardHorarios"></div>
      <div class="card">
        <div class="titulo-sec">Importar relatórios do ERP</div>'''
new_html='''      <div id="cardHorarios"></div>
      <div class="card" id="iniflexApiCard" style="display:none;border-left:4px solid var(--verde)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <div class="titulo-sec" style="margin:0">🔗 Integração direta Iniflex</div>
            <div class="desc" style="margin-top:3px">Consulta a API oficial do ERP sem baixar PDF. A importação manual continua disponível abaixo.</div>
          </div>
          <span id="iniflexApiBadge" class="chip">verificando…</span>
        </div>
        <div id="iniflexApiBody" style="margin-top:12px"><p class="desc">Verificando configuração…</p></div>
      </div>
      <div class="card">
        <div class="titulo-sec">Importar relatórios do ERP</div>'''
s=rep(s,old_html,new_html,"card Iniflex")

# Ao entrar em Importar, atualiza também o card da API.
old_switch="if (qual === 'importar') { carregarSaudeImport(); carregarConfImport(); try { renderFila(); renderHorariosImport(); } catch (_) {} }"
new_switch="if (qual === 'importar') { carregarSaudeImport(); carregarConfImport(); try { renderFila(); renderHorariosImport(); iniflexApiRender(); } catch (_) {} }"
s=rep(s,old_switch,new_switch,"gatilho aba Importar")

anchor="/* ===== FILA DE RELATÓRIOS — Gmail → banco → app ====="
pos=s.find(anchor)
if pos < 0: raise SystemExit("âncora fila não encontrada")

js=r'''
/* ===== INIFLEX DIRETO — v4.638.43 =====
   A API é consultada no servidor (Edge Function), nunca do navegador diretamente.
   O token só cruza esta tela uma vez, por HTTPS, e é guardado no Supabase Vault.
   Nesta etapa a API fica em PREVIA: ela não substitui os PDFs até compararmos os
   dados reais do ERP com as tabelas que já alimentam o app. */
let _iniflexApiStatus = null;
let _iniflexApiBusy = false;

async function iniflexApiCall(payload) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !session.access_token) throw new Error('Sessão expirada. Saia e entre novamente.');
  const ctrl = new AbortController();
  const tm = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, 120000);
  try {
    const r = await fetch(SB_URL + '/functions/v1/iniflex-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal
    });
    const d = await r.json().catch(() => null);
    if (!d) throw new Error('A integração não devolveu uma resposta válida.');
    if (!r.ok || d.ok === false) throw new Error(d.erro || ('HTTP ' + r.status));
    return d;
  } finally { clearTimeout(tm); }
}

function _infBadge(txt, tipo) {
  const b = $('iniflexApiBadge'); if (!b) return;
  b.textContent = txt;
  b.style.background = tipo === 'ok' ? '#E7F7EE' : tipo === 'erro' ? '#FDEBEB' : '#EEF3F8';
  b.style.color = tipo === 'ok' ? '#08783E' : tipo === 'erro' ? '#B3261E' : 'var(--navy)';
}

function _infFmtData(iso) {
  if (!iso || String(iso).length < 10) return '—';
  return String(iso).slice(0,10).split('-').reverse().join('/');
}

function _infRegrasHtml(R) {
  if (!R) return '';
  return '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--leve-6);font-size:12px;line-height:1.6">'
    + '<b>Regras já mapeadas:</b><br>'
    + '054/621/622/624/643/646: ' + _infFmtData(R.mes_ini) + ' → ' + _infFmtData(R.ontem) + '<br>'
    + 'RSMI005/010: ' + _infFmtData(R.tres_meses_ini) + ' → ' + _infFmtData(R.hoje) + '<br>'
    + 'REST196 e RVEN002: ' + _infFmtData(R.seis_atras) + ' → ' + _infFmtData(R.seis_frente) + '<br>'
    + 'REST241 e RGER339: sem período · RVEN304: Pedido + Proposta, sem período'
    + '</div>';
}

async function iniflexApiRender(forcar) {
  const card = $('iniflexApiCard'); if (!card) return;
  if (!(souAdmin || souDev)) { card.style.display = 'none'; return; }
  card.style.display = '';
  const body = $('iniflexApiBody');
  if (_iniflexApiBusy) return;
  if (_iniflexApiStatus && !forcar) { _iniflexApiDesenha(_iniflexApiStatus); return; }
  _infBadge('verificando…');
  body.innerHTML = '<p class="desc"><span class="spin"></span> Verificando API…</p>';
  try {
    _iniflexApiStatus = await iniflexApiCall({ action: 'status', empresa: 3 });
    _iniflexApiDesenha(_iniflexApiStatus);
  } catch (e) {
    _infBadge('indisponível','erro');
    body.innerHTML = '<p style="color:var(--perigo);font-size:13px">❌ ' + escapeHtml((e && e.message) || String(e)) + '</p>'
      + '<button class="btn btn-borda" style="width:auto;margin-top:8px" onclick="iniflexApiRender(true)">Tentar novamente</button>';
  }
}

function _iniflexApiDesenha(S) {
  const body = $('iniflexApiBody'); if (!body) return;
  const ok = !!(S && S.configured);
  _infBadge(ok ? 'token configurado' : 'aguardando token', ok ? 'ok' : '');
  let h = '';
  if (!ok) {
    h += '<div style="padding:10px 12px;border:1px solid var(--linha);border-radius:11px;background:var(--leve-6)">'
      + '<div style="font-weight:800;color:var(--navy);margin-bottom:5px">1. Gerar a chave no Iniflex</div>'
      + '<div class="desc">Abra <b>PINT002 · Cadastro de Integrações</b>, crie/abra a integração PL/SQL e gere a chave. Não envie a chave no chat.</div>'
      + '</div>';
  } else {
    h += '<div style="font-size:13px;margin-bottom:10px">✅ API preparada no servidor. O token está protegido no <b>Supabase Vault</b> e não fica salvo neste navegador.</div>';
  }
  h += '<div style="margin-top:10px;display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:8px;align-items:end">'
    + '<div class="campo" style="margin:0"><label>Chave / token Iniflex' + (ok ? ' (só preencha para trocar)' : '') + '</label>'
    + '<input id="iniflexApiToken" type="password" autocomplete="new-password" placeholder="' + (ok ? '••••••••••••' : 'Cole aqui a chave gerada no PINT002') + '"></div>'
    + '<button class="btn btn-verde" style="width:auto;min-width:150px" onclick="iniflexApiSalvar()">🔐 Salvar e testar</button>'
    + '</div>'
    + '<details style="margin-top:8px"><summary class="desc" style="cursor:pointer">configuração avançada</summary>'
    + '<div class="campo" style="margin-top:8px"><label>Endpoint</label><input id="iniflexApiUrl" value="' + escapeHtml((S && S.base_url) || 'https://sistema.rioplastic.com.br/api/v1/runtime/endpoint/integracao/iniflex/json') + '"></div>'
    + '</details>';

  if (ok) {
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
      + '<button class="btn btn-verde" id="iniflexPrevBtn" style="width:auto" onclick="iniflexApiPreview()">🔎 Comparar API com o banco</button>'
      + '<button class="btn btn-borda" style="width:auto" onclick="iniflexApiPreviewExtra()">Estoque + OS (prévia)</button>'
      + '<button class="btn btn-borda" style="width:auto" onclick="iniflexApiRender(true)">↻ Atualizar status</button>'
      + '</div>'
      + '<div class="desc" style="margin-top:8px">🔒 Modo seguro: estes testes <b>não gravam nem apagam</b> produção, perdas, paradas ou consumo.</div>';
  }
  h += _infRegrasHtml(S && S.regras) + '<div id="iniflexApiResultado" style="margin-top:12px"></div>';
  body.innerHTML = h;
}

async function iniflexApiSalvar() {
  if (_iniflexApiBusy) return;
  const inp = $('iniflexApiToken');
  const token = String(inp && inp.value || '').trim();
  if (!token) { toast('Cole a chave do PINT002 para testar.'); return; }
  const url = String(($('iniflexApiUrl') && $('iniflexApiUrl').value) || 'https://sistema.rioplastic.com.br/api/v1/runtime/endpoint/integracao/iniflex/json').trim();
  if (inp) inp.value = ''; // some da tela antes mesmo da chamada
  _iniflexApiBusy = true; _infBadge('testando…');
  const out = $('iniflexApiResultado'); if (out) out.innerHTML = '<p class="desc"><span class="spin"></span> Validando a chave direto no Iniflex…</p>';
  try {
    const d = await iniflexApiCall({ action:'configure', empresa:3, token:token, base_url:url });
    _iniflexApiStatus = null;
    toast('✅ Chave do Iniflex validada e protegida no Vault.');
    await iniflexApiRender(true);
  } catch (e) {
    _infBadge('token não validado','erro');
    if (out) out.innerHTML = '<p style="color:var(--perigo);font-size:13px">❌ ' + escapeHtml((e && e.message) || String(e)) + '</p>';
    toast('Não consegui validar a chave do Iniflex.');
  } finally { _iniflexApiBusy = false; }
}

async function _infBancoContagens(R) {
  const r = {};
  const cfg = [
    ['producao','producao'], ['perdas','perdas'], ['paradas','paradas'], ['consumo','consumo']
  ];
  await Promise.all(cfg.map(async ([k,t]) => {
    try {
      const q = await sb.from(t).select('id',{count:'exact',head:true}).gte('dia',R.mes_ini).lte('dia',R.ontem);
      r[k] = q.error ? null : q.count;
    } catch (_) { r[k] = null; }
  }));
  return r;
}

function _infPrevTabela(d, banco) {
  const nomes = { producao:'Produção', perdas:'Perdas', paradas:'Paradas', consumo:'Consumo', estoque:'Estoque', os:'Ordens de serviço' };
  const ks = Object.keys(d.resultados || {});
  let h = '<div style="overflow:auto"><table class="tbl"><thead><tr><th>Fonte API</th><th>Linhas API</th><th>Banco atual</th><th>Status</th></tr></thead><tbody>';
  ks.forEach(k => {
    const x = d.resultados[k] || {};
    const b = banco && Object.prototype.hasOwnProperty.call(banco,k) ? banco[k] : null;
    h += '<tr><td><b>' + escapeHtml(nomes[k] || k) + '</b><div class="desc">' + escapeHtml(x.grupo || '') + '</div></td>'
      + '<td>' + (x.ok ? fmt(x.quantidade || 0,0) : '—') + '</td>'
      + '<td>' + (b == null ? '—' : fmt(b,0)) + '</td>'
      + '<td>' + (x.ok ? '<span style="color:var(--verde);font-weight:800">✓ respondeu</span>' : '<span style="color:var(--perigo)">✕ ' + escapeHtml(x.erro || 'falhou') + '</span>') + '</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="desc" style="margin-top:8px">As contagens servem para validação técnica; API e PDF podem ter granularidades diferentes. Nada foi substituído.</div>';
  return h;
}

async function iniflexApiPreview() {
  if (_iniflexApiBusy) return;
  _iniflexApiBusy = true;
  const b = $('iniflexPrevBtn'); if (b) { b.disabled=true; b.textContent='Consultando…'; }
  const out = $('iniflexApiResultado'); if (out) out.innerHTML = '<p class="desc"><span class="spin"></span> Consultando Produção, Perdas, Paradas e Consumo direto no Iniflex…</p>';
  try {
    const d = await iniflexApiCall({ action:'preview', empresa:3, datasets:['producao','perdas','paradas','consumo'] });
    const banco = await _infBancoContagens(d.regras || (_iniflexApiStatus && _iniflexApiStatus.regras) || {});
    if (out) out.innerHTML = _infPrevTabela(d,banco);
    toast('✅ Prévia da API concluída. Nenhum dado foi alterado.');
  } catch (e) {
    if (out) out.innerHTML = '<p style="color:var(--perigo);font-size:13px">❌ ' + escapeHtml((e && e.message) || String(e)) + '</p>';
  } finally {
    _iniflexApiBusy=false;
    if (b) { b.disabled=false; b.textContent='🔎 Comparar API com o banco'; }
  }
}

async function iniflexApiPreviewExtra() {
  if (_iniflexApiBusy) return;
  _iniflexApiBusy=true;
  const out=$('iniflexApiResultado'); if(out) out.innerHTML='<p class="desc"><span class="spin"></span> Consultando Estoque e Ordens de Serviço…</p>';
  try {
    const d=await iniflexApiCall({action:'preview',empresa:3,datasets:['estoque','os']});
    if(out) out.innerHTML=_infPrevTabela(d,{});
    toast('✅ Prévia Estoque + OS concluída.');
  } catch(e) {
    if(out) out.innerHTML='<p style="color:var(--perigo);font-size:13px">❌ '+escapeHtml((e&&e.message)||String(e))+'</p>';
  } finally { _iniflexApiBusy=false; }
}

'''
s=s[:pos]+js+s[pos:]

# Versão/cache.
s=rep(s, '>v4.638.42<small id="verData"', '>v4.638.43<small id="verData"', "badge")
s=rep(s, "const APP_VER = '4.638.42';", "const APP_VER = '4.638.43';", "APP_VER")
s=s.replace('?v=4.638.42"></script>', '?v=4.638.43"></script>')
p.write_text(s,encoding="utf-8")

sw=Path("sw.js")
w=sw.read_text(encoding="utf-8")
w=rep(w,'// Produção Rioplastic — v4.638.42','// Produção Rioplastic — v4.638.43','sw versão')
w=rep(w,"const CACHE = 'producao-rioplastic-v4.638.42';","const CACHE = 'producao-rioplastic-v4.638.43';",'sw cache')
sw.write_text(w,encoding="utf-8")
