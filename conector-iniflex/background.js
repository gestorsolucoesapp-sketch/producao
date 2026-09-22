const CONNECTOR_VERSION = '0.1.0';
const INIFLEX_HOME = 'https://sistema.rioplastic.com.br/portal/#/';

async function findIniflexTab() {
  const tabs = await chrome.tabs.query({ url: 'https://sistema.rioplastic.com.br/*' });
  if (!tabs || !tabs.length) return null;
  return tabs
    .map(tab => {
      const u = String(tab.url || '');
      let score = 0;
      if (u.includes('/portal/')) score += 100;
      if (u.includes('/login/')) score += 50;
      if (/Iniflex/i.test(String(tab.title || ''))) score += 25;
      if (tab.active) score += 5;
      return { tab, score };
    })
    .sort((a, b) => b.score - a.score)[0].tab;
}

async function inspectIniflex(tabId) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      const safeGet = (storage, key) => {
        try { return storage.getItem(key) || ''; } catch (_) { return ''; }
      };
      const parseJson = value => {
        try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
      };

      const browserSessionId = safeGet(localStorage, 'arcturus.session');
      const browserNavigatorId = safeGet(localStorage, 'arcturus.navigator');
      const environment = safeGet(sessionStorage, 'arc.portal.environment') || 'Padrao';
      const runtimeSession = parseJson(safeGet(sessionStorage, 'arc.portal.session'));
      const portalKeyPresent = !!safeGet(sessionStorage, 'arcturus.portal.key');

      let runtimeCheck = 'not-tested';
      let runtimeHttp = null;

      if (runtimeSession && runtimeSession.id && browserSessionId) {
        try {
          const headers = {
            Accept: 'application/json, text/plain, */*',
            'X-SessionID': 'Arcturus ' + browserSessionId
          };
          if (browserNavigatorId) headers['X-SessionNav'] = 'Nav ' + browserNavigatorId;
          const portalKey = safeGet(sessionStorage, 'arcturus.portal.key');
          if (portalKey) headers['X-SessionToken'] = portalKey;

          const url = '/api/v1/runtime/environments/' +
            encodeURIComponent(environment) +
            '/getSession?id=' + encodeURIComponent(String(runtimeSession.id));

          const response = await fetch(url, { headers, cache: 'no-store' });
          runtimeHttp = response.status;
          const raw = (await response.text()).trim();
          let returnedToken = raw;
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'string') returnedToken = parsed;
            else if (parsed && typeof parsed.token === 'string') returnedToken = parsed.token;
          } catch (_) {}

          if (response.ok) {
            runtimeCheck = runtimeSession.token
              ? (returnedToken === String(runtimeSession.token) ? 'valid' : 'reachable')
              : 'reachable';
          } else {
            runtimeCheck = 'http-' + response.status;
          }
        } catch (_) {
          runtimeCheck = 'network-error';
        }
      }

      const isPortal = location.pathname.includes('/portal/');
      const isLogin = location.pathname.includes('/login/');
      const hasRuntimeSession = !!(runtimeSession && runtimeSession.id);

      return {
        ok: true,
        pageUrl: String(location.href || ''),
        title: String(document.title || ''),
        isPortal,
        isLogin,
        environment,
        hasBrowserSessionId: !!browserSessionId,
        hasBrowserNavigatorId: !!browserNavigatorId,
        hasRuntimeSession,
        portalKeyPresent,
        runtimeCheck,
        runtimeHttp,
        authenticated: isPortal && hasRuntimeSession && !isLogin
      };
    }
  });

  const result = injected && injected[0] ? injected[0].result : null;
  if (!result) throw new Error('Não consegui ler a sessão do Iniflex.');
  return result;
}

async function getStatus() {
  const tab = await findIniflexTab();
  if (!tab || !tab.id) {
    return {
      ok: true,
      connectorVersion: CONNECTOR_VERSION,
      iniflexTabFound: false,
      authenticated: false
    };
  }

  try {
    const info = await inspectIniflex(tab.id);
    return {
      ok: true,
      connectorVersion: CONNECTOR_VERSION,
      iniflexTabFound: true,
      tabId: tab.id,
      tabTitle: tab.title || '',
      ...info
    };
  } catch (error) {
    return {
      ok: false,
      connectorVersion: CONNECTOR_VERSION,
      iniflexTabFound: true,
      tabId: tab.id,
      error: String(error && error.message ? error.message : error)
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = String((message || {}).action || '');

  (async () => {
    if (action === 'status' || action === 'ping') {
      sendResponse(await getStatus());
      return;
    }

    if (action === 'open_iniflex') {
      const existing = await findIniflexTab();
      if (existing && existing.id) {
        await chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
        sendResponse({ ok: true, reused: true, tabId: existing.id });
        return;
      }
      const tab = await chrome.tabs.create({ url: INIFLEX_HOME, active: true });
      sendResponse({ ok: true, reused: false, tabId: tab.id });
      return;
    }

    sendResponse({ ok: false, error: 'Ação não permitida nesta versão do conector.' });
  })().catch(error => {
    sendResponse({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  });

  return true;
});
