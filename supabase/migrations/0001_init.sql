-- Agenda por Voz — schema inicial
-- Rode com: supabase db push   (ou cole no SQL Editor do Supabase)

-- ---------------------------------------------------------------
-- Perfis (um por usuário do auth)
-- ---------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text,
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
  titulo                text not null,
  descricao             text,
  inicio                timestamptz not null,
  fim                   timestamptz,
  lembrar_min_antes     integer not null default 30 check (lembrar_min_antes >= 0),
  adiar_ate             timestamptz,            -- "adiar": novo horário do lembrete
  lembrete_enviado_em   timestamptz,
  recorrencia           text check (recorrencia in ('diaria', 'semanal', 'mensal')),  -- TODO: expandir ocorrências
  status                text not null default 'pendente' check (status in ('pendente', 'concluido', 'cancelado')),
  transcricao           text,                   -- texto do áudio (o áudio em si NÃO é guardado)
  criado_em             timestamptz not null default now()
);

create index eventos_user_inicio_idx on public.eventos (user_id, inicio);
create index eventos_pendentes_idx   on public.eventos (inicio) where status = 'pendente' and lembrete_enviado_em is null;

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

-- ---------------------------------------------------------------
-- RLS: cada pessoa só enxerga o que é dela
-- (para agenda compartilhada por setor, troque as policies por uma tabela de membros)
-- ---------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.eventos            enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "perfil: ver o próprio"    on public.profiles for select using (id = auth.uid());
create policy "perfil: editar o próprio" on public.profiles for update using (id = auth.uid());

create policy "eventos: tudo do próprio" on public.eventos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "push: tudo do próprio" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Função usada pelo cron/Edge Function: quais lembretes vencem agora
-- ---------------------------------------------------------------
create function public.eventos_para_lembrar() returns setof public.eventos
language sql security definer set search_path = public as $$
  select *
  from public.eventos
  where status = 'pendente'
    and lembrete_enviado_em is null
    and coalesce(adiar_ate, inicio - (lembrar_min_antes * interval '1 minute')) <= now()
    and inicio > now() - interval '2 hours'      -- não dispara coisa muito antiga
  order by inicio
  limit 200;
$$;

revoke all on function public.eventos_para_lembrar() from public, anon, authenticated;
grant execute on function public.eventos_para_lembrar() to service_role;
