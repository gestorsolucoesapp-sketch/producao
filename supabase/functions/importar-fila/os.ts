/* OS — porte 1:1 dos parsers RSMI010 / RSMI005 e do salvarOrdens do index.html */
// deno-lint-ignore-file

const _norm = (s: any) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function setorSugeridoFactory(setorDe: (c: any) => string) {
  return function setorSugerido(o: any) {
    if (o.recurso_cod && setorDe(o.recurso_cod) !== "Outros") return setorDe(o.recurso_cod);
    const t = _norm((o.setor || "") + " " + (o.detalhes || ""));
    if (/\bkit\b/.test(t)) return "KIT";
    if (/rotula/.test(t)) return "Rotulagem";
    if (/termoform/.test(t)) return "Termoformagem";
    if (/impress/.test(t)) return "Impressão";
    if (/extrus/.test(t)) return "Extrusão";
    if (/sleeve|posimec/.test(t)) return "Sleeve";
    if (/embalad/.test(t)) return "Embaladeiras";
    if (/predial|ilumina|utilidade|ar comprimido|eletrica geral/.test(t)) return "Predial / Utilidades";
    return "Outros";
  };
}

export function tipoOS(atividade: any, motivo: any) {
  const t = _norm((atividade || "") + " " + (motivo || ""));
  if (/ferrament|molde|estampo/.test(t)) return "Ferramentaria";
  if (/eletric|eletr/.test(t)) return "Elétrica";
  if (/mecanic/.test(t)) return "Mecânica";
  if (/hidraul|pneumat/.test(t)) return "Hidráulica";
  if (/instala/.test(t)) return "Instalação";
  if (/predial|ilumina|civil|utilidade/.test(t)) return "Predial";
  return "Outras";
}

export function ehRSMI010(linhas: any[]) {
  const topo = linhas.slice(0, 40);
  const temTitulo = topo.some((l) => /Ordens\s+Simplificadas/i.test(l.texto));
  const temRotina = topo.some((l) => /RSM.{0,2}010/i.test(l.texto));
  const temCol = linhas.slice(0, 60).some((l) => /Data\s+Encerr/i.test(l.texto));
  return temTitulo || (temRotina && temCol);
}

