import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { RioParsers } from "./parsers.ts";
import { lerOrdens, salvarOrdens } from "./os.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "https://bweblwmgwutzdvqtpbww.supabase.co";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const MAX_DIAS_LIMPEZA = 100;
const LOTE = 400;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const reply = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { ...CORS, "content-type": "application/json" } });

const SETOR_MAQ: Record<string, number[]> = {
  "Termoformagem": [601, 602, 603, 1501, 1504, 1508, 1509, 1510, 1511, 1701, 1702, 1703, 1704, 1705, 1706, 1707, 1708, 1709, 1710, 1711, 1712, 2001, 2002, 2003],
  "Impressão": [702, 703, 704, 705, 706, 707, 708, 709, 710],
  "Rotulagem": [1302, 1303, 1304],
  "Sleeve": [1901, 1902, 1903],
  "Extrusão": [501, 502, 503, 504, 505, 506, 507],
  "Embaladeiras": [1801, 1802, 1803, 1805],
};
const MAQ_SETOR: Record<number, string> = {};
for (const [s, arr] of Object.entries(SETOR_MAQ)) for (const c of arr) MAQ_SETOR[c] = s;
const setorDe = (cod: unknown) => MAQ_SETOR[parseInt(String(cod), 10)] || "Outros";

type Mapa = { tabela: string; conflito?: string; linha: (r: any) => Record<string, unknown> };
const MAPA: Record<string, Mapa> = {
  "621": {
    tabela: "producao_resumo", conflito: "dia,turno,recurso_cod,unidade",
    linha: (r) => ({ dia: r.dia, turno: r.turno, recurso_cod: r.recurso_cod, recurso_nome: r.recurso_nome, quantidade: r.quantidade, unidade: r.unidade, peso: r.peso }),
  },
  "622": {
    tabela: "producao",
    linha: (r) => ({ dia: r.dia, turno: r.turno, op: r.op, item_cod: r.item_cod, item_desc: r.item_desc, ident: r.ident, data_inicio: r.data_inicio, data_fim: r.data_fim, recurso_cod: r.recurso_cod, recurso_nome: r.recurso_nome, quantidade: r.quantidade, unidade: r.unidade, peso: r.peso }),
  },
  "624": {
    tabela: "perdas",
    linha: (r) => ({ dia: r.dia, turno: r.turno, op: r.op, item_cod: r.item_cod, item_versao: r.item_versao, item_desc: r.item_desc, data: r.data, ordem: r.ordem, acessorio: r.acessorio, tipo_perda_cod: r.tipo_perda_cod, tipo_perda_desc: r.tipo_perda_desc, recurso_cod: r.recurso_cod, recurso_nome: r.recurso_nome, quantidade: r.quantidade, unidade: r.unidade, peso: r.peso }),
  },
  "054": {
    tabela: "perdas_cliente",
    linha: (r) => ({ dia: r.dia, op: r.op, data: r.data, tipo_perda_desc: r.tipo_perda_desc, etapa: r.etapa, cliente: r.cliente, acessorio: r.acessorio, quantidade: r.quantidade, peso: r.peso, item_desc: r.item_desc }),
  },
  "643": {
    tabela: "paradas",
    linha: (r) => ({ dia: r.dia, motivo_cod: r.motivo_cod, motivo_desc: r.motivo_desc, op: r.op, item_cod: r.item_cod, item_desc: r.item_desc, data: r.data, recurso_cod: r.recurso_cod, recurso_nome: r.recurso_nome, inicio: r.inicio, fim: r.fim, tempo_horas: r.tempo_horas, tempo_exato: r.tempo_exato }),
  },
  "646": {
    tabela: "consumo",
    linha: (r) => ({ dia: r.dia, data: r.data, hora: r.hora, op: r.op, componente_cod: r.componente_cod, componente_versao: r.componente_versao, componente_desc: r.componente_desc, recurso_cod: r.recurso_cod, recurso_nome: r.recurso_nome, quantidade: r.quantidade, unidade: r.unidade, lote: r.lote, peso: r.peso }),
  },
  "264": {
    tabela: "fila_producao", conflito: "dia_foto,recurso_cod,op",
    linha: (r) => ({ dia_foto: r.dia_foto, hora_foto: r.hora_foto, recurso_cod: r.recurso_cod, recurso_nome: r.recurso_nome, setor: setorDe(r.recurso_cod), op: r.op, item_cod: r.item_cod, item_desc: r.item_desc, versao: r.versao, cliente: r.cliente, entrega: r.entrega, quantidade: r.quantidade, peso: r.peso, inicio: r.inicio, termino: r.termino, ordem: r.ordem }),
  },
};

