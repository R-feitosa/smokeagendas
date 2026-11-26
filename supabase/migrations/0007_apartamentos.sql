-- Agenda por Voz — 0007: aba Apartamentos (controle de vago | ocupado)
--
-- Quadro de ocupação dos imóveis do escritório: prédios → unidades (apartamentos/salas),
-- cada unidade "vago" ou "ocupado". No app, tocar na unidade abre a escolha do status.
--
-- DIFERENTE do resto da agenda, estes dados NÃO são por pessoa: são do escritório.
-- Todo usuário HABILITADO (linha em agenda.perfis) vê tudo e pode mudar o status.
-- Usuário do rf-ops sem perfil na agenda não vê nem altera nada (o login é compartilhado).
--
-- FONTE DA VERDADE do status vago/ocupado: agenda.unidades. Esta migration não lê nem
-- escreve public.feitosa_imoveis (módulo imobiliário do RF OPS) — continua tudo isolado.
--
-- O que o app pode fazer: SELECT e UPDATE só da coluna `status`. Quem/quando mudou é
-- carimbado por trigger (o cliente não consegue forjar) e cada mudança vai para
-- agenda.unidades_historico (só leitura para o app; base para tempo de vacância).
-- Cadastro de prédio/unidade é administrativo (SQL Editor / service_role) — ver README.
--
-- Carga inicial: planilha enviada em 25/11/2026 (68 unidades, 8 vagas).
-- Idempotente: rodar de novo não duplica nem sobrescreve status já alterado no app.

-- ---------------------------------------------------------------
-- Prédios
-- ---------------------------------------------------------------
create table if not exists agenda.predios (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (char_length(btrim(nome)) between 1 and 60),
  -- como o app chama cada unidade: "Apto 304" ou "Sala 102"
  tipo_unidade  text not null default 'apartamento' check (tipo_unidade in ('apartamento', 'sala')),
  ordem         integer not null default 0,   -- ordem de exibição (a da planilha)
  criado_em     timestamptz not null default now(),
  constraint predios_nome_uq unique (nome)
);

comment on table agenda.predios is 'Aba Apartamentos: prédios do escritório (dados compartilhados entre os usuários habilitados).';

-- ---------------------------------------------------------------
-- Unidades (apartamentos / salas)
-- ---------------------------------------------------------------
create table if not exists agenda.unidades (
  id                   uuid primary key default gen_random_uuid(),
  predio_id            uuid not null references agenda.predios (id) on delete cascade,
  numero               text not null check (char_length(btrim(numero)) between 1 and 12),
  status               text not null default 'ocupado' check (status in ('vago', 'ocupado')),
  -- desde quando está no status atual; null = não se sabe (veio da carga inicial)
  status_desde         timestamptz,
  atualizado_em        timestamptz,
  atualizado_por       uuid references agenda.perfis (id) on delete set null,
  atualizado_por_nome  text,   -- nome de quem mudou, guardado junto (perfis só mostra o próprio)
  criado_em            timestamptz not null default now(),
  constraint unidades_predio_numero_uq unique (predio_id, numero)
);

comment on table agenda.unidades is 'Aba Apartamentos: unidades e status vago|ocupado. Fonte da verdade do status (não é o RF OPS).';
comment on column agenda.unidades.status_desde is 'Início do status atual. Null = desconhecido (carga inicial da planilha).';

-- ---------------------------------------------------------------
-- Histórico das mudanças de status (só o trigger escreve)
-- ---------------------------------------------------------------
create table if not exists agenda.unidades_historico (
  id                 bigint generated always as identity primary key,
  unidade_id         uuid not null references agenda.unidades (id) on delete cascade,
  status_anterior    text not null check (status_anterior in ('vago', 'ocupado')),
  status_novo        text not null check (status_novo in ('vago', 'ocupado')),
  alterado_em        timestamptz not null default now(),
  alterado_por       uuid references agenda.perfis (id) on delete set null,
  alterado_por_nome  text
);

create index if not exists unidades_historico_unidade_idx on agenda.unidades_historico (unidade_id, alterado_em desc);

comment on table agenda.unidades_historico is 'Aba Apartamentos: uma linha por mudança de status (gravada por trigger). Base para tempo de vacância.';

