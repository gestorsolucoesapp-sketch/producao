// Produção Rioplastic — service worker (abre do cache, revalida atrás; auto-update)
const CACHE = 'producao-rioplastic-v4.344.0';
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
/* 21/08/2026 — DOIS CACHES, E ESTE É O CONSERTO QUE FALTAVA.
   Até aqui havia um cache só, com o nome carregando a versão do app. O activate
   apaga todo cache cujo nome não seja o atual — então CADA publicação jogava
   fora o logo, os ícones, o manifest, a vinheta E os 2,2 MB do app.js, e a
   abertura seguinte rebaixava tudo. Publiquei dezoito versões em 21/08: foram
   dezoito faxinas completas. Era isso que deixava a tela preta esperando o logo.

   Agora:
     CACHE_ASSET  — imagens, ícones e manifest. O nome NÃO tem a versão do app,
                    porque esses arquivos não mudam quando o código muda. Sobrevive
                    a qualquer número de deploys.
     CACHE        — index.html e app.js, que mudam a cada versão. Este sim é
                    limpo no activate.

   E a vinheta.mp4 (641 KB) SAIU da lista: o vídeo foi removido da splash na
   v3.207.0 e a tela de abertura é HTML puro desde então. O arquivo continuava
   sendo pré-baixado em toda instalação, sem nada para reproduzir. */
const CACHE_ASSET = 'producao-rioplastic-assets-v1';
/* 22/08/2026: o supabase.js entra no pré-carregamento. Ele saiu do CDN e virou
   arquivo nosso — se ficar de fora daqui, a primeira abertura depois de cada
   deploy busca 212 KB pela rede antes do app existir, que era o problema. */
const APP_SHELL = ['./logo_rioplastic.png', './logo_splash.png', './icon-180.png', './icon-192.png', './ia-logo.png', './manifest.webmanifest', './supabase.js?v=2.112.3'];

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
/* 21/08/2026 — O JS SAIU DO INDEX.
   Até a 3.962 o index.html tinha 2,4 MB, dos quais 2,2 MB eram um <script>
   inline. Isso obrigava o Safari a PARSEAR E COMPILAR 2,2 MB de JavaScript em
   toda abertura: o cache de bytecode do navegador é por URL de script, e script
   inline não tem URL própria — ele morre junto com o HTML, que muda a cada
   versão. Era esse o 1,5 a 3 s de tela parada no iPhone.

   Agora o JS é app.js?v=X.Y.Z. A URL só muda quando a versão muda, então:
     - o Safari guarda o bytecode compilado e reaproveita nas próximas aberturas;
     - o app.js cai na regra cache-first lá embaixo e nem vai à rede;
     - e o index.html, que é o arquivo revalidado a cada abertura, passou de
       2,4 MB para 189 KB.
   O app.js NÃO entra no APP_SHELL: ele é gravado no cache no primeiro pedido,
   e assim uma versão velha nunca fica presa no pré-carregamento. */
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
    const ca = await caches.open(CACHE_ASSET);
    /* só baixa o que ainda não está guardado — numa versão nova do app, nada
       aqui precisa ser buscado de novo. */
    await Promise.all(APP_SHELL.map(async u => {
      try { if (!(await ca.match(u))) await ca.add(u); } catch (_) {}
    }));
    const c = await caches.open(CACHE);
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
      /* CACHE_ASSET fica: é o que impede a faxina de imagens a cada versão */
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== CACHE_ASSET).map(k => caches.delete(k))))
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
    /* imagem/ícone/manifest vai para o cache que sobrevive ao deploy; o resto
       (app.js) para o cache da versão. */
    /* supabase.js entra como ASSET de propósito: é biblioteca de terceiro, não
       muda quando o código do app muda. No cache da versão ele seria apagado a
       cada publicação e rebaixado 212 KB na abertura seguinte. */
    const ehAsset = /\.(png|jpg|jpeg|svg|webp|ico|mp4|webmanifest)$/i.test(url.pathname) || /supabase\.js$/.test(url.pathname);
    const cache = await caches.open(ehAsset ? CACHE_ASSET : CACHE);
    const cacheado = await cache.match(e.request);
    const rede = fetch(e.request).then(r => {
      if (r && r.ok) cache.put(e.request, r.clone());
      return r;
    }).catch(() => null);
    if (cacheado) { e.waitUntil(rede); return cacheado; }
    return (await rede) || new Response('', { status: 504 });
  })());
});
