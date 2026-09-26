-- Cover the exact aggregates used by v_saude_fotos without changing data or RLS.
set local lock_timeout = '5s';
create index if not exists rest196_saude_pedido_cover_idx
 on public.rest196_pendente (split_part(pedido, '/', 1)) include (dia_foto, pedido);
create index if not exists fluxo_pedido_saude_cover_idx
 on public.fluxo_pedido (documento) include (criado_em);
create index if not exists manutencao_os_saude_cover_idx
 on public.manutencao_os (recurso_cod) include (situacao, criado_em);
analyze public.rest196_pendente;
analyze public.fluxo_pedido;
analyze public.manutencao_os;
