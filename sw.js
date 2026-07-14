// Produção Rioplastic — service worker (auto-update)
const CACHE = 'producao-rioplastic-v3.28.1';
const APP_SHELL = ['./index.html', './logo_full.png', './logo_mark.png', './icon-180.png', './icon-192.png', './ia-logo.png', './manifest.webmanifest'];

self.addEventListener('install', e => {
  // baixa a casca nova já na instalação
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)).catch(() => {}));
  // NÃO pula a espera sozinho aqui — quem manda pular é a página (mensagem),
  // garantindo o reload controlado (uma vez só).
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

  const ehNavegacao = e.request.mode === 'navigate' ||
    url.pathname.endsWith('/') || url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('sw.js');

  if (ehNavegacao) {
    // NETWORK-FIRST sempre pega a versão mais nova; cache só como fallback offline
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('./index.html', c)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // demais assets: cache-first com atualização em segundo plano
  e.respondWith(
    caches.match(e.request).then(cacheado => {
      const rede = fetch(e.request).then(r => {
        const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r;
      }).catch(() => cacheado);
      return cacheado || rede;
    })
  );
});
