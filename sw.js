// Produção Rioplastic — service worker (network-first no index; auto-update)
const CACHE = 'producao-rioplastic-v3.119.1';
const APP_SHELL = ['./logo_full.png', './logo_mark.png', './logo_splash.png', './vinheta.mp4', './icon-180.png', './icon-192.png', './ia-logo.png', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try { await c.addAll(APP_SHELL); } catch (_) {}
    // index.html SEMPRE da rede, ignorando o cache HTTP do navegador.
    // (era aqui que entrava versão velha na casca nova)
    try {
      const r = await fetch('./index.html?v=' + encodeURIComponent(CACHE), { cache: 'no-store' });
      if (r && r.ok) await c.put('./index.html', r.clone());
    } catch (_) {}
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'ATIVAR_AGORA') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // CDNs / Supabase seguem direto

  // sw.js sempre pela rede (detecção de update)
  if (url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
    return;
  }

  const ehNavegacao = e.request.mode === 'navigate' ||
    url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (ehNavegacao) {
    // NETWORK-FIRST com timeout: online = sempre a versão publicada;
    // offline/lento = cai no cache. Nunca mais volta de versão.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4500);
        // ?v=CACHE = URL única por versão publicada: o CDN do GitHub Pages não
        // consegue devolver uma cópia antiga guardada na borda.
        const r = await fetch('./index.html?v=' + encodeURIComponent(CACHE), { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (r && r.ok) {
          e.waitUntil(cache.put('./index.html', r.clone()));
          return r;
        }
        throw new Error('resposta ruim');
      } catch (_) {
        const c = await cache.match('./index.html');
        return c || new Response('Sem conexão e sem cópia local.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // demais assets: cache-first com revalidação garantida (e.waitUntil segura o SW vivo)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cacheado = await cache.match(e.request);
    const rede = fetch(e.request).then(r => {
      if (r && r.ok) cache.put(e.request, r.clone());
      return r;
    }).catch(() => null);
    if (cacheado) { e.waitUntil(rede); return cacheado; }
    return (await rede) || new Response('', { status: 504 });
  })());
});
