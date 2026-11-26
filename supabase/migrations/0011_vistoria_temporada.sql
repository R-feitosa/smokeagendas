-- Agenda por Voz — 0011: vistoria de saída também nas casas de temporada
--
-- Pedido de 26/11/2026 (branch de teste claude/vistoria-saida), com o PDF da Casa da
-- Serra (Chalé da Serra da Meruoca, 22/11/2026) como modelo: 'temporada_v1'
-- (Acessos e áreas externas · Estrutura e acabamentos · Cozinha e eletrodomésticos ·
-- Mobiliário e enxoval · operacional · pendências · declaração). Itens em src/lib/vistoria.ts.
--
--   * Casa de temporada vagou → abre vistoria com modelo 'temporada_v1'.
--   * Apartamento/sala continua com 'saida_v1'.
--   * O modelo é decidido no banco (trigger BEFORE INSERT), pela categoria do prédio:
--     vale para a vistoria aberta ao vagar e para a iniciada à mão pelo app.

create or replace function agenda.vistorias_modelo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.modelo := case
    when exists (select 1 from agenda.unidades u join agenda.predios p on p.id = u.predio_id
                  where u.id = new.unidade_id and p.categoria = 'temporada') then 'temporada_v1'
    else 'saida_v1'
  end;
  return new;
end $$;

drop trigger if exists vistorias_modelo on agenda.vistorias;
create trigger vistorias_modelo
  before insert on agenda.vistorias
  for each row execute function agenda.vistorias_modelo();

-- vagar abre vistoria em qualquer categoria (antes: só locação)
create or replace function agenda.unidades_vistoria() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'vago' then
    insert into agenda.vistorias (unidade_id) values (new.id)
    on conflict (unidade_id) where status = 'em_andamento' do nothing;
  else
    delete from agenda.vistorias v
     where v.unidade_id = new.id and v.status = 'em_andamento'
       and v.respostas = '{}'::jsonb and v.operacional = '{}'::jsonb
       and v.pendencias is null and v.locatario is null;
  end if;
  return null;
end $$;

-- iniciar à mão: qualquer unidade vaga (casa inclusive)
drop policy if exists "vistorias: iniciar em unidade vaga" on agenda.vistorias;
create policy "vistorias: iniciar em unidade vaga" on agenda.vistorias
  for insert to authenticated
  with check (
    exists (select 1 from agenda.perfis p where p.id = (select auth.uid()))
    and exists (select 1 from agenda.unidades u where u.id = unidade_id and u.status = 'vago')
  );

revoke all on function agenda.vistorias_modelo() from public, anon, authenticated;

notify pgrst, 'reload schema';
