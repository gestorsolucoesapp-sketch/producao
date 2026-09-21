# Organização visual 4.638.0 e 4.638.1 — reversão

Base anterior preservada: `4b165b4cd742ef59374390263ebca4a657216287` (4.637.2).

Esta publicação agrupa as 27 telas em cinco áreas, reúne opções do cabeçalho, recolhe explicações nos ícones de informação e abre a manutenção nas ordens. Fórmulas de metas, OEE e calendário não foram alteradas.

## Reverter somente o visual

1. Verificar se existem publicações posteriores e preservar suas alterações.
2. Reverter o commit desta publicação, ou recuperar somente suas mudanças em `index.html` e `sw.js` a partir da base acima.
3. Usar uma **nova versão**, por exemplo 4.638.2, nos três pontos: APP_VER, selo e CACHE. Não republicar simplesmente o número antigo, pois o cache do PWA precisa atualizar.
4. Rodar o verificador do repositório, checagem de sintaxe e testes de confiabilidade/carregamento.
5. Publicar e conferir o aplicativo servido pelo Pages; fechar e reabrir o PWA.

Preferências de explicações desta versão usam `rp_ajuda_expandida` no aparelho. Nenhum registro de produção é salvo nessa preferência. A opção de expandir/recolher todas está em Opções do aplicativo.

## Banco

A organização do banco é independente do visual. Foram acrescentadas descrições de catálogo e dois índices, sem alterar registros, nomes de tabelas, colunas, permissões ou regras. Reverter o visual não exige reverter o banco.

Os scripts de aplicação/reversão e o catálogo anterior foram entregues localmente ao responsável, separados deste repositório público. A reversão das descrições confere o texto atual antes de restaurar o original, para não apagar mudanças posteriores. Os índices novos podem ser removidos separadamente, preservando as tabelas e todos os registros.

A versão 4.638.1 reúne o ícone antigo de cálculo com a nova ajuda para evitar dois ícones no mesmo cartão.