-- ---------------------------------------------------------------
-- Trigger 1 (BEFORE): carimba quem/quando.
-- Dispara SÓ quando o status muda de fato (ver WHEN). Roda com as permissões de quem
-- chama: lê o próprio perfil (RLS deixa) para guardar o nome.
-- ---------------------------------------------------------------
create or replace function agenda.unidades_carimbar() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_quem uuid;
  v_nome text;
begin
  -- só carimba quem tem perfil na agenda; SQL Editor / service_role ficam como null
  select p.id, p.nome into v_quem, v_nome from agenda.perfis p where p.id = (select auth.uid());
  new.status_desde        := now();
  new.atualizado_em       := now();
  new.atualizado_por      := v_quem;
  new.atualizado_por_nome := v_nome;
  return new;
end $$;

drop trigger if exists unidades_carimbar on agenda.unidades;
create trigger unidades_carimbar
  before update of status on agenda.unidades
  for each row when (old.status is distinct from new.status)
  execute function agenda.unidades_carimbar();

-- ---------------------------------------------------------------
-- Trigger 2 (AFTER): grava a mudança no histórico.
-- SECURITY DEFINER de propósito: o app não tem INSERT no histórico (não dá para
-- forjar nem apagar); só este trigger escreve, com os dados já carimbados acima.
-- ---------------------------------------------------------------
create or replace function agenda.unidades_historiar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into agenda.unidades_historico (unidade_id, status_anterior, status_novo, alterado_em, alterado_por, alterado_por_nome)
  values (new.id, old.status, new.status, new.atualizado_em, new.atualizado_por, new.atualizado_por_nome);
  return null;
end $$;

drop trigger if exists unidades_historiar on agenda.unidades;
create trigger unidades_historiar
  after update of status on agenda.unidades
  for each row when (old.status is distinct from new.status)
  execute function agenda.unidades_historiar();

revoke all on function agenda.unidades_carimbar()  from public, anon, authenticated;
revoke all on function agenda.unidades_historiar() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Permissões (schema novo não herda os grants de public): o app lê tudo e
-- altera SÓ a coluna status. Sem INSERT/DELETE/TRUNCATE para o app.
-- ---------------------------------------------------------------
revoke all on agenda.predios, agenda.unidades, agenda.unidades_historico from public, anon, authenticated;
grant select          on agenda.predios, agenda.unidades, agenda.unidades_historico to authenticated;
grant update (status) on agenda.unidades to authenticated;
grant all             on agenda.predios, agenda.unidades, agenda.unidades_historico to service_role;

-- ---------------------------------------------------------------
-- RLS: só quem está habilitado na agenda (tem linha em agenda.perfis).
-- O `exists` não depende da linha: é avaliado uma vez por consulta.
-- ---------------------------------------------------------------
alter table agenda.predios            enable row level security;
alter table agenda.unidades           enable row level security;
alter table agenda.unidades_historico enable row level security;

drop policy if exists "prédios: habilitados leem" on agenda.predios;
create policy "prédios: habilitados leem" on agenda.predios
  for select to authenticated
  using (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())));

drop policy if exists "unidades: habilitados leem" on agenda.unidades;
create policy "unidades: habilitados leem" on agenda.unidades
  for select to authenticated
  using (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())));

-- ATENÇÃO: a 0009 substitui esta policy (casas de temporada só o Saulo). Reaplicou a 0007? Reaplique a 0009.
drop policy if exists "unidades: habilitados mudam o status" on agenda.unidades;
create policy "unidades: habilitados mudam o status" on agenda.unidades
  for update to authenticated
  using (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())))
  with check (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())));

drop policy if exists "histórico: habilitados leem" on agenda.unidades_historico;
create policy "histórico: habilitados leem" on agenda.unidades_historico
  for select to authenticated
  using (exists (select 1 from agenda.perfis p where p.id = (select auth.uid())));

-- ---------------------------------------------------------------
-- Carga inicial — planilha de 25/11/2026 (Predio | AP/SALA | Status atual)
-- 68 unidades: Feitosa 1 = 11, Feitosa 2 = 16, Feitosa 3 = 34, Connect Office = 7.
-- 8 vagas: Feitosa 2 → 304 · Feitosa 3 → 6, 18, 24 · Connect Office → 102, 104, 201, 202.
-- ---------------------------------------------------------------
insert into agenda.predios (nome, tipo_unidade, ordem) values
  ('Feitosa 1',      'apartamento', 1),
  ('Feitosa 2',      'apartamento', 2),
  ('Feitosa 3',      'apartamento', 3),
  ('Connect Office', 'sala',        4)
