# MAPA DO CÓDIGO — Controle de Produção Rioplastic

> **Para que serve:** achar rápido ONDE mexer no `index.html` (arquivo único, ~1,7 MB)
> sem garimpar. **Leia este arquivo no início da sessão** — economiza muito token.
>
> **Regra de ouro:** os números de linha **envelhecem** a cada edição. Use-os só como
> pista. O confiável é o **nome da função**: `grep -n "function NOME" index.html`.
> Quando este mapa ficar defasado, é barato regenerá-lo (grep dos `function`).

## Arquitetura em 5 linhas
- App single-file: `index.html` (todo o JS num `<script>` inline) + `sw.js` (cache) + `.nojekyll`.
- Repo `gestorsolucoesapp-sketch/producao` · GitHub Pages · branch `main`.
- Supabase projeto `bweblwmgwutzdvqtpbww`. MCP `execute_sql` exige `project_id` sempre.
- Deploy = **bump triplo** (`APP_VER` linha ~2560 + selo `verBadge` + `CACHE` no sw.js) →
  `node --check` → **CI real** (`.github/scripts/check.js`, precisa `acorn`+`acorn-walk`) →
  commit atômico via **Git Data API** (blobs+tree+commit+ref) → aguardar Pages.
- Fonte de produção = **`producao_resumo`** (dia, turno, recurso_cod, quantidade, unidade, peso).
  NÃO tem coluna de refugo/perda (perdas vêm de outra tabela).

## Aba → função de entrada
(despacho em ~4004 e ~7152; `carregarX` monta, `renderX` desenha)

| Aba | Carrega | Desenha | Tabelas principais |
|---|---|---|---|
| Painel | `carregarPainel` (~10516) | `renderPainel` (~16440) | producao_resumo, paradas, metas, app_config |
| Análise (antiga) | `carregarAnalise` | — | producao_resumo, paradas |
| Análise+ | `carregarAnaliseMais` (~4904) | `renderAnaliseMais` (~5426) | producao_resumo, paradas, metas |
| Programação | `carregarProgramacao` (~18099) | dentro dela | fila_producao, v_fila_*, v_prog_real_dia |
| Demanda | `carregarDemanda` (~6534) | `renderDemanda` (~6594) | rest196_pendente, v_producao_mes_item |
| Tarefas | `carregarTarefas` (~4049) | `renderTarefas` (~4087) | tarefas, tarefas_conclusoes |
| Metas | `carregarMetas` (~9729) | `renderMetas` (~9878) | metas, maquina_vel, app_config |
| Estoque | `carregarEstoque` (~6957) | `renderEstoque` (~7013) | estoque_deposito |
| Manut/OS | `carregarManut` (~8617) | `renderManut` (~9137) | manutencao_os, os_eventos |
| OEE | `carregarOEE` (~9395) | `renderOEE` (~9636) | producao_resumo, paradas, app_config |
| Conferência | `carregarConf` (~21437) | — | producao_resumo |
| Gestão de Pessoas | `carregarOrganograma` (~22140) | — | org_alocacoes, org_afastamentos, org_ferias, org_* |
| RH | `carregarRH` (~5936) | — | rh_analise_individual, rh_remuneracao, rh_temas |
| Importar | `carregarSaudeImport` (~3903) · `processarArquivos` (~17621) | `renderFila` (~17457) | importacoes, relatorios_email |
| Usuários | `carregarUsuarios` (~16990) | — | perfis, acessos |
| Histórico | `carregarHistorico` (~21323) | — | importacoes |

## DEMANDA (carteira / boca) — cluster `_dem*`
- Entrada: `carregarDemanda` → `renderDemanda`. Cache em `_demCache` {dia, pend, novos, hist}.
- Detalhe de uma boca (modal): `detDemandaBoca` (~6920). Mostra kg/cx/mil + **quanto é kit**.
- Gráfico do ano da boca: `_demGraficoAno`. Itens de uma boca+máquina: `detBocaItens`.
- **Destino da demanda** (TF = base; Impressão/Embalagem = destino): helper `_demDestino`
  dentro de `renderDemanda`, usa `_maqSetItem` (item→setores das máquinas que o produziram no ano).
- Carteira NÃO traz setor: o setor sai das máquinas do histórico (`v_producao_mes_item`).

