-- Agenda por Voz — 0010: vistoria de saída (checklist) ao vagar uma unidade
--
-- Pedido de 26/11/2026 (branch de teste claude/vistoria-saida). Modelo: o PDF
-- "Checklist de vistoria de saída" da Feitosa (AP 304 · Feitosa II, 18/11/2026):
--   1 Quarto (7 itens) · 2 Banheiro (11 itens) — Ótimo | Bom | Ruim | N/A + observação
--   3 Checklist operacional de saída (6 itens) — feito + observação
--   4 Pendências e observações finais · 5 Declaração (vistoriador)
-- Os itens do modelo ficam no app (src/lib/vistoria.ts, modelo 'saida_v1'); aqui
-- guardamos as respostas em jsonb, com o nome do modelo junto.
--
-- REGRAS
--   * Unidade de LOCAÇÃO vai para "vago" → nasce uma vistoria em andamento (se já
--     não houver uma aberta). Casas de temporada não geram vistoria (vagam toda semana).
--   * Voltou para "ocupado" (ex.: Desfazer) e a vistoria ainda está em branco → ela some.
--     Se já tem algo preenchido, fica (não se perde trabalho).
--   * Concluída = travada: ninguém altera mais (trigger).
--   * App: lê, preenche só os campos do formulário e pode INICIAR uma vistoria em unidade
--     vaga (as que já estavam vagas antes desta migration). Apagar é só pelo trigger.
--   * Mesmo acesso da aba: quem está habilitado na agenda.

create table if not exists agenda.vistorias (
  id                 uuid primary key default gen_random_uuid(),
  unidade_id         uuid not null references agenda.unidades (id) on delete cascade,
  tipo               text not null default 'saida' check (tipo in ('saida')),
  modelo             text not null default 'saida_v1',
  status             text not null default 'em_andamento' check (status in ('em_andamento', 'concluida')),
  -- cabeçalho do documento
  locatario          text check (char_length(locatario) <= 120),
  data_vistoria      date not null default (now() at time zone 'America/Fortaleza')::date,
  cidade             text not null default 'Sobral - CE' check (char_length(cidade) <= 80),
  locador            text not null default 'Feitosa Administradora de Imóveis Ltda.' check (char_length(locador) <= 120),
  -- { "<item>": { "avaliacao": "otimo|bom|ruim|na", "obs": "..." } }
  respostas          jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object'),
  -- { "<item>": { "ok": true, "obs": "..." } }
  operacional        jsonb not null default '{}'::jsonb check (jsonb_typeof(operacional) = 'object'),
  pendencias         text check (char_length(pendencias) <= 4000),
  criada_em          timestamptz not null default now(),
  atualizada_em      timestamptz,
  concluida_em       timestamptz,
  concluida_por      uuid references agenda.perfis (id) on delete set null,
  vistoriador_nome   text
);

create index if not exists vistorias_unidade_idx on agenda.vistorias (unidade_id, criada_em desc);
-- no máximo uma vistoria aberta por unidade (trava de idempotência do trigger)
create unique index if not exists vistorias_uma_aberta_uq on agenda.vistorias (unidade_id) where status = 'em_andamento';

comment on table agenda.vistorias is 'Vistoria de saída (checklist) criada quando uma unidade de locação vaga. Itens do modelo em src/lib/vistoria.ts.';

-- ---------------------------------------------------------------
-- Unidade vagou / voltou a ocupar → abre / limpa a vistoria
-- SECURITY DEFINER: o app não tem INSERT/DELETE em vistorias; só este trigger cria/apaga.
-- ---------------------------------------------------------------
-- ATENÇÃO: a 0011 substitui esta função (casas de temporada também). Reaplicou a 0010? Reaplique a 0011.
create or replace function agenda.unidades_vistoria() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'vago' then
    if exists (select 1 from agenda.predios p where p.id = new.predio_id and p.categoria = 'locacao') then
      insert into agenda.vistorias (unidade_id) values (new.id)
      on conflict (unidade_id) where status = 'em_andamento' do nothing;
    end if;
  else
    delete from agenda.vistorias v
     where v.unidade_id = new.id and v.status = 'em_andamento'
       and v.respostas = '{}'::jsonb and v.operacional = '{}'::jsonb
       and v.pendencias is null and v.locatario is null;
  end if;
  return null;
end $$;

drop trigger if exists unidades_vistoria on agenda.unidades;
create trigger unidades_vistoria
  after update of status on agenda.unidades
  for each row when (old.status is distinct from new.status)
  execute function agenda.unidades_vistoria();

-- ---------------------------------------------------------------
-- Antes de gravar a vistoria: concluída não muda; ao concluir, carimba quem/quando.
-- ---------------------------------------------------------------
create or replace function agenda.vistorias_antes() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_nome text;
begin
  if old.status = 'concluida' then
    raise exception 'Vistoria concluída não pode ser alterada' using errcode = 'check_violation';
  end if;
  new.atualizada_em := now();
  if new.status = 'concluida' then
    select p.nome into v_nome from agenda.perfis p where p.id = (select auth.uid());
    new.concluida_em := now();
    new.concluida_por := case when v_nome is null then null else (select auth.uid()) end;
    new.vistoriador_nome := v_nome;
  end if;
  return new;
end $$;

drop trigger if exists vistorias_antes on agenda.vistorias;
create trigger vistorias_antes
  before update on agenda.vistorias
  for each row execute function agenda.vistorias_antes();

revoke all on function agenda.unidades_vistoria() from public, anon, authenticated;
revoke all on function agenda.vistorias_antes()   from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Permissões e RLS
-- ---------------------------------------------------------------
revoke all on agenda.vistorias from public, anon, authenticated;
grant select on agenda.vistorias to authenticated;
grant update (locatario, data_vistoria, cidade, locador, respostas, operacional, pendencias, status)
  on agenda.vistorias to authenticated;
grant all on agenda.vistorias to service_role;

alter table agenda.vistorias enable row level security;

drop policy if exists "vistorias: habilitados leem" on agenda.vistorias;
create policy "vistorias: habilitados leem" on agenda.vistorias
  for select to authenticated
  using (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())));

drop policy if exists "vistorias: habilitados preenchem" on agenda.vistorias;
create policy "vistorias: habilitados preenchem" on agenda.vistorias
  for update to authenticated
  using (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())))
  with check (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())));

-- Iniciar à mão (botão "Iniciar vistoria"): só para unidade de locação que está vaga.
-- Serve para as que já estavam vagas antes desta migration (não são criadas aqui).
grant insert (unidade_id) on agenda.vistorias to authenticated;
drop policy if exists "vistorias: iniciar em unidade vaga" on agenda.vistorias;
create policy "vistorias: iniciar em unidade vaga" on agenda.vistorias
  for insert to authenticated
  with check (
    exists (select 1 from agenda.perfis p where p.id = (select auth.uid()))
    and exists (select 1 from agenda.unidades u join agenda.predios pr on pr.id = u.predio_id
                 where u.id = unidade_id and u.status = 'vago' and pr.categoria = 'locacao')
  );

notify pgrst, 'reload schema';
