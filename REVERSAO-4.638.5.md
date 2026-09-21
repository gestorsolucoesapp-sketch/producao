# Correção completa do card de máquinas paradas — 4.638.5

Inclui os ajustes da 4.638.4 (detalhes sob demanda, total sem varreduras repetidas, cache por fonte) e reutiliza o formatador America/Sao_Paulo que era recriado por parada. Na verificação real da 4.638.4, o medidor registrou 6.947ms no card, por isso o trabalho prosseguiu.

296 casos de horários comparados: UTC, -03, sem fuso, madrugada e valores inválidos retornam os mesmos resultados. Em 5.000 conversões: 377ms antes, 15ms depois no teste local. Não altera regras de turno/metas ou dados.

Para reverter todos os ajustes deste incidente, restaurar index.html e sw.js de 9885f65ba3691b89f78c01615a84f173e45acad9 e publicar com APP_VER/badge/CACHE posteriores à versão instalada. Backup: backup-app-4.638.3.zip. Sem SQL.
