# Correção de travamento — Máquinas paradas o turno inteiro — 4.638.4

O card montava os detalhes ocultos de cada resultado, varrendo paradas e produção repetidamente. O total fazia outra varredura completa por resultado, apesar de já haver um índice de motivos.

Agora os detalhes são calculados ao abrir uma máquina e reutilizados ao reabrir. O total soma as mesmas estimativas já calculadas para as linhas. Os índices são renovados quando a fonte muda, mesmo que a quantidade de registros seja igual. Não altera regras de metas, critérios de parada, dados nem permissões. Mantém a escolha de ligar/desligar.

Reversão: restaurar index.html e sw.js de 9885f65ba3691b89f78c01615a84f173e45acad9, atualizar APP_VER/badge/CACHE para uma versão posterior à instalada e publicar. Sem SQL.
