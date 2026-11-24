-- Agenda por Voz — schema inicial
--
-- Tudo vive no schema `agenda`, isolado do restante do projeto Supabase hospedeiro
-- (rf-ops). Nada aqui cria, altera ou lê objetos de `public` nem põe trigger em
-- `auth.users`. O único ponto compartilhado é o login (auth.users), que é do projeto.
--
-- Acesso: estar em auth.users NÃO dá acesso à agenda. Só quem tem linha em
-- agenda.perfis usa o app (ver agenda.habilitar_usuario). As FKs de eventos e
-- push_subscriptions apontam para agenda.perfis, então quem não foi habilitado
-- não consegue gravar nada.

create schema if not exists agenda;
comment on schema agenda is 'App Agenda por Voz (repo smokeagendas). Isolado do restante do projeto.';

-- Sem acesso para anon; usuários logados e o service_role (Edge Functions)
revoke all on schema agenda from public, anon;
grant usage on schema agenda to authenticated, service_role;

-- ---------------------------------------------------------------
-- Utilitário: valida nome de fuso IANA (ex.: America/Fortaleza)
-- ---------------------------------------------------------------
create function agenda.fuso_valido(nome text) returns boolean
language sql stable set search_path = pg_catalog as $$
  select exists (select 1 from pg_timezone_names where name = nome)
$$;

-- ---------------------------------------------------------------
-- Perfis = lista de quem pode usar a agenda
-- ---------------------------------------------------------------
create table agenda.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text,
  -- fuso usado para montar o texto do lembrete ("Hoje às 15:00")
  fuso        text not null default 'America/Fortaleza' check (agenda.fuso_valido(fuso)),
  criado_em   timestamptz not null default now()
);

-- Habilita (ou atualiza) uma pessoa que já existe no Authentication.
-- Uso no SQL Editor:  select agenda.habilitar_usuario('fulano@empresa.com.br', 'Fulano');
create function agenda.habilitar_usuario(p_email text, p_nome text default null,
                                         p_fuso text default 'America/Fortaleza')
returns uuid
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'Usuário % não existe em Authentication → Users', p_email;
  end if;
  insert into agenda.perfis (id, nome, fuso)
  values (v_id, coalesce(p_nome, split_part(p_email, '@', 1)), p_fuso)
  on conflict (id) do update set nome = coalesce(p_nome, agenda.perfis.nome), fuso = excluded.fuso;
  return v_id;
end $$;

-- Desabilitar = apagar o perfil (leva junto eventos e inscrições de push da agenda).
-- Uso:  delete from agenda.perfis where id = (select id from auth.users where email = '...');

-- ---------------------------------------------------------------
-- Eventos (compromissos)
-- ---------------------------------------------------------------
create table agenda.eventos (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references agenda.perfis (id) on delete cascade,
  titulo                text not null check (char_length(btrim(titulo)) between 1 and 200),
  descricao             text check (char_length(descricao) <= 2000),
  inicio                timestamptz not null,
  fim                   timestamptz,
  lembrar_min_antes     integer not null default 30 check (lembrar_min_antes between 0 and 10080), -- até 7 dias
  adiar_ate             timestamptz,            -- "adiar": novo horário do lembrete
  lembrete_enviado_em   timestamptz,
  recorrencia           text check (recorrencia in ('diaria', 'semanal', 'mensal')),  -- TODO: expandir ocorrências
  status                text not null default 'pendente' check (status in ('pendente', 'concluido', 'cancelado')),
  transcricao           text check (char_length(transcricao) <= 10000), -- texto do áudio (o áudio NÃO é guardado)
  criado_em             timestamptz not null default now(),
  constraint eventos_fim_apos_inicio check (fim is null or fim >= inicio)
);

create index eventos_user_inicio_idx on agenda.eventos (user_id, inicio);
create index eventos_pendentes_idx   on agenda.eventos (inicio) where status = 'pendente' and lembrete_enviado_em is null;

-- Se a pessoa muda o horário ou a antecedência, o lembrete volta a valer.
-- Sem isso, um evento remarcado depois do aviso nunca seria lembrado de novo.
create function agenda.rearmar_lembrete() returns trigger
language plpgsql set search_path = agenda, pg_catalog as $$
begin
  if new.inicio is distinct from old.inicio
     or new.lembrar_min_antes is distinct from old.lembrar_min_antes then
    new.lembrete_enviado_em := null;
    new.adiar_ate := null;
  end if;
  return new;
