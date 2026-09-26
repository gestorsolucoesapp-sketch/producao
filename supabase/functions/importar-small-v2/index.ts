// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
});

let PDFJS = null;
async function getPdfjs() {
  if (PDFJS) return PDFJS;
  const mod = await import("npm:pdfjs-dist@3.11.174/legacy/build/pdf.js");
  PDFJS = typeof mod?.getDocument === "function" ? mod : mod?.default;
  if (!PDFJS?.getDocument) throw new Error("pdfjs indisponível");
  if (PDFJS.GlobalWorkerOptions) PDFJS.GlobalWorkerOptions.workerSrc = "";
  return PDFJS;
}
async function getKey() {
  const { data, error } = await sb.from("app_config").select("valor").eq("chave", "cron_key").maybeSingle();
  if (error || !data?.valor) throw new Error("cron_key ausente");
  return String(data.valor).replace(/^"|"$/g, "");
}
async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function digestText(text) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function numBR(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim().replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}
function dataBR(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function addDiasISO(iso, delta) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function inPeriod(day, start, end) {
  return !!day && day >= start && day <= end;
}
function diff(a, b) {
  if (a == null || b == null || !Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return Infinity;
  return Math.abs(Number(a) - Number(b));
}
async function fetchPdf(path) {
  const r = await fetch(`${SB_URL}/storage/v1/object/relatorios-dia/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`storage ${r.status} em ${path}`);
  return await r.arrayBuffer();
}
async function pageLines(page) {
  const tc = await page.getTextContent({ disableCombineTextItems: false });
  const items = [];
  for (const item of tc.items || []) {
    const s = String(item?.str || "").trim();
    if (!s) continue;
    items.push({ x: Number(item.transform?.[4] || 0), y: Number(item.transform?.[5] || 0), w: Number(item.width || 0), s });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const groups = [];
  for (const item of items) {
    let g = groups[groups.length - 1];
    if (!g || Math.abs(g.y - item.y) >= 2.5) {
      g = { y: item.y, itens: [] };
      groups.push(g);
    }
    g.itens.push(item);
  }
  return groups.map((g) => {
    g.itens.sort((a, b) => a.x - b.x);
    return { itens: g.itens, texto: g.itens.map((x) => x.s).join(" ").replace(/\s+/g, " ").trim() };
  });
}

const UNIDADES_621 = ["CX", "KG", "MIL", "UN", "PC", "PÇ", "RL", "FD", "MT"];
function parse621(lines, start, end) {
  const out = [];
  let dia = null, turno = null;
  const isNum = (v) => /^-?[\d.,]+$/.test(String(v || "").trim());
  const isUnit = (v) => {
    const u = String(v || "").trim().toUpperCase();
    return UNIDADES_621.includes(u) || /^[A-ZÀ-ÜÇ]{1,5}$/.test(u);
  };
  for (const l of lines) {
    let m;
    if ((m = /^Dia:\s*(\d{2}\/\d{2}\/\d{4})$/.exec(l.texto))) { dia = dataBR(m[1]); continue; }
    if ((m = /^Turno:\s*(\d)$/.exec(l.texto))) { turno = Number(m[1]); continue; }
    if (!dia || !turno || !inPeriod(dia, start, end)) continue;
    if (/^(Total|Recurso |Recurso$|Quantidade)/.test(l.texto)) continue;
    const its = l.itens || [];
    if (its.length < 3) continue;

    let pesoIdx = -1, unidadeIdx = -1;
    for (let i = its.length - 1; i >= 1; i--) {
      if (isNum(its[i]?.s) && isUnit(its[i - 1]?.s)) {
        pesoIdx = i; unidadeIdx = i - 1; break;
      }
    }
    if (pesoIdx < 0 || unidadeIdx < 1) continue;

    const unidade = String(its[unidadeIdx].s || "").trim().toUpperCase();
    const peso = numBR(its[pesoIdx].s);
    if (peso == null) continue;

    let quantidade = 0;
    let nomeFim = unidadeIdx;
    const maybeQtd = its[unidadeIdx - 1];
    if (maybeQtd && isNum(maybeQtd.s) && Number(maybeQtd.x || 0) > 280) {
      quantidade = numBR(maybeQtd.s) || 0;
      nomeFim = unidadeIdx - 1;
    }

    const left = its.slice(0, nomeFim).map(x => String(x.s || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const mCod = /^(\d+)\s*(?:-\s*)?(.*)$/.exec(left);
    if (!mCod || Number(its[0]?.x || 0) > 125) continue;
    const nome = String(mCod[2] || "").trim();
    if (!nome) continue;

    out.push({
      dia, turno,
      recurso_cod: mCod[1],
      recurso_nome: nome,
      quantidade,
      unidade,
      peso
    });
  }
  return out;
}

function parse624(lines, start, end) {
  const contexto = [];
  let recursoCausa = null, tipoPerdaGrupo = null, turno = null, op = null, item = null;
  lines.forEach((l, i) => {
    let m;
    if ((m = /^Recurso Causa:\s*(\d*)\s*-\s*(.*)$/.exec(l.texto))) recursoCausa = { cod: m[1] || null, nome: m[2].trim() };
    else if ((m = /^Tipo Perda:\s*(\d*)\s*-\s*(.*)$/.exec(l.texto))) tipoPerdaGrupo = { cod: m[1] || null, nome: m[2].trim() };
    else if ((m = /^Turno:\s*(\d)$/.exec(l.texto))) turno = Number(m[1]);
    else if ((m = /^OP:\s*(\d+)$/.exec(l.texto))) op = m[1];
    else if ((m = /^Item:\s*(\d+)\s*-\s*(.+)$/.exec(l.texto))) item = { cod: m[1], desc: m[2].trim() };
    contexto[i] = { recursoCausa, tipoPerdaGrupo, turno, op, item };
  });

  const cols = [
    { nome: "Data", chave: "data" }, { nome: "Ordem", chave: "ordem" },
    { nome: "Item/Versão", chave: "item" }, { nome: "Acessório", chave: "acessorio" },
    { nome: "Tipo Perda", chave: "tipo_perda" }, { nome: "Turno", chave: "turno_col" },
    { nome: "Quantidade", chave: "quantidade" }, { nome: "UN", chave: "un" }, { nome: "Peso", chave: "peso" },
  ];
  const records = [];
  let colX = null, atual = null;
  const close = () => { if (atual) { records.push(atual); atual = null; } };
  lines.forEach((line, i) => {
    const t = line.texto;
    if (t.startsWith("Data Ordem") && t.includes("Tipo Perda")) {
      colX = cols.map((c) => {
        const it = line.itens.find((x) => x.s === c.nome || x.s.startsWith(c.nome));
        return { chave: c.chave, x: it ? it.x : 0 };
      }).sort((a, b) => a.x - b.x);
      close(); return;
    }
    if (!colX) return;
    if (/^(Total|Turno:|OP:|Item:|Data Ordem)/.test(t) || /Rioplastic|ROTINA|PÁGINA|DATA:|HORA:/.test(t)) { close(); return; }
    const begins = /^\d{2}\/\d{2}\/\d{4}\s+\d+\s+/.test(t);
    if (!begins && !atual) return;
    if (begins) { close(); atual = { valores: {}, ctx: contexto[i] }; }
    if (!atual) return;
    for (const it of line.itens) {
      const cx = it.x + (it.w || 0) / 2;
      let col = colX[0];
      for (const c of colX) { if (cx >= c.x - 6) col = c; else break; }
      atual.valores[col.chave] = ((atual.valores[col.chave] || "") + " " + it.s).trim();
    }
  });
  close();

  const out = [];
  for (const r of records) {
    const v = r.valores, c = r.ctx || {};
    const md = /^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d+))?$/.exec(v.data || "");
    if (md) { v.data = md[1]; if (md[2] && !v.ordem) v.ordem = md[2]; }
    const mi = /^(\d+)\/(\d+)\s*-\s*(.*)$/.exec(v.item || "");
    const tp = /^(\d+)\s*-\s*(.*)$/.exec(v.tipo_perda || "");
    const trn = parseInt(v.turno_col || c.turno, 10) || null;
    let day = dataBR(v.data);
    if (trn === 5) day = addDiasISO(day, -1);
    if (!inPeriod(day, start, end)) continue;
    const recurso = c.recursoCausa || {};
    const quantidade = numBR(v.quantidade), peso = numBR(v.peso);
    if (!day || quantidade == null) continue;
    out.push({
      dia: day,
      turno: trn,
      op: c.op || null,
      item_cod: c.item?.cod || (mi ? mi[1] : null),
      item_desc: c.item?.desc || (mi ? mi[3] : null),
      item_versao: mi ? mi[2] : null,
      data: dataBR(v.data),
      ordem: v.ordem || null,
      acessorio: v.acessorio || null,
      tipo_perda_cod: tp ? tp[1] : c.tipoPerdaGrupo?.cod || null,
      tipo_perda_desc: tp ? tp[2].trim() : c.tipoPerdaGrupo?.nome || v.tipo_perda || null,
      recurso_cod: recurso.cod || null,
      recurso_nome: recurso.nome || null,
      quantidade,
      unidade: v.un || null,
      peso,
    });
  }
  return out;
}

function parse054(lines, start, end) {
  const columns = [
    { nome: "OP", chave: "op" }, { nome: "Data", chave: "data" },
    { nome: "Tipo de Perda", chave: "tipo_perda" }, { nome: "Etapa Apont.", chave: "etapa" },
    { nome: "Cliente", chave: "cliente" }, { nome: "Acessório", chave: "acessorio" },
    { nome: "Quantidade", chave: "quantidade" }, { nome: "Peso", chave: "peso" }, { nome: "Item", chave: "item" },
  ];
  let colX = null, current = null;
  const raw = [];
  const close = () => { if (current) { raw.push(current); current = null; } };
  for (const line of lines) {
    const t = line.texto;
    if (t.startsWith("OP Data") && t.includes("Tipo de Perda")) {
      colX = columns.map((c) => {
        const it = line.itens.find((x) => x.s === c.nome || x.s.startsWith(c.nome));
        return { chave: c.chave, x: it ? it.x : 0 };
      }).sort((a, b) => a.x - b.x);
      close(); continue;
    }
    if (!colX) continue;
    if (/^(Totais:|Resumo por|OP Data)/.test(t) || /Rioplastic|ROTINA|PÁGINA|DATA:|HORA:/.test(t)) { close(); continue; }
    const begins = /^\d{6,7}\s+\d{2}\/\d{2}\/\d{4}\s+/.test(t);
    if (!begins && !current) continue;
    if (begins) { close(); current = {}; }
    for (const it of line.itens) {
      const cx = it.x + (it.w || 0) / 2;
      let col = colX[0];
      for (const c of colX) { if (cx >= c.x - 6) col = c; else break; }
      current[col.chave] = ((current[col.chave] || "") + " " + it.s).trim();
    }
  }
  close();
  return raw.map((v) => ({
    dia: dataBR(v.data), op: String(v.op || "").replace(/^0+/, ""), data: dataBR(v.data),
    tipo_perda_desc: v.tipo_perda || null, etapa: v.etapa || null, cliente: v.cliente || null,
    acessorio: v.acessorio || null, quantidade: numBR(v.quantidade), peso: numBR(v.peso), item_desc: v.item || null,
  })).filter((r) => inPeriod(r.dia, start, end) && r.peso != null);
}

function findPeriod(lines) {
  const text = lines.slice(0, 80).map((x) => x.texto).join(" ");
  const m = /(?:Per[ií]odo|Apontamentos):\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  return m ? { de: dataBR(m[1]), ate: dataBR(m[2]) } : { de: null, ate: null };
}
function total621(lines) {
  let result = null;
  for (const l of lines) {
    const m = /Total Geral de Registros:\s*([\d.]+)/i.exec(l.texto);
    if (m) result = Number(m[1].replace(/\D/g, ""));
  }
  return result;
}
function total624(lines) {
  let result = null;
  for (const l of lines) {
    const m = /^Total Geral:\s*([\d.,]+)\s+([\d.,]+)/i.exec(l.texto);
    if (m) result = { quantidade: numBR(m[1]), peso: numBR(m[2]) };
  }
  return result;
}
function total054(lines) {
  const vals = [];
  for (const l of lines) {
    const m = /^Totais:\s*([\d.,]+)\s+([\d.,]+)\s*$/i.exec(l.texto);
    if (!m) continue;
    const quantidade = numBR(m[1]), peso = numBR(m[2]);
    if (quantidade != null && peso != null && Math.abs(peso - 100) > 0.001) vals.push({ quantidade, peso });
  }
  if (!vals.length) return null;
  vals.sort((a, b) => b.peso - a.peso);
  return vals[0];
}
async function insertBatches(table, rows, upsertConflict = null) {
  for (let i = 0; i < rows.length; i += 350) {
    const part = rows.slice(i, i + 350);
    const q = upsertConflict
      ? sb.from(table).upsert(part, { onConflict: upsertConflict })
      : sb.from(table).insert(part);
    const { error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function atualizarResumo(code) {
  if (!["rpcp621", "rpcp624"].includes(code)) return;
  const {data,error}=await sb.rpc("conferir_resumo_621",{p_atualizar:true});
  if(error || data!==true) throw new Error("Dados gravados; resumo não confirmado: "+(error?.message||"totais divergentes"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  try {
    if (String(url.searchParams.get("key") || "") !== await getKey()) return reply({ ok: false, erro: "chave inválida" }, 401);
    const queueId = String(url.searchParams.get("queue_id") || "").trim();
    if (!queueId) return reply({ ok: false, erro: "queue_id ausente" }, 400);
    const { data: q, error: qe } = await sb.from("iniflex_pdf_queue")
      .select("id,codigo,arquivo,caminho,periodo_inicio,periodo_fim")
      .eq("id", queueId).maybeSingle();
    if (qe || !q) throw new Error(qe?.message || "fila não encontrada");
    const code = String(q.codigo || "").toLowerCase();
    if (!["rpcp621", "rpcp624", "rpcp054"].includes(code)) throw new Error(`código não suportado: ${code}`);
    if (!q.periodo_inicio || !q.periodo_fim) throw new Error("fila sem período");

    const buf = await fetchPdf(q.caminho);
    const fileHash = await sha256(buf);
    const effectiveHash = await digestText(`${fileHash}|${code}|${q.periodo_inicio}|${q.periodo_fim}|small-v3-621fix`);
    const { data: duplicate } = await sb.from("importacoes").select("id,registros,conf_ok,conf_msg").eq("hash", effectiveHash).maybeSingle();
    let duplicateComplete = duplicate?.conf_ok === true;
    if (duplicateComplete && code === "rpcp621") {
      const {count,error}=await sb.from("producao_resumo").select("id",{count:"exact",head:true}).eq("importacao_id",duplicate.id);
      if(error) throw new Error("Não foi possível conferir a importação existente: "+error.message);
      duplicateComplete = count === Number(duplicate.registros);
    }
    if (duplicateComplete) {
      await atualizarResumo(code);
      return reply({ ok: true, duplicate: true, importacao_id: duplicate.id, registros: duplicate.registros, conf_ok: duplicate.conf_ok, conf_msg: duplicate.conf_msg });
    }

    const lib = await getPdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(buf), disableWorker: true, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      lines.push(...await pageLines(await doc.getPage(p)));
      if (p % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    try { await doc.destroy(); } catch (_) {}

    const expectedRoutine = code.replace("rpcp", "");
    const head = lines.slice(0, 100).map((x) => x.texto).join("\n");
    if (!new RegExp(`ROTINA:\\s*RPCP${expectedRoutine}`, "i").test(head)) throw new Error(`PDF não é RPCP${expectedRoutine}`);
    const pdfPeriod = findPeriod(lines);
    if (pdfPeriod.de && pdfPeriod.de !== String(q.periodo_inicio)) throw new Error(`início do PDF ${pdfPeriod.de} difere da fila ${q.periodo_inicio}`);
    if (pdfPeriod.ate && pdfPeriod.ate !== String(q.periodo_fim)) throw new Error(`fim do PDF ${pdfPeriod.ate} difere da fila ${q.periodo_fim}`);

    let rows, table, routine, expected, obtained, confOk, confMsg, conflict = null;
    if (code === "rpcp621") {
      rows = parse621(lines, String(q.periodo_inicio), String(q.periodo_fim));
      table = "producao_resumo"; routine = "621"; conflict = "dia,turno,recurso_cod,unidade";
      expected = { Registros: total621(lines) };
      obtained = { Registros: rows.length, Quantidade: +rows.reduce((a, x) => a + Number(x.quantidade || 0), 0).toFixed(3), Peso: +rows.reduce((a, x) => a + Number(x.peso || 0), 0).toFixed(3) };
      confOk = expected.Registros != null ? Number(expected.Registros) === rows.length : null;
      confMsg = confOk === true ? "OK — Total Geral de Registros do PDF bate com o banco" : confOk === false ? `DIVERGENTE — PDF ${expected.Registros}, banco ${rows.length}` : "Não certificado — Total Geral de Registros não localizado";
    } else if (code === "rpcp624") {
      rows = parse624(lines, String(q.periodo_inicio), String(q.periodo_fim));
      table = "perdas"; routine = "624"; expected = total624(lines);
      obtained = { Registros: rows.length, Quantidade: +rows.reduce((a, x) => a + Number(x.quantidade || 0), 0).toFixed(3), Peso: +rows.reduce((a, x) => a + Number(x.peso || 0), 0).toFixed(3) };
      confOk = expected ? diff(expected.quantidade, obtained.Quantidade) <= 0.10 && diff(expected.peso, obtained.Peso) <= 0.10 : null;
      confMsg = confOk === true ? `OK — Total Geral confere (Δ quantidade ${diff(expected.quantidade, obtained.Quantidade).toFixed(3)}; Δ peso ${diff(expected.peso, obtained.Peso).toFixed(3)} kg)` : confOk === false ? `DIVERGENTE — Δ quantidade ${diff(expected.quantidade, obtained.Quantidade).toFixed(3)}; Δ peso ${diff(expected.peso, obtained.Peso).toFixed(3)} kg` : "Não certificado — Total Geral não localizado";
    } else {
      rows = parse054(lines, String(q.periodo_inicio), String(q.periodo_fim));
      table = "perdas_cliente"; routine = "054"; expected = total054(lines);
      obtained = { Registros: rows.length, Quantidade: +rows.reduce((a, x) => a + Number(x.quantidade || 0), 0).toFixed(3), Peso: +rows.reduce((a, x) => a + Number(x.peso || 0), 0).toFixed(3) };
      confOk = expected ? diff(expected.peso, obtained.Peso) <= 0.02 : null;
      confMsg = confOk === true ? "OK — Total Geral de peso do PDF bate com o banco" : confOk === false ? `DIVERGENTE — diferença de ${diff(expected.peso, obtained.Peso).toFixed(3)} kg` : "Não certificado — total de peso não localizado";
    }
    if (!rows.length) throw new Error(`RPCP${routine} não produziu registros`);
    // Nunca substitua dados válidos por uma leitura divergente ou sem certificação.
    if (confOk !== true) {
      return reply({
        ok: false,
        erro: confMsg || `RPCP${routine} não certificado`,
        rotina: routine,
        linhas: rows.length,
        conf_ok: confOk,
        conf_msg: confMsg,
        esperado: expected,
        obtido: obtained
      }, 200);
    }

    const { data: imp, error: ie } = code === "rpcp621" && duplicate ? {data:duplicate,error:null} : await sb.from("importacoes").insert({
      hash: effectiveHash, rotina: routine, arquivo: q.arquivo,
      periodo_de: q.periodo_inicio, periodo_ate: q.periodo_fim, registros: rows.length,
      conf_ok: confOk,
      conf_esperado: expected ? { ...expected, PeriodoPDF: `${pdfPeriod.de || q.periodo_inicio}→${pdfPeriod.ate || q.periodo_fim}` } : null,
      conf_obtido: { ...obtained, PeriodoBanco: `${q.periodo_inicio}→${q.periodo_fim}` },
      conf_msg: confMsg,
    }).select("id").single();
    if (ie || !imp) throw new Error(`importacoes: ${ie?.message || "sem id"}`);

    if (code === "rpcp621") {
      const {data: written,error: writeError}=await sb.rpc("substituir_resumo_621_atomico",{p_importacao_id:imp.id,p_rows:rows});
      if(writeError || written!==rows.length) {
        // A lost response may follow a committed transaction; never delete by audit ID.
        await sb.from("importacoes").update({conf_ok:false,conf_msg:"Gravação não confirmada; reprocessamento necessário."}).eq("id",imp.id);
        throw new Error("621 não substituído; dados anteriores preservados: "+(writeError?.message||"contagem divergente"));
      }
      // The data transaction has committed. Never compensate by deleting rows here.
      const {error:auditError}=await sb.from("importacoes").update({conf_ok:confOk,conf_msg:confMsg,conf_obtido:obtained}).eq("id",imp.id);
      if(auditError) throw new Error("Dados gravados; conferência pendente: "+auditError.message);
      await atualizarResumo(code);
      const {error: stampError}=await sb.from("app_config").upsert({chave:"dados_carimbo",valor:JSON.stringify(new Date().toISOString())});
      if(stampError) throw new Error("Dados gravados; atualização da tela pendente: "+stampError.message);
      return reply({ok:true,rotina:routine,linhas:rows.length,importacao_id:imp.id,conf_ok:confOk,conf_msg:confMsg,obtido:obtained,esperado:expected,repaired:!!duplicate});
    }

    try {
      const payload = rows.map((x) => ({ importacao_id: imp.id, ...x }));
      await insertBatches(table, payload, conflict);
      const { error: de } = await sb.from(table).delete()
        .gte("dia", q.periodo_inicio).lte("dia", q.periodo_fim).neq("importacao_id", imp.id);
      if (de) throw new Error(`limpeza ${table}: ${de.message}`);
      await sb.from("importacoes").delete()
        .eq("rotina", routine).gte("periodo_de", q.periodo_inicio).lte("periodo_ate", q.periodo_fim).neq("id", imp.id);
      const now = new Date().toISOString();
      await sb.from("app_config").upsert({ chave: "dados_carimbo", valor: JSON.stringify(now) });

    } catch (e) {
      await sb.from(table).delete().eq("importacao_id", imp.id);
      await sb.from("importacoes").delete().eq("id", imp.id);
      throw e;
    }
    // Refresh errors must never delete an import whose replacement already committed.
    await atualizarResumo(code);
    const { error: stampError } = await sb.from("app_config").upsert({ chave: "dados_carimbo", valor: JSON.stringify(new Date().toISOString()) });
    if (stampError) throw new Error("Dados gravados; falha ao sinalizar a atualização: " + stampError.message);
return reply({ ok: true, rotina: routine, linhas: rows.length, importacao_id: imp.id, conf_ok: confOk, conf_msg: confMsg, obtido: obtained, esperado: expected });
  } catch (e) {
    return reply({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 200);
  }
});