# Supervisor Iniflex v1.0

Arquitetura nova para os 14 relatórios.

## Princípio
O conector antigo v0.8 continua temporariamente como **motor de tela** (preparar/gerar/upload).
O v1.0 passa a ser o **supervisor** e o Supabase é a fonte oficial de estado.

O v1.0 só avança quando:
1. a fila do relatório foi criada depois do início daquela etapa;
2. a fila está `processado`;
3. existe importação correspondente;
4. `conf_ok = true`.

Se qualquer etapa falhar, o estado fica `error` no relatório atual. Não incrementa contador e não pula.

## Agendas
06:20, 15:20 e 21:20, além de execução manual pelo popup.

## Supabase
Estado: `public.iniflex_run_state`
API: `iniflex-run-state-v1`

## Instalação
Carregar esta pasta como extensão descompactada no Opera.
Enquanto a migração do motor de tela não estiver concluída, manter a extensão v0.8 instalada porque o v1 usa os botões `.rioOne` e `rioProcessPrepared` expostos por ela.
