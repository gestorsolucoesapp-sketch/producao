/* Rioplastic · Iniflex por sessão do portal · v4.638.46 */
(function () {
  const OWNER_ID = '1d3ee6e7-62bc-440c-a705-50106ff44e3e';
  let st = null, busy = false;

  const dono = () => {
    try { return typeof perfil !== 'undefined' && perfil && String(perfil.id || '') === OWNER_ID; }
    catch (_) { return false; }
  };
  const esc = s => {
    try { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    catch (_) { return String(s == null ? '' : s); }
  };
  function badge(txt, tipo) {
    const b = document.getElementById('iniflexApiBadge'); if (!b) return;
    b.textContent = txt;
    b.style.background = tipo === 'ok' ? '#E7F7EE' : tipo === 'erro' ? '#FDEBEB' : '#EEF3F8';
    b.style.color = tipo === 'ok' ? '#08783E' : tipo === 'erro' ? '#B3261E' : 'var(--navy)';
  }
  async function call(payload) {
    if (!dono()) throw new Error('Acesso restrito ao Iniflex.');
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.access_token) throw new Error('Sessão do app expirada.');
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(SB_URL + '/functions/v1/iniflex-portal-session', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':'Bearer ' + session.access_token},
        body: JSON.stringify(payload || {}),
        signal: ctl.signal
      });
      const d = await r.json().catch(() => null);
      if (!d) throw new Error('Sem resposta do conector Iniflex.');
      if (!r.ok || d.ok === false) throw new Error(d.erro || ('HTTP ' + r.status));
      return d;
    } finally { clearTimeout(tm); }
  }
  function cab() {
    const card = document.getElementById('iniflexApiCard');
    if (!card) return null;
    const tit = card.querySelector('.titulo-sec'), desc = card.querySelector('.desc');
    if (tit) tit.textContent = '🔐 Iniflex · sessão do portal';
    if (desc) desc.textContent = 'Conexão pelo login normal do Iniflex, sem usar a integração PINT002/API oficial.';
    return card;
  }
  function desenha(s) {
    const card = cab(), body = document.getElementById('iniflexApiBody');
    if (!card || !body) return;
    if (!s || !s.credenciais_configuradas) {
      badge('configurar acesso', null);
      body.innerHTML =
        '<div style="padding:10px 12px;background:var(--leve-2);border-radius:10px;line-height:1.55;font-size:12.5px">'
        + '<b>Primeiro acesso</b><br>Guarde uma vez seu usuário e senha do Iniflex nos <b>Secrets do Supabase</b>. '
        + 'Eles não ficam no código do app. Depois disso, aqui aparece apenas o botão de conectar.'
        + '</div>'
        + '<button class="btn btn-borda" style="width:auto;margin-top:10px" onclick="iniflexAbrirSecrets()">⚙️ Abrir configuração segura</button>';
      return;
    }
    if (s.connected) {
      badge('conectado', 'ok');
      body.innerHTML =
        '<div style="padding:10px 12px;background:#E7F7EE;border-radius:10px">'
        + '<b style="color:#08783E">✅ Iniflex conectado</b>'
        + '<div class="desc" style="margin-top:3px">Usuário: <b>' + esc(s.login || 'Iniflex') + '</b></div></div>'
        + '<p class="desc" style="margin:9px 0 11px">A sessão está protegida no Supabase Vault. Agora podemos usar essa sessão para buscar os relatórios do portal.</p>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + '<button class="btn btn-borda" style="width:auto" onclick="iniflexPortalAtualizar()">🔄 Testar sessão</button>'
        + '<button class="btn btn-borda" style="width:auto;color:var(--perigo)" onclick="iniflexPortalSair()">Desconectar</button>'
        + '</div>';
    } else {
      badge(s.configured ? 'sessão expirada' : 'pronto para conectar', null);
      body.innerHTML =
        '<p class="desc">Credenciais protegidas encontradas. Toque abaixo para abrir uma nova sessão no Iniflex.</p>'
        + '<button id="ifpBtnConectar" class="btn btn-verde" style="width:auto" onclick="iniflexPortalConectar()">🔐 Conectar ao Iniflex</button>'
        + '<div style="margin-top:10px;font-size:11.5px;color:var(--fraco)">A senha fica nos Secrets do Supabase e não é enviada para o JavaScript do app.</div>';
    }
  }
  async function render(forcar) {
    const card = cab(); if (!card) return;
    if (!dono()) { card.style.display = 'none'; return; }
    card.style.display = '';
    if (busy) return;
    if (st && !forcar) { desenha(st); return; }
    const body = document.getElementById('iniflexApiBody');
    badge('verificando…', null);
    if (body) body.innerHTML = '<p class="desc"><span class="spin"></span> Verificando sessão do Iniflex…</p>';
    busy = true;
    try { st = await call({action:'status'}); desenha(st); }
    catch (e) {
      badge('indisponível', 'erro');
      if (body) body.innerHTML = '<p style="color:var(--perigo);font-size:13px">❌ ' + esc((e && e.message) || e) + '</p>';
    } finally { busy = false; }
  }
  window.iniflexPortalConectar = async function () {
    if (busy) return; busy = true;
    const b = document.getElementById('ifpBtnConectar');
    if (b) { b.disabled = true; b.innerHTML = '<span class="spin"></span> Conectando…'; }
    try {
      st = await call({action:'login_saved'});
      desenha(st);
      try { toast('✅ Iniflex conectado'); } catch (_) {}
    } catch (e) {
      try { toast('❌ ' + ((e && e.message) || e)); } catch (_) {}
      st = null;
    } finally {
      busy = false;
      if (!st || !st.connected) render(true);
    }
  };
  window.iniflexPortalAtualizar = function () { st = null; return render(true); };
  window.iniflexPortalSair = async function () {
    if (busy) return; busy = true;
    try { await call({action:'logout'}); st={connected:false,configured:false,credenciais_configuradas:true}; desenha(st); }
    catch (e) { try { toast('❌ ' + ((e && e.message) || e)); } catch (_) {} }
    finally { busy=false; }
  };
  window.iniflexAbrirSecrets = function () {
    window.open('https://supabase.com/dashboard/project/bweblwmgwutzdvqtpbww/settings/functions', '_blank', 'noopener');
  };

  try { iniflexApiRender = render; } catch (_) {}
  window.iniflexPortalRender = render;
})();