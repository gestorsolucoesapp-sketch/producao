# Correções 4.637.2 e reversão

Base preservada: `1fae99bc3b3b9e3bd45762d652633fb5ab61b564` (4.637.1).

Esta versão altera somente o aplicativo e seus testes. Não altera tabelas, registros, políticas do banco ou fórmulas de metas. O carregamento de metas passa a propagar falhas e permitir nova tentativa; seus valores e regras de cálculo permanecem iguais.

Correções: confirmação de gravação de tarefas; rollback visual de subtarefas; erros de conclusão recorrente; leitura completa de OS com paginação; rejeição de limites de leitura em Demanda, Estoque e Programação; cache de capacidade não preenchido após falha; remoção da senha persistida no navegador; datas sem corte; Histórico paginado com nomes corretos e detalhes da importação; alertas de estoque apresentados como classificação a conferir.

## Para desfazer

1. Preservar o estado atual do repositório e verificar se há publicações posteriores que precisam ser mantidas.
2. Recuperar apenas as mudanças desta entrega usando o commit da publicação, ou os arquivos `index.html` e `sw.js` do commit base acima quando não houver mudanças posteriores.
3. Publicar a restauração com uma versão NOVA e superior à atual nos três lugares: APP_VER, selo da tela e CACHE do service worker. Exemplo: se a versão atual ainda for 4.637.2, usar 4.637.3. Não republicar simplesmente o número antigo: aparelhos podem continuar usando o cache atual.
4. Rodar o verificador, a checagem de sintaxe e os testes compatíveis com o comportamento restaurado. Os testes novos detectam intencionalmente os defeitos da versão anterior; uma restauração completa voltará a falhar nesses casos.
5. Aguardar GitHub Pages, conferir a versão publicada e fechar/reabrir o PWA.

Reversão parcial é preferível quando apenas uma mudança causar problema. Uma restauração integral também recoloca as falhas anteriores, inclusive armazenamento de senha. A senha antiga removida do localStorage não é recuperada: o usuário pode digitá-la novamente ou usar seu gerenciador de senhas. Dados de produção não dependem dessa reversão, pois o banco não foi modificado nesta entrega.

## Validação e limites

`node test-reliability.cjs`, `node test-loading.cjs`, verificador do repositório e checagem de sintaxe. Os testes usam respostas fictícias, sem gravar no banco de produção.

O Histórico mostra os metadados dos relatórios que ainda não têm auditoria linha a linha implementada; isso é identificado no detalhe. A conclusão recorrente continua sendo duas gravações: se a segunda falhar, a tela avisa que o histórico foi registrado e pede conferência antes de repetir. Uma transação no banco para esse fluxo e a revisão integral das permissões ficam para uma etapa específica.
