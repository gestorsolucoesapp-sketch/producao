// PARSERS RPCP — porte 1:1 do RioParsers do index.html (v3.466.0).
// NAO EDITAR A LOGICA AQUI: qualquer ajuste tem que sair do app e ser recopiado,
// senao app e servidor passam a ler o mesmo PDF de dois jeitos diferentes.
// deno-lint-ignore-file
export const RioParsers: any = (function () {

  // ---------- utilidades ----------
  const numBR = (s) => {
    if (s == null || s === '') return null;
    const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };
  const dataBR = (s) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };
  const splitRecurso = (cod, nome) => ({ recurso_cod: cod, recurso_nome: (nome || '').trim() });

  // ---------- extração de linhas (agrupa itens por Y) ----------
  async function extrairLinhas(pdf) {
    const linhas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const grupos = [];
      for (const item of tc.items) {
        if (!item.str || !item.str.trim()) continue;
        const x = item.transform[4], y = item.transform[5];
        let g = grupos.find(g => Math.abs(g.y - y) < 2.5);
        if (!g) { g = { y, itens: [] }; grupos.push(g); }
        g.itens.push({ x, w: item.width || 0, s: item.str.trim() });
      }
      grupos.sort((a, b) => b.y - a.y);
      for (const g of grupos) {
        g.itens.sort((a, b) => a.x - b.x);
        linhas.push({ pagina: p, y: g.y, itens: g.itens, texto: g.itens.map(i => i.s).join(' ') });
      }
    }
    return linhas;
  }

  // ---------- detecção da rotina ----------
  function detectarRotina(linhas) {
    const cab = linhas.slice(0, 40).map(l => l.texto).join('\n');
    const m = /ROTINA:\s*RPCP(\d{3})/.exec(cab);
    if (m) return m[1];
    if (linhas.some(l => /^Data Ordem Item\/Vers/.test(l.texto))) return '624';
    return null;
  }

  function acharPeriodo(linhas) {
    let de = null, ate = null, gerado = null;
    for (const l of linhas.slice(0, 40)) {
      if (!de) {
        const m = /(?:Per[ií]odo|Apontamentos):\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/.exec(l.texto);
        if (m) { de = dataBR(m[1]); ate = dataBR(m[2]); }
      }
      if (!gerado) {
        const g = /\bDATA:\s*(\d{2}\/\d{2}\/\d{4})/.exec(l.texto);
        if (g) gerado = dataBR(g[1]);
      }
      if (de && gerado) break;
    }
    return { de, ate, gerado };
  }

  function parseColunas(linhas, headerCols, isRecordStart, isRecordEnd) {
    let colX = null;
    const registros = [];
    let atual = null;
    const fecha = () => { if (atual) { registros.push(atual.valores); atual = null; } };

    for (const linha of linhas) {
      const t = linha.texto;
      const primeiro = headerCols[0].nome;
      if (t.startsWith(primeiro) && headerCols.every(c => t.includes(c.nome))) {
        colX = [];
        for (const c of headerCols) {
          const it = linha.itens.find(i => i.s === c.nome || i.s.startsWith(c.nome));
          colX.push({ chave: c.chave, x: it ? it.x : 0 });
        }
        colX.sort((a, b) => a.x - b.x);
        fecha();
        continue;
      }
      if (!colX) continue;
      if (isRecordEnd(t)) { fecha(); continue; }
      const inicio = isRecordStart(t);
      if (!inicio && !atual) continue;
      if (inicio) fecha();
      if (inicio) atual = { valores: {} };
      if (!atual) continue;
      for (const it of linha.itens) {
        const cx = it.x + (it.w || 0) / 2;
        let col = colX[0];
        for (const c of colX) { if (cx >= c.x - 6) col = c; else break; }
        atual.valores[col.chave] = ((atual.valores[col.chave] || '') + ' ' + it.s).trim();
      }
    }
    fecha();
    return registros;
  }

  const UNIDADES_621 = ['CX', 'KG', 'MIL', 'UN', 'PC', 'PÇ', 'RL', 'FD', 'MT'];
  function parse621(linhas) {
    const out = [];
    let dia = null, turno = null;
    for (const l of linhas) {
      let m;
      if ((m = /^Dia: (\d{2}\/\d{2}\/\d{4})$/.exec(l.texto))) { dia = dataBR(m[1]); continue; }
      if ((m = /^Turno: (\d)$/.exec(l.texto))) { turno = +m[1]; continue; }
      if (!dia || !turno) continue;
      if (/^(Total|Recurso |Recurso$|Quantidade)/.test(l.texto)) continue;
      const its = l.itens;
      if (!its || its.length < 3) continue;
      const mCod = /^(\d+) - (.+)$/.exec(its[0].s);
      if (!mCod || its[0].x > 100) continue;
      const peso = its[its.length - 1].s;
      const uni = its[its.length - 2].s;
      if (!/^[\d.,]+$/.test(peso) || !UNIDADES_621.includes(uni)) continue;
      let qtd = 0, fimNome = its.length - 2;
      const antes = its[its.length - 3];
      if (antes && /^[\d.,]+$/.test(antes.s) && antes.x > 300) { qtd = numBR(antes.s); fimNome = its.length - 3; }
      let nome = mCod[2];
      for (let i = 1; i < fimNome; i++) nome += ' ' + its[i].s;
      out.push({ dia, turno, ...splitRecurso(mCod[1], nome), quantidade: qtd, unidade: uni, peso: numBR(peso) });
    }
    return out;
  }

  function parse622(linhas, periodo) {
    const out = [];
    let turno = null, op = null, item = null;
    const rx = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}\/\d{2}\/\d{4}) (\d+) (?:(\d+) )?(\d+) - (.+?) ([\d.,]+) (CX|KG|MIL|UN|MT) ([\d.,]+) ([\d.,]+)$/;
    for (const l of linhas) {
      let m;
      if ((m = /^Turno: (\d)$/.exec(l.texto))) { turno = +m[1]; continue; }
      if ((m = /^OP: (\d+)$/.exec(l.texto))) { op = m[1]; continue; }
      if ((m = /^Item: (\d+) - (.+)$/.exec(l.texto))) { item = { cod: m[1], desc: m[2].trim() }; continue; }
      if (!turno || !op || !item) continue;
      if ((m = rx.exec(l.texto))) {
        out.push({
          dia: dataBR(m[1]) || periodo.de, turno, op,
          item_cod: item.cod, item_desc: item.desc,
          data_inicio: dataBR(m[1]), data_fim: dataBR(m[2]),
          ident: m[4] || null, ...splitRecurso(m[5], m[6]),
          quantidade: numBR(m[7]), unidade: m[8], peso: numBR(m[9])
        });
      }
    }
    return out;
  }

  function parse624(linhas, periodo) {
    const contexto = [];
    let turno = null, op = null, item = null;
    linhas.forEach((l, i) => {
      let m;
      if ((m = /^Turno: (\d)$/.exec(l.texto))) turno = +m[1];
      else if ((m = /^OP: (\d+)$/.exec(l.texto))) op = m[1];
      else if ((m = /^Item: (\d+) - (.+)$/.exec(l.texto))) item = { cod: m[1], desc: m[2].trim() };
      contexto[i] = { turno, op, item };
    });

    const cols = [
      { nome: 'Data', chave: 'data' }, { nome: 'Ordem', chave: 'ordem' },
      { nome: 'Item/Versão', chave: 'item' }, { nome: 'Acessório', chave: 'acessorio' },
      { nome: 'Tipo Perda', chave: 'tipo_perda' }, { nome: 'Recurso', chave: 'recurso' },
      { nome: 'Quantidade', chave: 'quantidade' }, { nome: 'UN', chave: 'un' },
      { nome: 'Peso', chave: 'peso' }
    ];
    const isStart = t => /^\d{2}\/\d{2}\/\d{4} \d+ /.test(t);
    const isEnd = t => /^(Total|Turno:|OP:|Item:|Data Ordem)/.test(t) || /Rioplastic|ROTINA|PÁGINA|DATA:|HORA:/.test(t);

    const registros = [];
    let colX = null, atual = null;
    const fecha = () => { if (atual) { registros.push(atual); atual = null; } };
    linhas.forEach((linha, i) => {
      const t = linha.texto;
      if (t.startsWith('Data Ordem') && t.includes('Tipo Perda')) {
        colX = cols.map(c => {
          const it = linha.itens.find(x => x.s === c.nome || x.s.startsWith(c.nome));
          return { chave: c.chave, x: it ? it.x : 0 };
        }).sort((a, b) => a.x - b.x);
        fecha(); return;
      }
      if (!colX) return;
      if (isEnd(t)) { fecha(); return; }
      const inicio = isStart(t);
      if (!inicio && !atual) return;
      if (inicio) { fecha(); atual = { valores: {}, ctx: contexto[i] }; }
      if (!atual) return;
      for (const it of linha.itens) {
        const cx = it.x + (it.w || 0) / 2;
        let col = colX[0];
        for (const c of colX) { if (cx >= c.x - 6) col = c; else break; }
        atual.valores[col.chave] = ((atual.valores[col.chave] || '') + ' ' + it.s).trim();
      }
    });
    fecha();

    return registros.map(r => {
      const v = r.valores, c = r.ctx || {};
      const md = /^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d+))?$/.exec(v.data || '');
      if (md) { v.data = md[1]; if (md[2] && !v.ordem) v.ordem = md[2]; }
      const mi = /^(\d+)\/(\d+) - (.*)$/.exec(v.item || '');
      const tp = /^(\d+) - (.*)$/.exec(v.tipo_perda || '');
      const rc = /^(\d+) - (.*)$/.exec(v.recurso || '');
      return {
        dia: dataBR(v.data) || periodo.de, turno: c.turno,
        op: c.op, item_cod: c.item ? c.item.cod : (mi ? mi[1] : null),
        item_desc: c.item ? c.item.desc : (mi ? mi[3] : null),
        item_versao: mi ? mi[2] : null,
        data: dataBR(v.data), ordem: v.ordem || null,
        acessorio: v.acessorio || null,
        tipo_perda_cod: tp ? tp[1] : null,
        tipo_perda_desc: tp ? tp[2].trim() : (v.tipo_perda || null),
        recurso_cod: rc ? rc[1] : null,
        recurso_nome: rc ? rc[2].trim() : (v.recurso || null),
        quantidade: numBR(v.quantidade), unidade: v.un || null, peso: numBR(v.peso)
      };
    }).filter(r => r.data && r.quantidade != null);
  }

  function parse054(linhas, periodo) {
    const cols = [
      { nome: 'OP', chave: 'op' }, { nome: 'Data', chave: 'data' },
      { nome: 'Tipo de Perda', chave: 'tipo_perda' }, { nome: 'Etapa Apont.', chave: 'etapa' },
      { nome: 'Cliente', chave: 'cliente' }, { nome: 'Acessório', chave: 'acessorio' },
      { nome: 'Quantidade', chave: 'quantidade' }, { nome: 'Peso', chave: 'peso' },
      { nome: 'Item', chave: 'item' }
    ];
    const regs = parseColunas(
      linhas, cols,
      t => /^\d{6,7} \d{2}\/\d{2}\/\d{4} /.test(t),
      t => /^(Totais:|Resumo por|OP Data)/.test(t) || /Rioplastic|ROTINA|PÁGINA|DATA:|HORA:/.test(t)
    );
    return regs.map(v => ({
      dia: dataBR(v.data) || periodo.de,
      op: (v.op || '').replace(/^0+/, ''), data: dataBR(v.data),
      tipo_perda_desc: v.tipo_perda || null, etapa: v.etapa || null,
      cliente: v.cliente || null, acessorio: v.acessorio || null,
      quantidade: numBR(v.quantidade), peso: numBR(v.peso), item_desc: v.item || null
    })).filter(r => r.data && r.peso != null);
  }

  function parse643(linhas, periodo) {
    const out = [];
    let motivo = null, op = null, diaRef = null, item = null;
    const rx = /^(\d{2}\/\d{2}\/\d{4}) (?:(\d+) )?(\d+) - (.+?) (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) ([\d.,]+)$/;
    for (const l of linhas) {
      let m;
      if ((m = /^Motivo Parada: (\d+) - (.+)$/.exec(l.texto))) { motivo = { cod: m[1], desc: m[2].trim() }; op = null; item = null; continue; }
      if ((m = /^OP: ?(\d*)$/.exec(l.texto))) { op = m[1] || null; continue; }
      if ((m = /^Dia: (\d{2}\/\d{2}\/\d{4})$/.exec(l.texto))) { diaRef = dataBR(m[1]); continue; }
      if ((m = /^Item: (?:(\d+) - (.+)|-)$/.exec(l.texto))) { item = m[1] ? { cod: m[1], desc: m[2].trim() } : null; continue; }
      if (!motivo) continue;
      if ((m = rx.exec(l.texto))) {
        out.push({
          dia: diaRef || periodo.de,
          motivo_cod: motivo.cod, motivo_desc: motivo.desc,
          op: m[2] || op || null,
          item_cod: item ? item.cod : null, item_desc: item ? item.desc : null,
          data: dataBR(m[1]), ...splitRecurso(m[3], m[4]),
          inicio: `${dataBR(m[5])}T${m[6]}:00`, fim: `${dataBR(m[7])}T${m[8]}:00`,
          tempo_horas: numBR(m[9]),
          tempo_exato: +(((new Date(`${dataBR(m[7])}T${m[8]}:00`)).getTime() - (new Date(`${dataBR(m[5])}T${m[6]}:00`)).getTime()) / 3600000).toFixed(4)
        });
      }
    }
    return out;
  }

  function parse646(linhas, periodo) {
    const cols = [
      { nome: 'Data', chave: 'data' }, { nome: 'OP', chave: 'op' },
      { nome: 'Componente', chave: 'componente' }, { nome: 'Recurso', chave: 'recurso' },
      { nome: 'Quantidade', chave: 'quantidade' }, { nome: 'Lote', chave: 'lote' },
      { nome: 'Peso', chave: 'peso' }
    ];
    const regs = parseColunas(
      linhas, cols,
      t => /^\d{2}\/\d{2}\/\d{4} /.test(t) && !/^(\d{2}\/\d{2}\/\d{4}) - /.test(t),
      t => /^(Total Dia:|Total Geral:|Dia: |Data OP)/.test(t) || /Rioplastic|ROTINA|PÁGINA|DATA:|HORA:/.test(t)
    );
    return regs.map(v => {
      const md = /^(\d{2}\/\d{2}\/\d{4})(?: (\d{2}:\d{2}))?/.exec(v.data || '');
      const mc = /^(\d+)\/(\d+) - (.*)$/.exec(v.componente || '');
      const rc = /^(\d+) - (.*)$/.exec(v.recurso || '');
      const mq = /^([\d.,]+)(?: (KG|CX|MIL|UN|MT))?/.exec(v.quantidade || '');
      return {
        dia: md ? dataBR(md[1]) : (periodo.de || null),
        data: md ? dataBR(md[1]) : null, hora: md && md[2] ? md[2] : null,
        op: v.op || null,
        componente_cod: mc ? mc[1] : null, componente_versao: mc ? mc[2] : null,
        componente_desc: mc ? mc[3].trim() : (v.componente || null),
        recurso_cod: rc ? rc[1] : null, recurso_nome: rc ? rc[2].trim() : (v.recurso || null),
        quantidade: mq ? numBR(mq[1]) : null, unidade: mq && mq[2] ? mq[2] : 'KG',
        lote: (v.lote || '').replace(/\s+/g, '') || null,
        peso: numBR(v.peso)
      };
    }).filter(r => r.data && r.quantidade != null);
  }

  const NOMES = {
    '621': 'Produção resumida (Dia × Turno × Recurso)',
    '622': 'Produção detalhada (Turno × OP × Item × Recurso)',
    '624': 'Perdas (Turno × OP × Item)',
    '054': 'Perdas por Tipo/Item/Cliente (rotulagem)',
    '643': 'Paradas (Motivo × OP × Dia × Item)',
    '646': 'Consumo de componentes (Dia × Recurso)',
    '264': 'Fila de produção por recurso (carga programada)'
  };

  const _264semAc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const COLS264 = [
    ['OP', 'op'], ['Produto', 'produto'], ['Versao', 'versao'], ['Cliente', 'cliente'],
    ['Entrega', 'entrega'], ['Quantidade', 'quantidade'], ['Peso', 'peso'],
    ['Inicio', 'inicio'], ['Termino', 'termino']
  ];

  function _fecha264(bloco, rec, diaFoto, horaFoto, ordem) {
    if (!bloco || !rec) return null;
    const txt = bloco.txt;
    const mOp = /\b(\d{5,8})\b/.exec(bloco.cols.op || '');
    if (!mOp) return null;
    const dts = [];
    const reDt = /(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/g;
    let m;
    while ((m = reDt.exec(txt))) dts.push('20' + m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':00-03:00');
    const mE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(txt);
    const soNum = (v) => numBR(String(v || '').replace(/[^\d.,]/g, ''));
    let quantidade = soNum(bloco.cols.quantidade);
    let peso = soNum(bloco.cols.peso);
    if (quantidade == null || peso == null) {
      const mQP = /([\d.]*\d,\d{2})\s+([\d.]*\d,\d{2})\s+\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/.exec(txt);
      if (mQP) {
        if (quantidade == null) quantidade = numBR(mQP[1]);
        if (peso == null) peso = numBR(mQP[2]);
      }
    }
    const limpa = (v) => String(v || '').replace(/\s+/g, ' ').trim() || null;
    const prod = limpa(bloco.cols.produto) || '';
    const mP = /^(\d{4,10})\s*-\s*([\s\S]*)$/.exec(prod);
    return {
      dia_foto: diaFoto, hora_foto: horaFoto,
      recurso_cod: rec.cod, recurso_nome: rec.nome,
      op: mOp[1],
      item_cod: mP ? mP[1] : null,
      item_desc: mP ? (limpa(mP[2]) || null) : (prod || null),
      versao: limpa(bloco.cols.versao),
      cliente: limpa(bloco.cols.cliente),
      entrega: mE ? (mE[3] + '-' + mE[2] + '-' + mE[1]) : null,
      quantidade: quantidade, peso: peso,
      inicio: dts[0] || null, termino: dts[1] || null, ordem: ordem
    };
  }

  function parse264(linhas, periodo) {
    const out = [];
    const diaFoto = (periodo && periodo.gerado) || null;
    let horaFoto = null;
    for (const l of linhas.slice(0, 40)) {
      const h = /\bHORA:\s*(\d{2}:\d{2}(?::\d{2})?)/.exec(l.texto);
      if (h) { horaFoto = h[1]; break; }
    }
    let rec = null, colX = null, bloco = null, ordem = 0, parou = false;
    const fecha = () => {
      if (!bloco) return;
      const r = _fecha264(bloco, rec, diaFoto, horaFoto, ordem + 1);
      if (r) { ordem++; out.push(r); }
      bloco = null;
    };
    for (const linha of linhas) {
      if (parou) break;
      const t = linha.texto;
      const tSem = _264semAc(t);
      if (/^Totaliza/i.test(tSem)) { fecha(); parou = true; break; }
      if (/^(Total\s*:|Total Geral:|ROTINA:|Fila de Produ)/i.test(tSem)) { fecha(); continue; }
      const mR = /Recurso:\s*(\d+)\s*[-\u2013]\s*(.+?)(?=\s+OP\s+Produto|$)/.exec(t);
      if (mR) { fecha(); rec = { cod: mR[1].trim(), nome: mR[2].trim() }; }
      if (/\bOP\b/.test(tSem) && /Produto/.test(tSem) && /Quantidade/.test(tSem) && /Peso/.test(tSem)) {
        const novo = [];
        for (const c of COLS264) {
          const it = linha.itens.find(i => _264semAc(i.s).startsWith(c[0]));
          if (it) novo.push({ chave: c[1], x: it.x });
        }
        if (novo.length >= 5) { fecha(); colX = novo.sort((a, b) => a.x - b.x); }
        continue;
      }
      if (!colX || !rec) continue;
      const xOp = (colX.find(c => c.chave === 'op') || { x: -999 }).x;
      const abre = linha.itens.some(i => /^\d{5,8}$/.test(i.s) && Math.abs(i.x - xOp) <= 14);
      if (abre) { fecha(); bloco = { cols: {}, txt: '' }; }
      if (!bloco) continue;
      for (const it of linha.itens) {
        const cx = it.x + (it.w || 0) / 2;
        let col = colX[0];
        for (const c of colX) { if (cx >= c.x - 6) col = c; else break; }
        bloco.cols[col.chave] = ((bloco.cols[col.chave] || '') + ' ' + it.s).trim();
      }
      bloco.txt = (bloco.txt + ' ' + t).trim();
    }
    fecha();
    if (periodo && diaFoto) { periodo.de = periodo.de || diaFoto; periodo.ate = periodo.ate || diaFoto; }
    return out;
  }

  function numAmb(s) {
    if (!s) return null;
    s = String(s).trim();
    const mDec = /[.,](\d{1,3})$/.exec(s);
    let dec = '', intp = s;
    if (mDec) { dec = mDec[1]; intp = s.slice(0, s.length - mDec[0].length); }
    intp = intp.replace(/[.,]/g, '');
    const v = parseFloat(intp + (dec ? '.' + dec : ''));
    return isNaN(v) ? null : v;
  }
  function acharTotaisPDF(linhas, rotina) {
    const t = { registros: null, quantidade: null, peso: null, tempo: null };
    if (rotina === '054') {
      let dentro = false;
      for (const l of linhas) {
        const tx = (l.texto || '').trim();
        if (/^Resumo por (Etapa|Tipo de Perda)/i.test(tx)) { dentro = true; continue; }
        if (/^Resumo por Subgrupo/i.test(tx)) { dentro = false; continue; }
        const m = dentro && /^Totais:\s*([\d.,]+)/i.exec(tx);
        if (m) { t.peso = numAmb(m[1]); break; }
      }
      return t;
    }
    for (const l of linhas) {
      const tx = (l.texto || '').trim();
      let m;
      if ((m = /Total Geral de Registros:\s*(\d[\d.]*)/i.exec(tx))) t.registros = parseInt(m[1].replace(/\D/g, ''), 10);
      if ((m = /^Total Geral:\s*([\d.,]+)(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?/i.exec(tx))) {
        const nums = [m[1], m[2], m[3]].filter(Boolean).map(numAmb);
        if (rotina === '643') t.tempo = nums[0];
        else { t.quantidade = nums[0]; if (nums[1] != null) t.peso = nums[1]; }
      }
    }
    return t;
  }

  async function parseDocumento(pdf) {
    const linhas = await extrairLinhas(pdf);
    const rotina = detectarRotina(linhas);
    if (!rotina || !NOMES[rotina]) throw new Error('Relatório não reconhecido. Esperado: RPCP621/622/624/054/643/646/264.');
    const periodo = acharPeriodo(linhas);
    let registros;
    switch (rotina) {
      case '621': registros = parse621(linhas); break;
      case '622': registros = parse622(linhas, periodo); break;
      case '624': registros = parse624(linhas, periodo); break;
      case '054': registros = parse054(linhas, periodo); break;
      case '643': registros = parse643(linhas, periodo); break;
      case '646': registros = parse646(linhas, periodo); break;
      case '264': registros = parse264(linhas, periodo); break;
    }
    const soma = (k) => registros.reduce((a, r) => a + (r[k] || 0), 0);
    return {
      rotina, nome: NOMES[rotina], periodo, registros,
      resumo: {
        linhas: registros.length,
        total_quantidade: +soma('quantidade').toFixed(3),
        total_peso: +soma('peso').toFixed(3),
        total_tempo: +soma('tempo_horas').toFixed(2),
        pdf: acharTotaisPDF(linhas, rotina)
      }
    };
  }

  return { parseDocumento, extrairLinhas, detectarRotina, numBR, dataBR, NOMES, __parse264: parse264 };
})();
