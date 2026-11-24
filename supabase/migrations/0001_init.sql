-- Agenda por Voz — schema inicial
-- Rode com: supabase db push   (ou cole no SQL Editor do Supabase)

-- ---------------------------------------------------------------
-- Utilitário: valida nome de fuso IANA (ex.: America/Fortaleza)
-- ---------------------------------------------------------------
create function public.fuso_valido(nome text) returns boolean
language sql stable set search_path = pg_catalog as $$
  select exists (select 1 from pg_timezone_names where name = nome)
$$;

-- ---------------------------------------------------------------
-- Perfis (um por usuário do auth)
-- ---------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text,
  -- fuso usado para montar o texto do lembrete ("Hoje às 15:00")
  fuso        text not null default 'America/Fortaleza' check (public.fuso_valido(fuso)),
  criado_em   timestamptz not null default now()
);

-- cria o perfil automaticamente quando o usuário se cadastra
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Eventos (compromissos)
-- ---------------------------------------------------------------
create table public.eventos (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
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

create index eventos_user_inicio_idx on public.eventos (user_id, inicio);
create index eventos_pendentes_idx   on public.eventos (inicio) where status = 'pendente' and lembrete_enviado_em is null;

-- Se a pessoa muda o horário ou a antecedência, o lembrete volta a valer.
-- Sem isso, um evento remarcado depois do aviso nunca seria lembrado de novo.
create function public.rearmar_lembrete() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.inicio is distinct from old.inicio
     or new.lembrar_min_antes is distinct from old.lembrar_min_antes then
    new.lembrete_enviado_em := null;
    new.adiar_ate := null;
  end if;
  return new;
end $$;

create trigger eventos_rearmar_lembrete
  before update of inicio, lembrar_min_antes on public.eventos
  for each row execute function public.rearmar_lembrete();

-- ---------------------------------------------------------------
-- Inscrições de push (um registro por aparelho/navegador)
-- ---------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  criado_em   timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------
-- RLS: cada pessoa só enxerga o que é dela
-- (para agenda compartilhada por setor, troque as policies por uma tabela de membros)
-- `(select auth.uid())` é avaliado uma vez por consulta, não por linha.
-- ---------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.eventos            enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "perfil: ver o próprio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil: editar o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "eventos: tudo do próprio" on public.eventos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "push: tudo do próprio" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- Lembretes vencidos — usada SÓ pela Edge Function send-reminders.
--
-- "Reivindica" o lote de forma atômica: marca lembrete_enviado_em na mesma
-- instrução que seleciona (FOR UPDATE SKIP LOCKED). Assim, se duas execuções
-- do cron se sobrepuserem, cada lembrete sai uma única vez.
-- Se o envio falhar por erro transitório, a função devolve o lembrete com
-- liberar_lembrete() e ele é tentado de novo no minuto seguinte.
-- ---------------------------------------------------------------
create function public.reivindicar_lembretes(lote integer default 200)
returns table (id uuid, user_id uuid, titulo text, descricao text, inicio timestamptz, fuso text)
language sql security definer set search_path = public as $$
  with alvo as (
    select e.id
    from public.eventos e
    where e.status = 'pendente'
      and e.lembrete_enviado_em is null
      and coalesce(e.adiar_ate, e.inicio - make_interval(mins => e.lembrar_min_antes)) <= now()
      and e.inicio > now() - interval '2 hours'      -- não dispara coisa muito antiga
    order by e.inicio
    limit lote
    for update skip locked
  ),
  marcados as (
    update public.eventos e
       set lembrete_enviado_em = now(), adiar_ate = null
      from alvo
     where e.id = alvo.id
    returning e.id, e.user_id, e.titulo, e.descricao, e.inicio
  )
  select m.id, m.user_id, m.titulo, m.descricao, m.inicio,
         coalesce(p.fuso, 'America/Fortaleza') as fuso
  from marcados m
  left join public.profiles p on p.id = m.user_id
  order by m.inicio;
$$;

create function public.liberar_lembrete(evento_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.eventos set lembrete_enviado_em = null
  where id = evento_id and status = 'pendente';
$$;

revoke all on function public.reivindicar_lembretes(integer) from public, anon, authenticated;
revoke all on function public.liberar_lembrete(uuid)         from public, anon, authenticated;
grant execute on function public.reivindicar_lembretes(integer) to service_role;
grant execute on function public.liberar_lembrete(uuid)         to service_role;
