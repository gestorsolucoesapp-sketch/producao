const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const html = fs.readFileSync('index.html', 'utf8');
const js = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
const ast = acorn.parse(js, { ecmaVersion: 2022 });
function source(name) {
  const n = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  assert.ok(n, name);
  return js.slice(n.start, n.end);
}
function context(pages) {
  const calls = [], messages = [];
  const sb = { from(table) {
    const orders = [];
    return { select() { return this; }, order(name) { orders.push(name); return this; },
      async range(start) { calls.push({ table, start, orders }); return pages.shift() || { data: [] }; }
    };
  }};
  const c = vm.createContext({ sb, console: { warn() {} }, toast: m => messages.push(m) });
  vm.runInContext('let _itemMaqCache = null, _progHist = null;\n' + source('carregarItemMaquina') + '\n' + source('_progCarregarHist'), c);
  return { c, calls, messages };
}
const row = { item_cod: 'A', recurso_cod: '601', kg_total: 10, vezes: 2, ultimo_dia: '2026-09-19' };
(async () => {
  // A failed page must not poison either the base or derived cache; next call retries.
  const a = context([{ error: { message: 'timeout' } }, { data: [row] }]);
  assert.equal(Object.keys(await a.c._progCarregarHist()).length, 0);
  assert.equal(vm.runInContext('_itemMaqCache === null && _progHist === null', a.c), true);
  assert.equal((await a.c._progCarregarHist()).A['601'], 2);
  await a.c._progCarregarHist();
  assert.equal(a.calls.length, 2);
  assert.deepEqual(a.calls[1].orders, ['item_cod', 'recurso_cod']);
  assert.equal(a.messages.length, 1);

  const b = context([{ data: Array(1000).fill(row) }, { error: { message: 'timeout' } }, { data: [row] }]);
  assert.equal(Object.keys(await b.c.carregarItemMaquina()).length, 0);
  assert.equal(vm.runInContext('_itemMaqCache', b.c), null);
  assert.equal((await b.c.carregarItemMaquina()).A.length, 1);
  assert.deepEqual(b.calls.map(x => x.start), [0, 1000, 0]);

  const empty = context([{ data: [] }]);
  await empty.c.carregarItemMaquina(); await empty.c.carregarItemMaquina();
  assert.equal(empty.calls.length, 1); // A genuine empty result is cacheable.

  const capped = context(Array.from({ length: 40 }, () => ({ data: Array(1000).fill(row) })));
  assert.equal(Object.keys(await capped.c.carregarItemMaquina()).length, 0);
  assert.equal(vm.runInContext('_itemMaqCache', capped.c), null);

  // Successful sector batches survive a later failure; only failed items are retried.
  const fn = source('atrDetalhe');
  const begin = fn.indexOf('const setorDoItem = {}');
  const end = fn.indexOf('const est = {};', begin);
  assert.ok(begin >= 0 && end > begin);
  const batches = [], memo = { set: {}, setVisto: {} };
  let fail = true;
  const c = vm.createContext({ opDoItem: {}, rp: Array.from({ length: 251 }, (_, i) => ({ item_cod: String(i) })),
    _atrMemo: memo, _mudo: false, toast() {}, console: { warn() {} },
    sb: { from() { return { select() { return this; }, async in(key, ids) {
      batches.push([...ids]);
      if (ids.includes('250') && fail) return { error: { message: 'timeout' } };
      return { data: ids.map(item_cod => ({ item_cod, setor: 'Termoformagem' })) };
    }}; }} });
  const sector = '(async () => { ' + fn.slice(begin, end) + '; return setorDoItem; })()';
  assert.equal(Object.keys(await vm.runInContext(sector, c)).length, 250);
  assert.equal(memo.setVisto['250'], undefined);
  fail = false;
  assert.equal(Object.keys(await vm.runInContext(sector, c)).length, 251);
  assert.deepEqual(batches.map(x => x.length), [250, 1, 1]);
  console.log('OK: retries, partial failures, derived cache, empty results, pagination cap and sector batches.');
})().catch(e => { console.error(e); process.exitCode = 1; });
