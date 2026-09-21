// Produção Rioplastic — v4.638.19
// Cache limpo, sem reescrever/injetar código dentro do index.html.
const CACHE = 'producao-rioplastic-v4.638.19';
const CACHE_ASSET = 'producao-rioplastic-assets-v1';
const INDEX = './index.html';
const ASSETS = [
  './logo_rioplastic.png',
  './logo_splash.png',
  './icon-180.png',
  './icon-192.png',
  './ia-logo.png',
  './manifest.webmanifest',
  './supabase.js?v=2.112.3'
];

async function atualizarIndex(cache) {
  try {
    const resposta = await fetch(INDEX, { cache: 'reload' });
    if (resposta && resposta.ok) {
      await cache.put(INDEX, resposta.clone());
      return resposta;
    }
  } catch (_) {}
  return null;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const assets = await caches.open(CACHE_ASSET);
    await Promise.all(ASSETS.map(async url => {
      try {
        if (!(await assets.match(url))) await assets.add(url);
      } catch (_) {}
    }));
    const app = await caches.open(CACHE);
    await atualizarIndex(app);
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

  const ehIndex = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  const ehNavegacao = ehIndex && event.request.mode === 'navigate';

  if (ehNavegacao) {
    event.respondWith((async () => {
      const app = await caches.open(CACHE);
      const guardado = await app.match(INDEX);
      const rede = atualizarIndex(app);
      if (guardado) {
        event.waitUntil(rede);
        return guardado;
      }
      return (await rede) || new Response(
        'Sem conexão e sem cópia local.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    })());
    return;
  }

  event.respondWith((async () => {
    const ehAsset = /\.(png|jpg|jpeg|svg|webp|ico|mp4|webmanifest)$/i.test(url.pathname)
      || /supabase\.js$/i.test(url.pathname);
    const cache = await caches.open(ehAsset ? CACHE_ASSET : CACHE);
    const guardado = await cache.match(event.request);
    const rede = fetch(event.request).then(resposta => {
      if (resposta && resposta.ok) cache.put(event.request, resposta.clone());
      return resposta;
    }).catch(() => null);
    if (guardado) {
      event.waitUntil(rede);
      return guardado;
    }
    return (await rede) || new Response('', { status: 504 });
  })());
});