export function parseRSMI010(linhas: any[]) {
  const lim = (s: any) => (s == null ? "" : String(s).replace(/\s+/g, " ").trim());
  const dataHora = (t: any) => {
    const m = /(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/.exec(t || "");
    if (!m) return null;
    const [d, mo, a] = m[1].split("/");
    return a + "-" + mo + "-" + d + (m[2] ? " " + m[2] : " 00:00");
  };
  const ordens: any[] = [];
  let cur: any = null;
  const push = () => { if (cur && cur.os_num) ordens.push(cur); cur = null; };
  for (let i = 0; i < linhas.length; i++) {
    const L = linhas[i], t = L.texto || "";
    const mh = /^\s*(\d{4,})\s+(Alta|M[eé]dia|Baixa)\b/i.exec(t);
    if (mh) {
      push();
      cur = { os_num: mh[1].padStart(8, "0"), urgencia: lim(mh[2]) };
      const datas = [...t.matchAll(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?/g)].map((m: any) => m[0]);
      if (datas[0]) cur.data_abertura = dataHora(datas[0]);
      if (datas[1]) cur.data_encerramento = dataHora(datas[1]);
      const mm = /(?:^|\s)(\d{3,4})(?=\s+[A-ZÀ-Ý])/.exec(t.replace(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?/g, ""));
      if (mm) cur.recurso_cod = mm[1];
      const semData = t.replace(/^\s*\d{4,}\s+(?:Alta|M[eé]dia|Baixa)\s*/i, "").replace(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?/g, "|");
      const mp = semData.split("|").map((x: string) => lim(x)).filter(Boolean);
      if (mp.length) cur.autor = mp[mp.length - 1].replace(/\s*\d{3,4}.*$/, "").trim() || null;
      continue;
    }
    if (!cur) continue;
    if (/^\s*Detalhes\b/i.test(t)) { cur._modo = "det"; cur.detalhes = lim(t.replace(/^\s*Detalhes:?\s*/i, "")); continue; }
    if (/^\s*Conclus[aã]o\b/i.test(t)) { cur._modo = "conc"; cur.conclusao = lim(t.replace(/^\s*Conclus[aã]o:?\s*/i, "")); continue; }
    if (/^\s*Ativ\.?\s+Motivo/i.test(t)) { cur._modo = null; continue; }
    if (cur._modo === "det") cur.detalhes = lim((cur.detalhes || "") + " " + t);
    else if (cur._modo === "conc") cur.conclusao = lim((cur.conclusao || "") + " " + t);
  }
  push();
  return ordens.map((o) => ({
    os_num: o.os_num,
    data_abertura: o.data_abertura || null,
    data_encerramento: o.data_encerramento || null,
    situacao: o.data_encerramento ? "Fechada" : "Aberta",
    recurso_cod: o.recurso_cod || null,
    urgencia: o.urgencia || null,
    autor: o.autor || null,
    detalhes: o.detalhes || null,
    conclusao: o.conclusao || null,
  }));
}

export function ehRSMI005(linhas: any[]) {
  const topo = linhas.slice(0, 40);
  const temTitulo = topo.some((l) => /Ordens\s+Detalhadas/i.test(l.texto));
  const temRotina = topo.some((l) => /RSM.{0,2}005/i.test(l.texto));
  const temOS = linhas.slice(0, 120).some((l) => /^\s*OS:\s*\d{4,}\s*$/.test(l.texto));
  return (temTitulo && temOS) || (temTitulo && temRotina);
}

export function parseRSMI005(linhas: any[]) {
  const dt = (s: any) => {
    const m = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(s || "");
    return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] || "00"}:${m[5] || "00"}:00` : null;
  };
  const lim = (s: any) => (s == null ? "" : String(s).replace(/\s+/g, " ").trim());
  const num = (s: any) => {
    if (!s) return 0;
    const t = String(s).replace(/\./g, "").replace(",", ".");
    const v = parseFloat(t); return isNaN(v) ? 0 : v;
  };
  const porPag: Record<number, any[]> = {};
  linhas.forEach((l) => { (porPag[l.pagina] = porPag[l.pagina] || []).push(l); });
  const RX_SIT = /Situa[çc]?[ãa]?o?\s*(?:d[ao]\s*)?O\.?\s*S\.?\s*:?\s*(Aberta|Fechada|Encerrada|Conclu[ií]da|Cancelada|Pendente)/i;
  const VAL_SIT = /^\s*(Aberta|Fechada|Encerrada|Conclu[ií]da|Cancelada|Pendente)\s*$/i;
  let situacaoArq: any = null;
  for (let i = 0; i < linhas.length && !situacaoArq; i++) {
    const mm = RX_SIT.exec(linhas[i].texto || "");
    if (mm) situacaoArq = lim(mm[1]);
  }
  if (!situacaoArq) {
    const junto = linhas.slice(0, 200).map((l) => l.texto || "").join(" ");
    const mm2 = RX_SIT.exec(junto);
    if (mm2) situacaoArq = lim(mm2[1]);
  }
  if (!situacaoArq) {
    for (let i = 0; i < Math.min(linhas.length, 200) - 1; i++) {
      if (!/Situa[çc]?[ãa]?o/i.test(linhas[i].texto || "")) continue;
      for (let j = i + 1; j <= Math.min(i + 3, linhas.length - 1); j++) {
        const mm3 = VAL_SIT.exec(linhas[j].texto || "");
        if (mm3) { situacaoArq = lim(mm3[1]); break; }
      }
      if (situacaoArq) break;
    }
  }
  if (situacaoArq) {
    const b0 = situacaoArq.toLowerCase();
    situacaoArq = /fechad|encerrad|conclu/.test(b0) ? "Fechada" : /abert|pendent/.test(b0) ? "Aberta" : lim(situacaoArq);
  }
  const ordens: any[] = [];
  Object.keys(porPag).map(Number).sort((a, b) => a - b).forEach((pg) => {
    const ls = porPag[pg];
    let os: any = null, m: any;
    for (let i = 0; i < ls.length; i++) {
      const t = ls[i].texto;
      if ((m = /^\s*OS:\s*(\d{4,})\s*$/.exec(t))) { os = { os_num: m[1] }; continue; }
      if (!os) continue;
      if ((m = /Última\s+Altera[çc][ãa]o:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i.exec(t)))
        os.ultima_alteracao = dt(m[1]);
      if (/^\s*Setor:/i.test(t)) {
        const datas = t.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g) || [];
        if (datas[0]) os.data_parada = dt(datas[0]);
        if (datas[1]) os.data_reinicio = dt(datas[1]);
        if ((m = /Autor:\s*(.*)$/i.exec(t))) os.autor = lim(m[1]);
        let st = t.replace(/^\s*Setor:\s*/i, "");
        st = st.split(/\s*Autor:/i)[0];
        st = st.replace(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g, "");
        os.setor_erp = lim(st);
      }
      if ((m = /M[áa]quina:\s*(\d{2,5})\s*(.*?)\s*(?:Situa[çc][ãa]o\s+M[áa]quina:\s*(.*))?$/i.exec(t)) && !/Situa/i.test(m[1] || "")) {
        if (!os.recurso_cod) {
          os.recurso_cod = m[1];
          os.maquina_desc = lim(m[2]);
          if (m[3]) os.situacao_maquina = lim(m[3]);
        }
      }
      if ((m = /Urg[êe]ncia:\s*(\S+)/i.exec(t))) os.urgencia = lim(m[1]);
      if ((m = /Data\s+Abertura:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/i.exec(t))) os.data_abertura = dt(m[1]);
      if ((m = /Divis[ãa]o:\s*(.*?)\s*(?:Urg[êe]ncia:|$)/i.exec(t))) os.divisao = lim(m[1]);
      if ((m = /Atividade:\s*(.*?)\s*(?:Seq\.?:|$)/i.exec(t))) os.atividade = lim(m[1]);
      if (/^\s*Motivo:/i.test(t)) {
        if ((m = /Motivo:\s*(.*?)\s*(?:Submotivo:|Previs[ãa]o|$)/i.exec(t))) os.motivo = lim(m[1]);
        if ((m = /Submotivo:\s*(.*?)\s*(?:Previs[ãa]o|$)/i.exec(t))) os.submotivo = lim(m[1]);
      }
      if (/Detalhes:/i.test(t)) {
        if ((m = /Detalhes:\s*(.*?)\s*(?:Conclus[ãa]o:|$)/i.exec(t))) os.detalhes = lim(m[1]);
        if ((m = /Conclus[ãa]o:\s*(.*)$/i.exec(t))) os.conclusao = lim(m[1]);
        for (let j = i + 1; j < ls.length; j++) {
          const tt = ls[j].texto;
          if (/Colaboradores|Nome\s+In[íi]cio|Total\s+Custo|Observa[çc]|Entrega\s+T[ée]cnica|Assinatura/i.test(tt)) break;
          const x0 = (ls[j].itens && ls[j].itens[0]) ? ls[j].itens[0].x : 0;
          if (x0 >= 300) os.conclusao = lim((os.conclusao || "") + " " + tt);
          else os.detalhes = lim((os.detalhes || "") + " " + tt);
        }
      }
      if ((m = /Total\s+Custo\s+OS:\s*([\d.,]+)/i.exec(t))) os.custo = num(m[1]);
    }
    if (os && os.os_num) {
      os.maquina_parada = /parada/i.test(os.situacao_maquina || "");
      if (situacaoArq) os.situacao_os = situacaoArq;
      ordens.push(os);
    }
  });
  return ordens;
}

export function normalizarOS(o: any) {
  if (!o || typeof o !== "object") return o;
  const pick = (...ks: string[]) => {
    for (const k of ks) if (o[k] != null && o[k] !== "") return o[k];
    return null;
  };
  return {
    ...o,
    os_num: pick("os_num", "numero", "num_os", "n_os", "ordem", "numero_os", "os"),
    recurso_cod: pick("recurso_cod", "maquina_cod", "cod_maquina", "codigo_maquina", "maquina_codigo", "recurso", "maquina"),
    maquina_desc: pick("maquina_desc", "recurso_nome", "maquina_nome", "descricao_maquina", "desc_maquina", "nome_maquina"),
    setor: pick("setor", "area", "setor_area"),
    atividade: pick("atividade", "tipo_atividade", "tipo"),
    motivo: pick("motivo", "motivo_os"),
    submotivo: pick("submotivo"),
    urgencia: pick("urgencia", "prioridade"),
    situacao_maquina: pick("situacao_maquina", "situacao_maq", "status_maquina"),
    data_abertura: pick("data_abertura", "abertura", "dt_abertura", "data_os"),
    data_parada: pick("data_parada", "parada", "dt_parada"),
    data_reinicio: pick("data_reinicio", "reinicio", "dt_reinicio"),
    detalhes: pick("detalhes", "descricao", "descricao_problema", "problema", "obs", "observacao"),
    conclusao: pick("conclusao"),
    situacao: pick("situacao", "situacao_os"),
    data_encerramento: pick("data_encerramento", "data_encerr", "encerramento"),
    autor: pick("autor", "autor_os"),
    colaboradores: pick("colaboradores", "colaborador", "responsaveis"),
    custo: pick("custo", "custo_total", "total_custo", "custo_os", "valor"),
  };
}

export async function salvarOrdens(sb: any, ordensBrutas: any[], setorDe: (c: any) => string, simular: boolean) {
  const setorSugerido = setorSugeridoFactory(setorDe);
  const ordens = (ordensBrutas || []).map(normalizarOS);
  const { data: cfg } = await sb.from("app_config").select("valor").eq("chave", "os_roteamento").maybeSingle();
  let roteamento: any = {};
  try { roteamento = cfg?.valor ? (JSON.parse(cfg.valor) || {}) : {}; } catch (_) { roteamento = {}; }
  const { data: colegas } = await sb.from("colegas").select("id,nome");
  const nomeDe = (id: string) => { const u = (colegas || []).find((x: any) => x.id === id); return u ? (u.nome || u.email) : null; };
  const respAuto = (o: any) => {
    const v = roteamento[tipoOS(o.atividade, o.motivo)];
    const ids = Array.isArray(v) ? v : (v ? [v] : []);
    if (!ids.length) return { id: null, ids: [], nome: null };
    return { id: ids[0], ids, nome: ids.map(nomeDe).filter(Boolean).join(", ") };
  };
  const osParaReg = (o: any) => {
    const cod = o.recurso_cod ? String(o.recurso_cod).trim() : null;
    const ra = respAuto(o);
    return {
      responsavel_id: ra.id, responsavel_nome: ra.nome, responsaveis: ra.ids.length ? ra.ids.join("|") : null,
      os_num: o.os_num ? String(o.os_num).trim() : null,
      recurso_cod: cod, maquina_desc: o.maquina_desc,
      escopo: cod ? "Máquina" : "Setor/Área", setor: setorSugerido(o),
      atividade: o.atividade, motivo: o.motivo, urgencia: o.urgencia,
      maquina_parada: /parad/i.test(o.situacao_maquina || ""),
      situacao_maquina: o.situacao_maquina,
      situacao: o.situacao || o.situacao_os || null,
      data_encerramento: o.data_encerramento || null,
      autor: o.autor || null,
      data_abertura: o.data_abertura, data_parada: o.data_parada, data_reinicio: o.data_reinicio,
      detalhes: o.detalhes, conclusao: o.conclusao, colaboradores: o.colaboradores,
      custo: parseFloat(o.custo || 0) || 0,
      horas_parada: (o.data_parada && o.data_reinicio)
        ? Math.max(0, (new Date(o.data_reinicio).getTime() - new Date(o.data_parada).getTime()) / 3600000) : null,
      criado_por: null,
      criado_por_nome: "Importação automática (ERP)",
      criado_em: new Date().toISOString(),
    } as any;
  };
  const ok: string[] = [], erro: string[] = [], atualizadas: string[] = [];
  const nums = ordens.map((o) => o.os_num && String(o.os_num).trim()).filter(Boolean);
  const existentes: Record<string, any> = {};
  for (let i = 0; i < nums.length; i += 200) {
    try {
      const { data } = await sb.from("manutencao_os")
        .select("id,os_num,responsavel_id,responsavel_nome,responsaveis,iniciada_em,iniciada_por,iniciada_por_nome,criado_por,criado_por_nome,criado_em,motivo,submotivo,detalhes,conclusao,situacao,situacao_maquina,data_parada,data_reinicio,data_encerramento,autor,urgencia,atividade,custo,maquina_desc")
        .in("os_num", nums.slice(i, i + 200));
      (data || []).forEach((x: any) => existentes[x.os_num] = x);
    } catch (_) { /* segue */ }
  }
  const regs: any[] = [];
  let novas = 0;
  for (const o of ordens) {
    const reg = osParaReg(o);
    if (!reg.os_num) { erro.push("uma OS sem número"); continue; }
    const ja = existentes[reg.os_num];
    if (ja) {
      reg.id = ja.id;
      delete reg.criado_por; delete reg.criado_por_nome; delete reg.criado_em;
      if (ja.responsavel_id || ja.responsaveis) { delete reg.responsavel_id; delete reg.responsavel_nome; delete reg.responsaveis; }
      const PRESERVAR = ["motivo", "submotivo", "detalhes", "conclusao", "situacao", "situacao_maquina",
        "data_parada", "data_reinicio", "data_encerramento", "autor", "urgencia", "atividade", "custo", "maquina_desc"];
      for (const c of PRESERVAR) {
        if ((reg[c] == null || reg[c] === "") && ja[c] != null && ja[c] !== "") reg[c] = ja[c];
      }
      if (reg.data_reinicio && !ja.data_reinicio) atualizadas.push(reg.os_num);
    } else novas++;
    regs.push(reg);
  }
  const semSituacao = regs.filter((r) => !r.situacao).length;
  if (simular) {
    return {
      simulacao: true, lidas: ordens.length, gravaria: regs.length,
      novas, ja_existiam: regs.length - novas,
      fechariam_agora: atualizadas.length, sem_situacao: semSituacao,
      amostra: regs.slice(0, 2).map((r) => ({ os_num: r.os_num, situacao: r.situacao, setor: r.setor, recurso_cod: r.recurso_cod, urgencia: r.urgencia })),
      erros: erro,
    };
  }
  const LOTE = 100;
  for (let i = 0; i < regs.length; i += LOTE) {
    const parte = regs.slice(i, i + LOTE);
    const { error } = await sb.from("manutencao_os").upsert(parte, { onConflict: "os_num" });
    if (!error) { parte.forEach((r) => ok.push(r.os_num)); continue; }
    for (const r of parte) {
      const { error: e2 } = await sb.from("manutencao_os").upsert(r, { onConflict: "os_num" });
      if (e2) erro.push(r.os_num + ": " + e2.message); else ok.push(r.os_num);
    }
  }
  return {
    simulacao: false, lidas: ordens.length, gravadas: ok.length,
    novas, ja_existiam: regs.length - novas,
    fechadas_agora: atualizadas.length, sem_situacao: semSituacao, erros: erro,
  };
}

export function lerOrdens(linhas: any[], setorDe: (c: any) => string) {
  if (ehRSMI010(linhas)) {
    const lidas = parseRSMI010(linhas).map((o: any) => ({ ...o, setor: setorDe(o.recurso_cod), colaboradores: o.colaboradores || null }));
    if (lidas.length) return { layout: "RSMI010", ordens: lidas };
  }
  if (ehRSMI005(linhas)) {
    const lidas = parseRSMI005(linhas).map((o: any) => ({ ...o, setor: setorDe(o.recurso_cod), colaboradores: o.colaboradores || null }));
    if (lidas.length) return { layout: "RSMI005", ordens: lidas };
  }
  return { layout: null, ordens: [] };
}