on conflict (nome) do nothing;

with planilha (predio, numero, status) as (
  values
    -- Feitosa 1 (11)
    ('Feitosa 1', '1', 'ocupado'),   ('Feitosa 1', '3', 'ocupado'),   ('Feitosa 1', '4', 'ocupado'),
    ('Feitosa 1', '101', 'ocupado'), ('Feitosa 1', '102', 'ocupado'), ('Feitosa 1', '103', 'ocupado'), ('Feitosa 1', '104', 'ocupado'),
    ('Feitosa 1', '201', 'ocupado'), ('Feitosa 1', '202', 'ocupado'), ('Feitosa 1', '203', 'ocupado'), ('Feitosa 1', '204', 'ocupado'),
    -- Feitosa 2 (16)
    ('Feitosa 2', '101', 'ocupado'), ('Feitosa 2', '102', 'ocupado'), ('Feitosa 2', '103', 'ocupado'), ('Feitosa 2', '104', 'ocupado'),
    ('Feitosa 2', '201', 'ocupado'), ('Feitosa 2', '202', 'ocupado'), ('Feitosa 2', '203', 'ocupado'), ('Feitosa 2', '204', 'ocupado'),
    ('Feitosa 2', '301', 'ocupado'), ('Feitosa 2', '302', 'ocupado'), ('Feitosa 2', '303', 'ocupado'), ('Feitosa 2', '304', 'vago'),
    ('Feitosa 2', '401', 'ocupado'), ('Feitosa 2', '402', 'ocupado'), ('Feitosa 2', '403', 'ocupado'), ('Feitosa 2', '404', 'ocupado'),
    -- Feitosa 3 (34)
    ('Feitosa 3', '1', 'ocupado'),  ('Feitosa 3', '2', 'ocupado'),  ('Feitosa 3', '3', 'ocupado'),  ('Feitosa 3', '4', 'ocupado'),
    ('Feitosa 3', '5', 'ocupado'),  ('Feitosa 3', '6', 'vago'),     ('Feitosa 3', '7', 'ocupado'),  ('Feitosa 3', '8', 'ocupado'),
    ('Feitosa 3', '9', 'ocupado'),  ('Feitosa 3', '10', 'ocupado'), ('Feitosa 3', '11', 'ocupado'), ('Feitosa 3', '12', 'ocupado'),
    ('Feitosa 3', '13', 'ocupado'), ('Feitosa 3', '14', 'ocupado'), ('Feitosa 3', '15', 'ocupado'), ('Feitosa 3', '16', 'ocupado'),
    ('Feitosa 3', '17', 'ocupado'), ('Feitosa 3', '18', 'vago'),    ('Feitosa 3', '19', 'ocupado'), ('Feitosa 3', '20', 'ocupado'),
    ('Feitosa 3', '21', 'ocupado'), ('Feitosa 3', '22', 'ocupado'), ('Feitosa 3', '23', 'ocupado'), ('Feitosa 3', '24', 'vago'),
    ('Feitosa 3', '25', 'ocupado'), ('Feitosa 3', '26', 'ocupado'), ('Feitosa 3', '27', 'ocupado'), ('Feitosa 3', '28', 'ocupado'),
    ('Feitosa 3', '29', 'ocupado'), ('Feitosa 3', '30', 'ocupado'), ('Feitosa 3', '31', 'ocupado'), ('Feitosa 3', '32', 'ocupado'),
    ('Feitosa 3', '33', 'ocupado'), ('Feitosa 3', '34', 'ocupado'),
    -- Connect Office (7)
    ('Connect Office', '101', 'ocupado'), ('Connect Office', '102', 'vago'), ('Connect Office', '103', 'ocupado'), ('Connect Office', '104', 'vago'),
    ('Connect Office', '201', 'vago'),    ('Connect Office', '202', 'vago'), ('Connect Office', '203', 'ocupado')
)
insert into agenda.unidades (predio_id, numero, status)
select p.id, s.numero, s.status
  from planilha s
  join agenda.predios p on p.nome = s.predio
on conflict (predio_id, numero) do nothing;

-- a API (PostgREST) passa a enxergar as tabelas novas
notify pgrst, 'reload schema';
