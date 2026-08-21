// Produção Rioplastic — service worker (abre do cache, revalida atrás; auto-update)
const CACHE = 'producao-rioplastic-v3.953.1';
/* 20/08/2026 (João: "sumiu o logo, muito lento") - DUAS CAUSAS, uma só linha.
   1) o logo do cabeçalho é logo_rioplastic.png e NUNCA esteve nesta lista, então
      nunca era pré-guardado;
   2) a lista tinha a vinheta de 641 KB, e o addAll é tudo-ou-nada: no 4G o
      download da vinheta falhava e a gravação inteira ia junto — nenhuma imagem
      ficava em cache, e toda abertura buscava tudo pela rede de novo.
   Agora: gravado um a um para que a falha de um arquivo não derrube os outros. */
/* 20/08/2026 - a vinheta VOLTA para a lista. Tirei na 3.928 achando que ela só
   pesava, mas a splash espera o vídeo: sem cache, ela baixava 641 KB pelo 4G
   com a tela preta. */
const APP_SHELL = ['./logo_rioplastic.png', './logo_splash.png', './icon-180.png', './icon-192.png', './ia-logo.png', './manifest.webmanifest', './vinheta.mp4'];

/* 21/08/2026 (João: "está travando muito") — A CAUSA PRINCIPAL ESTAVA AQUI.
   Até a 3.952 a navegação era NETWORK-FIRST com `cache:'no-store'` e
   `?t=Date.now()`. Isso quer dizer: TODA abertura do app baixava o index.html
   inteiro (680 KB gzipado, 2,4 MB crus) do zero, sem aproveitar nem o cache
   HTTP, nem a borda do CDN do GitHub, nem o cache de bytecode do Safari — a URL
   era diferente a cada vez. Na 4G da fábrica isso era o timeout de 2,2s de tela
   parada em cada abertura, mais o parse de 2,1 MB de JS logo em seguida.

   Agora é STALE-WHILE-REVALIDATE: responde do cache na hora (abertura
   instantânea) e revalida atrás com `cache:'no-cache'` — que manda o ETag e
   recebe 304 sem corpo quando nada mudou. Ou seja: abertura normal passou de
   680 KB para ~200 bytes de rede.

   O auto-update NÃO se perde: quando o João publica, o sw.js muda, o
   `reg.update()` detecta, o install abaixo já grava o index novo no cache e o
   controllerchange recarrega. O caminho do deploy é o mesmo de sempre. */

const IDX = './index.html';
const VERK = './__appver';   // chave interna: guarda a versão que está no cache

const lerVer = txt => { const m = /APP_VER\s*=\s*'([^']+)'/.exec(txt || ''); return m ? m[1] : ''; };

async function verNoCache(c) {
  try { const r = await c.match(VERK); return r ? await r.text() : ''; } catch (_) { return ''; }
}

/* busca o index e grava se mudou. Devolve a versão nova, ou '' se nada mudou. */
async function revalidarIndex(c, avisar) {
  try {
    // no-cache (e não no-store): revalida por ETag. Igual = 304 sem corpo.
    const r = await fetch(IDX, { cache: 'no-cache' });
    if (!r || !r.ok) return '';
    const txt = await r.clone().text();
    const nova = lerVer(txt);
    const atual = await verNoCache(c);
    if (nova && atual && nova === atual) return '';   // nada mudou, não regrava
    await c.put(IDX, r.clone());
    if (nova) await c.put(VERK, new Response(nova, { headers: { 'Content-Type': 'text/plain' } }));
    if (avisar && atual && nova && nova !== atual) {
      const cls = await self.clients.matchAll({ type: 'window' });
      cls.forEach(cl => { try { cl.postMessage({ tipo: 'VERSAO_NOVA', versao: nova }); } catch (_) {} });
    }
    return nova;
  } catch (_) { return ''; }
}

self.addEventListener('install', e => {
  self.skipWaiting();          // assume assim que instala, sem ficar em espera
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(u => c.add(u).catch(() => {})));
    // index SEMPRE da rede na instalação: é o que faz o deploy chegar no celular.
    // (era aqui que entrava versão velha na casca nova)
    try {
      const r = await fetch(IDX, { cache: 'reload' });
      if (r && r.ok) {
        const txt = await r.clone().text();
        await c.put(IDX, r.clone());
        const v = lerVer(txt);
        if (v) await c.put(VERK, new Response(v, { headers: { 'Content-Type': 'text/plain' } }));
      }
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
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = await c.match(IDX);
      if (guardado) {
        // pinta AGORA com a cópia local e confere a versão atrás, sem segurar a tela
        e.waitUntil(revalidarIndex(c, true));
        return guardado;
      }
      // primeira abertura (ou cache limpo): não tem jeito, precisa da rede
      try {
        const r = await fetch(IDX, { cache: 'reload' });
        if (r && r.ok) {
          const txt = await r.clone().text();
          e.waitUntil((async () => {
            await c.put(IDX, r.clone());
            const v = lerVer(txt);
            if (v) await c.put(VERK, new Response(v, { headers: { 'Content-Type': 'text/plain' } }));
          })());
          return r;
        }
        throw new Error('resposta ruim');
      } catch (_) {
        return new Response('Sem conexão e sem cópia local.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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