end $$;

create trigger eventos_rearmar_lembrete
  before update of inicio, lembrar_min_antes on agenda.eventos
  for each row execute function agenda.rearmar_lembrete();

-- ---------------------------------------------------------------
-- Inscrições de push (um registro por aparelho/navegador)
-- ---------------------------------------------------------------
create table agenda.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references agenda.perfis (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  criado_em   timestamptz not null default now()
);

create index push_subscriptions_user_idx on agenda.push_subscriptions (user_id);

-- ---------------------------------------------------------------
-- Permissões de tabela (schema novo não herda os grants padrão de public)
-- ---------------------------------------------------------------
grant select, update (nome, fuso)                        on agenda.perfis             to authenticated;
grant select, insert, update, delete                     on agenda.eventos            to authenticated;
grant select, insert, update, delete                     on agenda.push_subscriptions to authenticated;
grant all on all tables in schema agenda to service_role;

-- ---------------------------------------------------------------
-- RLS: cada pessoa só enxerga o que é dela
-- `(select auth.uid())` é avaliado uma vez por consulta, não por linha.
-- ---------------------------------------------------------------
alter table agenda.perfis             enable row level security;
alter table agenda.eventos            enable row level security;
alter table agenda.push_subscriptions enable row level security;

create policy "perfil: ver o próprio" on agenda.perfis
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil: editar o próprio" on agenda.perfis
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "eventos: tudo do próprio" on agenda.eventos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "push: tudo do próprio" on agenda.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- Lembretes vencidos — usada SÓ pela Edge Function agenda-send-reminders.
--
-- "Reivindica" o lote de forma atômica: marca lembrete_enviado_em na mesma
-- instrução que seleciona (FOR UPDATE SKIP LOCKED). Assim, se duas execuções
-- do cron se sobrepuserem, cada lembrete sai uma única vez.
-- Se o envio falhar por erro transitório, a função devolve o lembrete com
-- liberar_lembrete() e ele é tentado de novo no minuto seguinte.
-- ---------------------------------------------------------------
create function agenda.reivindicar_lembretes(lote integer default 200)
returns table (id uuid, user_id uuid, titulo text, descricao text, inicio timestamptz, fuso text)
language sql security definer set search_path = agenda, pg_catalog as $$
  with alvo as (
    select e.id
    from agenda.eventos e
    where e.status = 'pendente'
      and e.lembrete_enviado_em is null
      and coalesce(e.adiar_ate, e.inicio - make_interval(mins => e.lembrar_min_antes)) <= now()
      and e.inicio > now() - interval '2 hours'      -- não dispara coisa muito antiga
    order by e.inicio
    limit lote
    for update skip locked
  ),
  marcados as (
    update agenda.eventos e
       set lembrete_enviado_em = now(), adiar_ate = null
      from alvo
     where e.id = alvo.id
    returning e.id, e.user_id, e.titulo, e.descricao, e.inicio
  )
  select m.id, m.user_id, m.titulo, m.descricao, m.inicio, p.fuso
  from marcados m
  join agenda.perfis p on p.id = m.user_id
  order by m.inicio;
$$;

create function agenda.liberar_lembrete(evento_id uuid) returns void
language sql security definer set search_path = agenda, pg_catalog as $$
  update agenda.eventos set lembrete_enviado_em = null
  where id = evento_id and status = 'pendente';
$$;

-- Em schema novo, funções nascem executáveis por PUBLIC: fechamos as sensíveis.
revoke all on function agenda.reivindicar_lembretes(integer)     from public, anon, authenticated;
revoke all on function agenda.liberar_lembrete(uuid)             from public, anon, authenticated;
revoke all on function agenda.habilitar_usuario(text, text, text) from public, anon, authenticated;
grant execute on function agenda.reivindicar_lembretes(integer) to service_role;
grant execute on function agenda.liberar_lembrete(uuid)         to service_role;
grant execute on function agenda.habilitar_usuario(text, text, text) to service_role;
