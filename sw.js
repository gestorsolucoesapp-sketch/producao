// Produção Rioplastic — v4.638.53 · padronização entre dispositivos
// Hotfix de recuperação: navegação e JavaScript priorizam a rede para não executar código antigo em cache.
const CACHE = 'producao-rioplastic-v4.638.53';
const CACHE_ASSET = 'producao-rioplastic-assets-v3';
const INDEX = './index.html';
const ASSETS = [
  './logo_rioplastic.png',
  './logo_splash.png',
  './icon-180.png',
  './icon-192.png',
  './ia-logo.png',
  './manifest.webmanifest',
  './supabase.js?v=2.112.3',
  './ui-standard-v4.638.55.js?v=4.638.55'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const assets = await caches.open(CACHE_ASSET);
    await Promise.all(ASSETS.map(async url => {
      try {
        const resposta = await fetch(url, { cache: 'no-store' });
        if (resposta && resposta.ok) await assets.put(url, resposta.clone());
      } catch (_) {}
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(
      nomes
        .filter(nome => nome !== CACHE && nome !== CACHE_ASSET)
        .map(nome => caches.delete(nome))
    );
    await self.clients.claim();

    // Força qualquer app/PWA já aberto a recarregar usando a versão recém-ativada.
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clientes.map(async cliente => {
      try {
        const u = new URL(cliente.url);
        if (u.origin === self.location.origin) await cliente.navigate(cliente.url);
      } catch (_) {}
    }));
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'ATIVAR_AGORA') self.skipWaiting();
  if (event.data === 'LIMPAR_CACHE') {
    event.waitUntil((async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.map(nome => caches.delete(nome)));
    })());
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // O parâmetro ?monitor=1 ativava uma renderização visual alternativa dos gráficos
  // (barras únicas por desempenho). O padrão oficial é a visão normal, com as barras
  // proporcionais por turno. Removemos apenas esse parâmetro em navegações.
  if (event.request.mode === 'navigate' && url.searchParams.has('monitor')) {
    url.searchParams.delete('monitor');
    const clean = url.pathname + (url.search ? url.search : '') + (url.hash || '');
    event.respondWith(Response.redirect(clean, 302));
    return;
  }

  const ehIndex = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  const ehNavegacao = ehIndex && event.request.mode === 'navigate';

  // Recuperação: sempre tenta a versão mais nova do HTML primeiro.
  if (ehNavegacao) {
    event.respondWith((async () => {
      const app = await caches.open(CACHE);
      try {
        const resposta = await fetch(INDEX + '?v=4.638.55', { cache: 'no-store' });
        if (resposta && resposta.ok) {
          const original = await resposta.text();
          const tag = '<script src="./ui-standard-v4.638.55.js?v=4.638.55"></script>';
          const html = original.includes('ui-standard-v4.638.55.js')
            ? original
            : original.replace(/<\/head>/i, tag + '</head>');
          const headers = new Headers(resposta.headers);
          headers.set('Cache-Control','no-store, no-cache, must-revalidate');
          const normalizada = new Response(html, {status: resposta.status, statusText: resposta.statusText, headers});
          await app.put(INDEX, normalizada.clone());
          return normalizada;
        }
      } catch (_) {}
      const guardado = await app.match(INDEX);
      return guardado || new Response('Sem conexão e sem cópia local.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })());
    return;
  }

  // JavaScript também prioriza a rede para impedir execução das versões 4.638.18/19 em cache.
  if (/\.js$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const app = await caches.open(CACHE);
      try {
        const resposta = await fetch(event.request, { cache: 'no-store' });
        if (resposta && resposta.ok) {
          await app.put(event.request, resposta.clone());
          return resposta;
        }
      } catch (_) {}
      return (await app.match(event.request)) || new Response('', { status: 504 });
    })());
    return;
  }

  event.respondWith((async () => {
    const ehManifest = /\.webmanifest$/i.test(url.pathname);
    const ehAsset = /\.(png|jpg|jpeg|svg|webp|ico|mp4|webmanifest)$/i.test(url.pathname)
      || /supabase\.js$/i.test(url.pathname);
    const cache = await caches.open(ehAsset ? CACHE_ASSET : CACHE);
    if (ehManifest) {
      try {
        const resposta = await fetch(event.request, { cache: 'no-store' });
        if (resposta && resposta.ok) await cache.put(event.request, resposta.clone());
        return resposta;
      } catch (_) {
        return (await cache.match(event.request)) || new Response('', { status: 504 });
      }
    }
    const guardado = await cache.match(event.request);
    if (guardado) return guardado;
    try {
      const resposta = await fetch(event.request);
      if (resposta && resposta.ok) await cache.put(event.request, resposta.clone());
      return resposta;
    } catch (_) {
      return new Response('', { status: 504 });
    }
  })());
});
