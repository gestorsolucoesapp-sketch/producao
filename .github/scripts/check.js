#!/usr/bin/env node
/* Verificação automática do app antes de publicar — criado em 04/08/2026.
   Roda em toda alteração do index.html ou do sw.js. Cada teste aqui nasceu de
   um erro que já foi ao ar em produção. */
const fs = require('fs');
let erros = [], avisos = [];
const falha = m => erros.push(m);
const aviso = m => avisos.push(m);

const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

// ---------- 1) o <script> inline tem que ser JS válido ----------
const blocos = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!blocos.length) falha('nenhum <script> inline encontrado no index.html');
const js = blocos.sort((a, b) => b.length - a.length)[0];
fs.writeFileSync('/tmp/_app.js', js);

// ---------- 2) BUMP TRIPLO ----------
// v3.605 subiu pela metade; o Pareto quebrou por falta de conferência.
const mVer = html.match(/APP_VER\s*=\s*'([\d.]+)'/);
const mSelo = html.match(/>v([\d.]+)<small id="verData"/);
const mCache = sw.match(/CACHE\s*=\s*'producao-rioplastic-v([\d.]+)'/);
if (!mVer) falha('APP_VER não encontrado');
if (!mSelo) falha('selo de versão (>vX.Y.Z<small id="verData") não encontrado');
if (!mCache) falha('CACHE não encontrado no sw.js');
if (mVer && mSelo && mVer[1] !== mSelo[1]) falha(`bump incompleto: APP_VER ${mVer[1]} mas o selo diz ${mSelo[1]}`);
if (mVer && mCache && mVer[1] !== mCache[1]) falha(`bump incompleto: APP_VER ${mVer[1]} mas o CACHE do sw.js diz ${mCache[1]}`);
if (mVer) console.log('versão:', mVer[1]);

// ---------- 3) VARIÁVEL USADA SEM DECLARAR ----------
// Foi exatamente isto que travou o Painel: pts.forEach(p => ... _rotBarra[i] ...)
// com o índice i inexistente. Ficou no ar da v3.570 à v3.575.
try {
  const acorn = require('acorn'), walk = require('acorn-walk');
  const ast = acorn.parse(js, { ecmaVersion: 2022, locations: true });
  const decl = new Set();
  const pat = q => {
    if (!q) return;
    if (q.type === 'Identifier') decl.add(q.name);
    else if (q.type === 'AssignmentPattern') pat(q.left);
    else if (q.type === 'RestElement') pat(q.argument);
    else if (q.type === 'ObjectPattern') q.properties.forEach(x => pat(x.value || x.argument));
    else if (q.type === 'ArrayPattern') q.elements.forEach(pat);
  };
  walk.full(ast, n => {
    if (n.type === 'VariableDeclarator') pat(n.id);
    if (/Function/.test(n.type)) { if (n.id) decl.add(n.id.name); (n.params || []).forEach(pat); }
    if (n.type === 'CatchClause') pat(n.param);
    if (n.type === 'ClassDeclaration' && n.id) decl.add(n.id.name);
  });
  const conhecidos = new Set(Object.getOwnPropertyNames(globalThis).concat(
    ['window','document','navigator','location','console','fetch','alert','confirm','prompt','localStorage','sessionStorage',
     'setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','caches','CSS','NodeFilter','DataTransfer',
     'CanvasRenderingContext2D','SpeechSynthesisUtterance','speechSynthesis','getComputedStyle','matchMedia','structuredClone',
     'XMLHttpRequest','FileReader','FormData','Image','CustomEvent','MutationObserver','IntersectionObserver','ResizeObserver',
     'TextDecoder','TextEncoder','btoa','atob','crypto','performance','history','screen','queueMicrotask','AbortController',
     'supabase','pdfjsLib','Tesseract','RioParsers','XLSX','Sortable','arguments']));
  const faltando = new Map();
  walk.ancestor(ast, { Identifier(n, anc) {
    const pai = anc[anc.length - 2]; if (!pai) return;
    if (pai.type === 'MemberExpression' && pai.property === n && !pai.computed) return;
    if (pai.type === 'Property' && pai.key === n && !pai.computed) return;
    if (pai.type === 'VariableDeclarator' && pai.id === n) return;
    if (/Function/.test(pai.type) && (pai.id === n || (pai.params || []).includes(n))) return;
    if (/Labeled|Break|Continue/.test(pai.type)) return;
    if (pai.type === 'MethodDefinition' && pai.key === n) return;
    if (!decl.has(n.name) && !conhecidos.has(n.name)) {
      if (!faltando.has(n.name)) faltando.set(n.name, []);
      faltando.get(n.name).push(n.loc.start.line);
    }
  }});
  faltando.forEach((linhas, nome) => falha(`variável "${nome}" usada sem declaração (linha ${linhas.slice(0, 3).join(', ')} do script)`));
} catch (e) { aviso('análise de variáveis não rodou: ' + e.message); }

// ---------- 4) FUNÇÃO CHAMADA NO HTML QUE NÃO EXISTE ----------
// onclick apontando para função inexistente falha em silêncio no clique.
const decls = new Set([...js.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1])
  .concat([...js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\(|[A-Za-z_$][\w$]*\s*=>)/g)].map(m => m[1]))
  .concat([...js.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1])));
// palavras-chave do JS e metodos nativos: nao sao funcoes do app
const metodos = new Set(['if','for','while','switch','return','typeof','catch','try','function','new','delete','void','seguinte',
  'add','remove','toggle','contains','click','focus','blur','preventDefault','stopPropagation','closest',
  'getElementById','querySelector','querySelectorAll','setItem','getItem','removeItem','map','filter','forEach','join','split',
  'replace','slice','push','catch','then','stringify','parse','reload','open','print','alert','confirm','prompt','parseInt',
  'parseFloat','Number','String','Boolean','encodeURIComponent','decodeURIComponent','Date','Math','JSON','isNaN','showPicker','select']);
const chamadas = new Set();
for (const m of html.matchAll(/on(?:click|change|input|submit|keyup|keydown|blur|focus|search)\s*=\s*(["'])([\s\S]*?)\1/g))
  for (const f of m[2].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) chamadas.add(f[1]);
[...chamadas].filter(f => !decls.has(f) && !metodos.has(f)).forEach(f => falha(`onclick chama "${f}()", que não existe no JS`));

// ---------- 5) armadilhas conhecidas ----------
if (/localStorage\.setItem\(\s*['"]rp_org_setor/.test(js)) aviso('voltou a gravar preferência de setor no aparelho');
const dup = {};
[...js.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].forEach(m => { dup[m[1]] = (dup[m[1]] || 0) + 1; });
Object.entries(dup).filter(([, n]) => n > 1).forEach(([f, n]) => falha(`função "${f}" declarada ${n}× — o JS usa a última e a primeira vira código morto`));
if (!fs.existsSync('.nojekyll')) falha('.nojekyll sumiu — o build do Pages volta a levar mais de uma hora');

// ---------- resultado ----------
console.log('');
avisos.forEach(a => console.log('AVISO  ' + a));
if (erros.length) { erros.forEach(e => console.log('ERRO   ' + e)); console.log(`\n${erros.length} problema(s). Publicação bloqueada.`); process.exit(1); }
console.log(`Tudo certo${avisos.length ? ` (${avisos.length} aviso[s])` : ''}.`);
