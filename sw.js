// Produção Rioplastic — service worker (network-first no index; auto-update)
const CACHE = 'producao-rioplastic-v3.932.0';
/* 20/08/2026 (João: "sumiu o logo, muito lento") - DUAS CAUSAS, uma só linha.
   1) o logo do cabeçalho é logo_rioplastic.png e NUNCA esteve nesta lista, então
      nunca era pré-guardado;
   2) a lista tinha a vinheta de 641 KB, e o addAll é tudo-ou-nada: no 4G o
      download da vinheta falhava e a gravação inteira ia junto — nenhuma imagem
      ficava em cache, e toda abertura buscava tudo pela rede de novo.
   Agora: só o que a tela precisa para pintar, sem o vídeo, e gravado um a um
   para que a falha de um arquivo não derrube os outros. A vinheta e os ícones
   grandes continuam sendo guardados, mas depois, quando forem pedidos. */
/* 20/08/2026 - a vinheta VOLTA para a lista. Tirei na 3.928 achando que ela só
   pesava, mas a splash espera o vídeo: sem cache, ela baixava 641 KB pelo 4G
   com a tela preta. O problema original era o addAll tudo-ou-nada, e esse já
   está resolvido com o add individual abaixo. */
const APP_SHELL = ['./logo_rioplastic.png', './logo_splash.png', './icon-180.png', './icon-192.png', './ia-logo.png', './manifest.webmanifest', './vinheta.mp4'];

self.addEventListener('install', e => {
  self.skipWaiting();          // assume assim que instala, sem ficar em espera
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(u => c.add(u).catch(() => {})));
    // index.html SEMPRE da rede, ignorando o cache HTTP do navegador.
    // (era aqui que entrava versão velha na casca nova)
    try {
      const r = await fetch('./index.html?t=' + Date.now(), { cache: 'no-store' });
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
        /* 4,5s era muito para 4G: a tela ficava em branco esperando 2,2 MB antes
           de desistir e usar a cópia local. 2,2s mostra o app quase na hora e a
           versão nova entra na próxima abertura. */
        const t = setTimeout(() => ctrl.abort(), 2200);
        // consegue devolver uma cópia antiga guardada na borda.
        // ?t=agora: URL única a cada abertura. Com ?v=versão o SW velho pedia a
        // URL da versão velha e o CDN devolvia a cópia antiga da borda — ele
        // nunca recebia o HTML novo que o tiraria do impasse.
        const r = await fetch('./index.html?t=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
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
