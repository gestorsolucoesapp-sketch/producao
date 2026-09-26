# Supervisor Iniflex v1.1

Supervisor determinístico dos 14 relatórios.

## Sequência
621 → 624 → 643 → 646 → 622 → 054 → 005 → 010 → 196 → 241 → 339 → 002 → 304-PED → 304-PROP.

## Regras
- Só avança quando a fila foi atualizada nesta etapa, ficou `processado` e existe importação certificada (`conf_ok=true`).
- Aceita reaproveitamento idempotente/duplicata de uma importação já certificada quando a fila da execução atual foi atualizada.
- Até 3 retentativas automáticas de preparação por relatório.
- Erros antigos de outro relatório não derrubam o relatório atual.
- Timeout de preparação usa o início real da etapa; heartbeat não reinicia o relógio.
- Botão **Retomar** recupera uma execução marcada como erro.

## Horários
06:20, 15:20 e 21:20, além da execução manual.

## Dependência temporária
O supervisor v1.1 usa os botões `.rioOne`, `rioProcessPrepared` e `rioCancelPrepared` expostos pelo motor local já instalado.

## Instalação
Carregue esta pasta como extensão descompactada no Opera e mantenha o motor local atual instalado.