let _pdfjs: any = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const mod: any = await import("npm:pdfjs-dist@3.11.174/legacy/build/pdf.js");
  const lib = (typeof mod?.getDocument === "function") ? mod
    : (typeof mod?.default?.getDocument === "function") ? mod.default : null;
  if (!lib) throw new Error("pdfjs: getDocument não encontrado no módulo");
  if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = "";
  _pdfjs = lib;
  return lib;
}

async function sha256Hex(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cortarDiaAberto(r: any) {
  if (r.rotina === "264" || !r.periodo?.gerado || !Array.isArray(r.registros)) return 0;
  const g = String(r.periodo.gerado);
  const antes = r.registros.length;
  const hhmm = (v: unknown) => {
    const m = /T(\d{2}):(\d{2})/.exec(String(v || "")) || /\b(\d{2}):(\d{2})/.exec(String(v || ""));
    return m ? m[1] + ":" + m[2] : null;
  };
  r.registros = r.registros.filter((x: any) => {
    if (!x || String(x.dia) !== g) return true;
    const t = parseInt(x.turno, 10);
    if (t >= 1 && t <= 4) return false;
    if (t === 5) return true;
    const h = hhmm(x.inicio || x.hora);
    if (h) return h < "06:00";
    return true;
  });
  return antes - r.registros.length;
}

function completarPeriodo(r: any) {
  if (!r.periodo) r.periodo = { de: null, ate: null };
  if (!r.periodo.de || !r.periodo.ate) {
    const dias = (r.registros || []).map((x: any) => x && x.dia).filter(Boolean).sort();
    if (dias.length) {
      r.periodo.de = r.periodo.de || dias[0];
      r.periodo.ate = r.periodo.ate || dias[dias.length - 1];
    }
  }
}

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;

async function abrirPdf(caminho: string) {
  const rb = await fetch(`${SB_URL}/storage/v1/object/relatorios-dia/${caminho}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!rb.ok) throw new Error(`storage ${rb.status} em ${caminho}`);
  const buf = await rb.arrayBuffer();
  const hash = await sha256Hex(buf);
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf), disableWorker: true, isEvalSupported: false, useSystemFonts: false,
  }).promise;
  return { doc, hash };
}

async function processarOS(caminho: string, arquivo: string, simula: boolean) {
  const { doc, hash } = await abrirPdf(caminho);
  try {
    const linhas = await RioParsers.extrairLinhas(doc);
    const { layout, ordens } = lerOrdens(linhas, setorDe);
    if (!layout || !ordens.length) throw new Error("Layout de OS não reconhecido ou vazio.");
    const texto = linhas.slice(0, 50).map((l: any) => l.texto).join("\n");
    const m = /Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/.exec(texto);
    if (!m) throw new Error("Período do PDF de OS não reconhecido.");
    const iso = (v: string) => v.split("/").reverse().join("-");
    const nums = [...new Set(ordens.map((o: any) => String(o.os_num || "").trim()).filter(Boolean))];
    if (nums.length !== ordens.length) throw new Error("OS ausente ou repetida no PDF; conferir antes de importar.");
    const res = await salvarOrdens(sb, ordens, setorDe, simula);
    if (simula) return { arquivo, tipo: "OS", layout, ...res };
    if (res.erros?.length || res.gravadas !== nums.length) throw new Error("Gravação parcial de OS: " + (res.erros || []).join("; "));
    const presentes = new Set();
    for (let i = 0; i < nums.length; i += 200) {
      const {data, error} = await sb.from("manutencao_os").select("os_num").in("os_num", nums.slice(i, i + 200));
      if (error) throw new Error("Conferência de OS: " + error.message);
      for (const row of data || []) presentes.add(String(row.os_num).trim());
    }
    if (nums.some(n => !presentes.has(n))) throw new Error("Nem todas as OS foram confirmadas no banco.");
    const msg = "OK por registros — " + nums.length + " OS gravadas e conferidas; PDF sem Total Geral comparável.";
    const {error: auditError} = await sb.from("importacoes").upsert({
      hash, arquivo, rotina: layout, periodo_de: iso(m[1]), periodo_ate: iso(m[2]),
      registros: nums.length, conf_ok: true, conf_msg: msg,
      conf_esperado: {Registros: nums.length}, conf_obtido: {Registros: presentes.size}
    }, {onConflict: "hash"});
    if (auditError) throw new Error("Auditoria de OS: " + auditError.message);
    return { arquivo, tipo: "OS", layout, ...res, certified: true };
  } finally { try { await doc.destroy(); } catch (_) {} }
}

async function lerPdf(caminho: string, arquivo: string) {
  const { doc, hash } = await abrirPdf(caminho);
  const r = await RioParsers.parseDocumento(doc);
  r.arquivo = arquivo;
  r.hash = hash;
  r.diaAbertoCortado = cortarDiaAberto(r);
  completarPeriodo(r);
  return r;
}

const soma = (regs: any[], k: string) => +regs.reduce((a, x) => a + (Number(x[k]) || 0), 0).toFixed(3);

async function simular(r: any) {
  const mapa = MAPA[r.rotina];
  const rel: any = {
    arquivo: r.arquivo, rotina: r.rotina, nome: r.nome,
    tabela: mapa?.tabela || null,
    periodo: r.periodo,
    linhas_lidas: r.resumo.linhas,
    dia_aberto_cortado: r.diaAbertoCortado,
    linhas_gravaria: r.registros.length,
    totais_calculados: {
      quantidade: soma(r.registros, "quantidade"),
      peso_kg: soma(r.registros, "peso"),
      tempo_horas: soma(r.registros, "tempo_horas"),
    },
    totais_do_pdf: r.resumo.pdf || null,
  };
  if (!mapa) { rel.bloqueio = "rotina sem tabela mapeada"; return rel; }
  const { data: dup } = await sb.from("importacoes").select("id,criado_em,arquivo").eq("hash", r.hash).maybeSingle();
  rel.duplicado = dup ? { ja_importado_em: dup.criado_em, arquivo: dup.arquivo } : null;
  if (mapa.tabela !== "fila_producao" && r.periodo.de && r.periodo.ate) {
    const span = diasEntre(r.periodo.de, r.periodo.ate);
    rel.limpeza = { de: r.periodo.de, ate: r.periodo.ate, dias: span };
    if (span > MAX_DIAS_LIMPEZA) {
      rel.limpeza.bloqueada = `período de ${span} dias excede a trava de ${MAX_DIAS_LIMPEZA}`;
    } else {
      const { count } = await sb.from(mapa.tabela)
        .select("id", { count: "exact", head: true })
        .gte("dia", r.periodo.de).lte("dia", r.periodo.ate);
      rel.limpeza.apagaria = count ?? null;
    }
  }
  rel.amostra = r.registros.slice(0, 3).map(mapa.linha);
  return rel;
}

async function gravar(r: any) {
  const mapa = MAPA[r.rotina];
  if (!mapa) throw new Error("RPCP" + r.rotina + " não tem tabela mapeada");
  const { data: dup } = await sb.from("importacoes").select("id").eq("hash", r.hash).maybeSingle();
  if (dup) return { arquivo: r.arquivo, rotina: r.rotina, pulado: "hash já importado", gravadas: 0 };
  const { data: imp, error: e1 } = await sb.from("importacoes").insert({
    hash: r.hash, rotina: r.rotina, arquivo: r.arquivo,
    periodo_de: r.periodo.de, periodo_ate: r.periodo.ate, registros: r.resumo.linhas,
  }).select("id").single();
  if (e1) {
    if (e1.code === "23505") return { arquivo: r.arquivo, rotina: r.rotina, pulado: "hash já importado", gravadas: 0 };
    throw new Error("falha ao registrar importação: " + e1.message);
  }
  const linhas = r.registros.map((reg: any) => ({ importacao_id: imp.id, ...mapa.linha(reg) }));
  try {
    for (let i = 0; i < linhas.length; i += LOTE) {
      const lote = linhas.slice(i, i + LOTE);
      const { error: e2 } = mapa.conflito
        ? await sb.from(mapa.tabela).upsert(lote, { onConflict: mapa.conflito })
        : await sb.from(mapa.tabela).insert(lote);
      if (e2) throw new Error(`falha ao gravar em ${mapa.tabela}: ${e2.message}`);
    }
  } catch (e) {
    await sb.from("importacoes").delete().eq("id", imp.id);
    throw e;
  }
  const out: any = { arquivo: r.arquivo, rotina: r.rotina, tabela: mapa.tabela, gravadas: linhas.length, importacao_id: imp.id };
  if (mapa.tabela !== "fila_producao" && r.periodo.de && r.periodo.ate) {
    const span = diasEntre(r.periodo.de, r.periodo.ate);
    if (span > MAX_DIAS_LIMPEZA) {
      out.limpeza = `PULADA — período de ${span} dias excede a trava de ${MAX_DIAS_LIMPEZA}. O dado novo entrou; o antigo do período continua lá.`;
    } else {
      const { error: eDel } = await sb.from(mapa.tabela).delete()
        .gte("dia", r.periodo.de).lte("dia", r.periodo.ate).neq("importacao_id", imp.id);
      if (eDel) out.limpeza = "falhou: " + eDel.message;
      else {
        await sb.from("importacoes").delete()
          .eq("rotina", r.rotina).gte("periodo_de", r.periodo.de).lte("periodo_ate", r.periodo.ate).neq("id", imp.id);
        out.limpeza = `período ${r.periodo.de}→${r.periodo.ate} limpo`;
      }
    }
  }
  return out;
}

async function pendentes(dataAlvo: string | null) {
  const q = sb.from("relatorios_email")
    .select("id,codigo,arquivo,caminho,data_geracao")
    .eq("status", "novo").order("data_geracao", { ascending: false }).limit(60);
  const { data, error } = dataAlvo ? await q.eq("data_geracao", dataAlvo) : await q;
  if (error || !data || !data.length) return [];
  const ultimo = String(data[0].data_geracao);
  return data.filter((x: any) => String(x.data_geracao) === ultimo);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const t0 = Date.now();
  const url = new URL(req.url);
  const modo = (url.searchParams.get("modo") || "simulacao").toLowerCase();
  const caminho = url.searchParams.get("caminho");
  const dataAlvo = url.searchParams.get("data");
  try {
    const { data: cfg } = await sb.from("app_config").select("valor").eq("chave", "cron_key").maybeSingle();
    const esperada = cfg?.valor ? String(cfg.valor).replace(/^\"|\"$/g, "") : null;
    if (!esperada || url.searchParams.get("key") !== esperada) return reply({ ok: false, erro: "chave inválida" }, 401);
    if (modo !== "simulacao" && modo !== "gravar") return reply({ ok: false, erro: "modo deve ser simulacao ou gravar" }, 400);
    let alvos: any[];
    let daFila = false;
    if (caminho) {
      alvos = [{ id: null, codigo: null, arquivo: caminho.split("/").pop(), caminho }];
    } else {
      alvos = await pendentes(dataAlvo);
      daFila = true;
      if (!alvos.length) {
        return reply({ ok: true, modo, mensagem: "nada novo na fila", ms: Date.now() - t0 });
      }
    }
    const ehOS = (a: any) => /^rsmi/i.test(String(a.codigo || a.arquivo || ""));
    const relatorios: any[] = [];
    const erros: any[] = [];
    for (const a of alvos) {
      try {
        if (ehOS(a)) {
          relatorios.push(await processarOS(a.caminho, a.arquivo, modo === "simulacao"));
        } else {
          const r = await lerPdf(a.caminho, a.arquivo);
          relatorios.push(modo === "gravar" ? await gravar(r) : await simular(r));
        }
        if (modo === "gravar" && daFila && a.id) {
          await sb.from("relatorios_email")
            .update({ status: "processado", processado_em: new Date().toISOString() }).eq("id", a.id);
        }
      } catch (e) {
        erros.push({ arquivo: a.arquivo, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    const totalLinhas = relatorios.reduce((s, x) => s + (x.gravadas ?? x.gravaria ?? x.linhas_gravaria ?? 0), 0);
    const resposta = {
      ok: erros.length === 0,
      modo,
      escreveu_no_banco: modo === "gravar",
      arquivos: relatorios.length,
      linhas: totalLinhas,
      relatorios,
      erros,
      ms: Date.now() - t0,
      aviso: modo === "simulacao"
        ? "SIMULAÇÃO — nada foi escrito. Confira linhas_gravaria contra totais_do_pdf antes de rodar com modo=gravar."
        : undefined,
    };
    await sb.from("robo_log").insert({
      robo: "importador-server",
      status: erros.length ? "erro" : "ok",
      achados: alvos.length,
      inseridos: modo === "gravar" ? totalLinhas : 0,
      mensagem: `modo=${modo} · ${relatorios.length} arquivo(s) · ${totalLinhas} linha(s)` +
        (erros.length ? ` · ${erros.length} erro(s): ${erros.map((e) => e.erro).join(" | ").slice(0, 400)}` : ""),
    });
    return reply(resposta);
  } catch (e) {
    const msg = e instanceof Error ? (e.name + ": " + e.message) : String(e);
    try {
      await sb.from("robo_log").insert({ robo: "importador-server", status: "erro", mensagem: msg.slice(0, 500) });
    } catch (_) { /* log é best-effort */ }
    return reply({ ok: false, modo, erro: msg, ms: Date.now() - t0 }, 200);
  }
});
