-- Agenda por Voz — 0009: só o Saulo altera o status das casas de temporada
--
-- Pedido de 26/11/2026. Todos os habilitados continuam VENDO as casas; ALTERAR o
-- status de uma casa de temporada fica só com o responsável dela.
--
--   predios.editavel_por       perfil que pode mudar o status das unidades do prédio
--                              (null = qualquer habilitado, como nos prédios de locação)
--   predios.editavel_por_nome  nome guardado junto, para o app dizer quem altera
--                              (cada pessoa só lê o próprio perfil por RLS)
--
-- A trava está na policy de UPDATE de agenda.unidades: o app de outra pessoa até
-- tenta, mas o banco não altera nenhuma linha. Nada de id fixo no código: o Saulo é
-- achado pelo nome do perfil, e a migration falha se não houver exatamente um.

alter table agenda.predios
  add column if not exists editavel_por uuid references agenda.perfis (id) on delete set null,
  add column if not exists editavel_por_nome text;

comment on column agenda.predios.editavel_por is 'Quem pode mudar o status das unidades deste prédio. Null = qualquer usuário habilitado.';

do $$
declare
  v_saulo uuid;
  v_qtd   integer;
begin
  select count(*), min(id::text)::uuid into v_qtd, v_saulo from agenda.perfis where lower(btrim(nome)) = 'saulo';
  if v_qtd <> 1 then
    raise exception 'Esperado exatamente 1 perfil "Saulo" em agenda.perfis; encontrados %', v_qtd;
  end if;
  update agenda.predios set editavel_por = v_saulo, editavel_por_nome = 'Saulo'
   where categoria = 'temporada' and editavel_por is null;
end $$;

drop policy if exists "unidades: habilitados mudam o status" on agenda.unidades;
create policy "unidades: habilitados mudam o status" on agenda.unidades
  for update to authenticated
  using (
    exists (select 1 from agenda.perfis p where p.id = (select auth.uid()))
    and exists (select 1 from agenda.predios pr
                 where pr.id = unidades.predio_id
                   and (pr.editavel_por is null or pr.editavel_por = (select auth.uid())))
  )
  with check (
    exists (select 1 from agenda.perfis p where p.id = (select auth.uid()))
    and exists (select 1 from agenda.predios pr
                 where pr.id = unidades.predio_id
                   and (pr.editavel_por is null or pr.editavel_por = (select auth.uid())))
  );

notify pgrst, 'reload schema';