## ITEM: classe / boca / molde — (crítico p/ Demanda e Análise)
- `classeItem` (~13155): BOBINA / KIT / BANDEJA / TAMPA / COPO / POTE (por regex na descrição).
- `bocaDe` (~13164): 1º par `(AxB)` → A; senão bitola solta (68,75,79,93,101,120,150,185);
  senão **mapa volume→boca** `_bocaMap` (de `app_config.chave='boca_por_volume'`, carregado por
  `carregarBocaMap`). **KIT pula os 2 primeiros e vai direto ao mapa.** Ex.: POTE/KIT 500ml→120, SAM 1KG→120.
- `ferramentalDe` (~13189): molde do item. `setorDe` (~7205): máquina→setor (usa SETOR_MAQ).

## METAS + ANÁLISE+ (cards de turno) — clusters `metas*`, `_mt*`, `mt*`
- Tabela `metas` (recurso_cod, bloco['Manhã'|'Tarde'|'Noite'], meta, **so_com_producao**).
- `getMetas` (~7291) → `metasData[cod] = {Manhã,Tarde,Noite, __soComProd}`.
- `renderMetas` (~9878): grade por máquina (inputs `meta_${cod}_${M|T|N}`, `vel_${cod}`,
  checkbox `scp_${cod}` = "só cobrar meta se rodou"). Salva: `salvarMetas` (~10022).
- Soma de meta do setor (linha azul do Painel): `metaDiariaSetor` / `metaDiariaSemExtrusao` (~7312).
  ⚠️ Essas somas ainda **não** aplicam o `so_com_producao` (é estático, sem produção do dia).
- **Cards de turno do Análise+** ficam DENTRO de `renderAnaliseMais` (~5426):
  - Contador do grupo (nas 3 metas/parcial/nenhuma): loop ~5271.
  - Card por máquina+turno: loop ~5326. Variáveis-chave por turno:
    `a.v`=produção, `a.pe`=perda, `a.pa`=horas parada; `p`=% meta, `rp`=% perda, `pp`=% turno parado.
    `semMeta`, `parada`(a.v<=0), `ignorada`(=_soProd && parada && meta>0 → "meta ignorada/revezamento").
  - Faixas/cores: `_mtFx` (~4981), `MT_TXT`/`MT_BAR`, `_mtBarra`. Metas de perda/setup/OEE também na aba Metas.

## PROGRAMAÇÃO / FILA — cluster `_prog*`
- `carregarProgramacao` (~18099); análise/sequência/carga: `_progAnalise`, `_progSequencia`,
  `_progCargaSemanal`, `_progRecomendacoes`, `_progDiagnostico`. Fila: `filaPendentes` (~17443).

## Regras de negócio já documentadas (não reinventar)
- Turno: Manhã=T1+T3, Tarde=T2+T4, Noite=T5. Dia operacional, sábado reduzido (fator 10,98/23,92),
  domingo/feriado: ver skill `rioplastic-producao-app` + funções `tipoDia`, `_diasEqBloco`, `equivDia`.
- Máquinas por setor: usar listas exatas em `SETOR_MAQ` (código fora da lista → "Outros").
- Bobina yield, kg vs caixas, OEE: ver skill.

## Pegadinhas que já quebraram o app (índice)
- `try/catch` engolindo erro; RLS devolvendo array vazio; `upsert` não lança em bloqueio de RLS →
  sempre `if (error) throw error`.
- CI reprova: script inválido, bump triplo descasado, variável usada sem declarar, `onclick`
  chamando função inexistente, função duplicada. Atributo com chamada de função montado FORA do
  template (senão o verificador lê o nome da variável como função).
- `_jsAttr` faz escapeHtml + escapa aspas simples: no texto pode usar acento e `<b>`, **não** use
  `palavra(` nem aspas simples.
- Timestamps em horário local Brasil com marcador UTC (usar regex, não `getUTCHours`).
- PostgREST corta em 1.000 linhas (app pagina com range). MCP multi-statement retorna só o último.

## Como regenerar este mapa (barato)
```
grep -nE "^(async )?function [A-Za-z_$][A-Za-z0-9_$]*\s*\(" index.html   # inventário
grep -n "aba === '\|qual === '" index.html                              # despacho de abas
grep -oE "from\('[a-z_]+'\)" index.html | sort | uniq -c | sort -rn     # tabelas usadas
```
