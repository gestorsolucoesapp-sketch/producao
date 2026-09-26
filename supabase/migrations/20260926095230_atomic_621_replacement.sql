-- A failed import must never erase the previous production rows.
create or replace function public.substituir_resumo_621_atomico(p_importacao_id uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_imp public.importacoes%rowtype; v_count integer;
begin
 perform pg_advisory_xact_lock(9062306211);
 select * into strict v_imp from public.importacoes where id=p_importacao_id and rotina='621';
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<>v_imp.registros or v_imp.registros<1 then
  raise exception 'Quantidade de linhas diferente da conferência do PDF';
 end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) as r(dia date) where dia is null or dia<v_imp.periodo_de or dia>v_imp.periodo_ate) then
  raise exception 'Data fora do período certificado';
 end if;
 insert into public.producao_resumo(importacao_id,dia,turno,recurso_cod,recurso_nome,quantidade,unidade,peso)
 select p_importacao_id,r.dia,r.turno,r.recurso_cod,r.recurso_nome,r.quantidade,r.unidade,r.peso
 from jsonb_to_recordset(p_rows) as r(dia date,turno smallint,recurso_cod text,recurso_nome text,quantidade numeric,unidade text,peso numeric)
 on conflict(dia,turno,recurso_cod,unidade) do update set
 importacao_id=excluded.importacao_id,recurso_nome=excluded.recurso_nome,quantidade=excluded.quantidade,peso=excluded.peso;
 select count(*) into v_count from public.producao_resumo where importacao_id=p_importacao_id;
 if v_count<>v_imp.registros then raise exception 'Gravação incompleta: % de %',v_count,v_imp.registros; end if;
 delete from public.producao_resumo where dia between v_imp.periodo_de and v_imp.periodo_ate and importacao_id<>p_importacao_id;
 return v_count;
end $$;
revoke all on function public.substituir_resumo_621_atomico(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.substituir_resumo_621_atomico(uuid,jsonb) to service_role;

-- Only the production dashboard needs to be refreshed for the 621 certificate.
create or replace function public.conferir_resumo_621(p_atualizar boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_atualizar then refresh materialized view concurrently public.mv_chao_dia; end if;
 return not exists (
  select 1 from
   (select dia,sum(peso) kg from public.producao_resumo where dia>=current_date-60 group by dia) p
   full join (select dia,sum(prod) kg from public.mv_chao_dia where dia>=current_date-60 group by dia) f using(dia)
  where abs(coalesce(p.kg,0)-coalesce(f.kg,0))>0.001
 );
end $$;
revoke all on function public.conferir_resumo_621(boolean) from public,anon,authenticated;
grant execute on function public.conferir_resumo_621(boolean) to service_role;
