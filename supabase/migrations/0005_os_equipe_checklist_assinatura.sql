-- Agenda por Voz — 0005: OS por equipe, checklist por tipo de equipamento e assinatura do cliente
-- Requer a 0004. Pode ser aplicada logo depois dela (nome no rf-ops: agenda_0005_os_equipe).
--
-- EQUIPES
--   agenda.os_equipes / agenda.os_membros (papel: gestor | tecnico)
--   Quem vê uma OS:
--     • quem abriu (user_id)
--     • o técnico atribuído (tecnico_id), enquanto for membro da equipe da OS
--     • os GESTORES da equipe da OS (veem e editam todas as OS da equipe)
--   Atribuir/reatribuir técnico, trocar a equipe e CANCELAR: só quem abriu ou gestor.
--   Membros são geridos por funções (sem escrita direta nas tabelas):
--     select agenda.os_criar_equipe('PHILCO Fortaleza', 'gestor@empresa.com.br');      -- SQL Editor
--     select agenda.os_definir_membro('<equipe_id>', 'tecnico@empresa.com.br', 'tecnico'); -- gestor no app
--
-- CHECKLIST
--   os_ordens.categoria + os_ordens.checklist (jsonb: [{item, resposta: ok|nao_ok|na|null, obs}])
--   Modelos sugeridos por categoria em agenda.os_checklist_modelos (editáveis por SQL).
--   Concluir exige TODOS os itens respondidos.
--
-- ASSINATURA
--   Imagem PNG no mesmo bucket: <dono>/<os_id>/assinatura/<arquivo>.png
--   os_ordens.assinatura_caminho / assinatura_nome / assinado_em (carimbo do servidor).
--   Opcional para concluir; fica travada com a OS concluída.

-- ---------------------------------------------------------------
-- Equipes e membros
-- ---------------------------------------------------------------
create table agenda.os_equipes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique check (char_length(btrim(nome)) between 1 and 120),
  criado_em  timestamptz not null default now()
);

create table agenda.os_membros (
  equipe_id  uuid not null references agenda.os_equipes (id) on delete cascade,
  user_id    uuid not null references agenda.perfis (id) on delete cascade,
  papel      text not null check (papel in ('gestor', 'tecnico')),
  criado_em  timestamptz not null default now(),
  primary key (equipe_id, user_id)
);

create index os_membros_user_idx on agenda.os_membros (user_id);

-- Papel de quem está logado numa equipe (null = não é membro). Usada nas policies.
create function agenda.os_papel(p_equipe uuid) returns text
language sql stable security definer set search_path = agenda, pg_catalog as $$
  select m.papel from agenda.os_membros m
  where m.equipe_id = p_equipe and m.user_id = auth.uid()
$$;

create function agenda.os_nome(p_user uuid) returns text
language sql stable security definer set search_path = agenda, pg_catalog as $$
  select p.nome from agenda.perfis p where p.id = p_user
$$;

-- Estrutura do checklist: [{item: texto, resposta: ok|nao_ok|na|null, obs: texto}]
create function agenda.os_checklist_valido(c jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(c) = 'array' and jsonb_array_length(c) <= 60 and not exists (
    select 1 from jsonb_array_elements(c) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'item') is distinct from 'string'
       or char_length(btrim(e ->> 'item')) not between 1 and 200
       or coalesce(e ->> 'resposta', '') not in ('', 'ok', 'nao_ok', 'na')
       or char_length(coalesce(e ->> 'obs', '')) > 500)
$$;

-- ---------------------------------------------------------------
-- Colunas novas na OS
-- ---------------------------------------------------------------
alter table agenda.os_ordens
  add column equipe_id           uuid references agenda.os_equipes (id) on delete set null,
  add column tecnico_id          uuid references agenda.perfis (id) on delete set null,
  add column categoria           text check (char_length(categoria) <= 80),
  add column checklist           jsonb not null default '[]'::jsonb,
  add column assinatura_caminho  text,
  add column assinatura_nome     text check (char_length(assinatura_nome) <= 120),
  add column assinado_em         timestamptz,
  add constraint os_checklist_valido check (agenda.os_checklist_valido(checklist)),
  add constraint os_assinatura_coerente check (
    (assinatura_caminho is null and assinado_em is null)
    or (assinatura_caminho is not null and char_length(btrim(coalesce(assinatura_nome, ''))) > 0
        and assinatura_caminho like user_id::text || '/' || id::text || '/assinatura/%')
  );

create index os_ordens_equipe_idx  on agenda.os_ordens (equipe_id, status) where equipe_id is not null;
create index os_ordens_tecnico_idx on agenda.os_ordens (tecnico_id, status) where tecnico_id is not null;

-- Pode ver/mexer nesta OS? (usada por fotos, histórico e Storage)
create function agenda.os_pode_acessar(p_os uuid) returns boolean
language sql stable security definer set search_path = agenda, pg_catalog as $$
  select exists (
    select 1 from agenda.os_ordens o
    where o.id = p_os
      and (o.user_id = auth.uid()
           or (o.tecnico_id = auth.uid() and (o.equipe_id is null or agenda.os_papel(o.equipe_id) is not null))
           or (o.equipe_id is not null and agenda.os_papel(o.equipe_id) = 'gestor'))
  )
$$;

-- ---------------------------------------------------------------
-- Modelos de checklist por categoria de equipamento
-- (sugestões iniciais — ajuste aos procedimentos do cliente pelo SQL Editor)
-- ---------------------------------------------------------------
create table agenda.os_checklist_modelos (
  categoria  text primary key,
  itens      text[] not null check (cardinality(itens) between 1 and 60),
  ordem      integer not null default 0
);

insert into agenda.os_checklist_modelos (categoria, ordem, itens) values
  ('TV / Monitor', 1, array[
    'Equipamento liga e desliga normalmente', 'Imagem sem falhas, manchas ou linhas', 'Som em todos os canais',
    'Controle remoto funcionando', 'Entradas HDMI/USB testadas', 'Conexão Wi-Fi / Smart TV testada',
    'Tela e carcaça sem danos', 'Nº de série confere com a OS', 'Local limpo após o serviço', 'Cliente orientado sobre o uso']),
  ('Ar-condicionado', 2, array[
    'Liga e responde ao controle', 'Temperatura de insuflamento medida', 'Dreno sem vazamento',
    'Filtros limpos', 'Serpentinas (evaporadora/condensadora) limpas', 'Pressão do gás verificada',
    'Fixação, tubulação e isolamento conferidos', 'Ruído e vibração normais', 'Local limpo após o serviço', 'Cliente orientado sobre o uso']),
  ('Refrigerador / Freezer', 3, array[
    'Liga e refrigera', 'Temperatura interna medida', 'Vedação das portas', 'Sem ruído anormal',
    'Degelo funcionando', 'Iluminação interna', 'Local limpo após o serviço', 'Cliente orientado sobre o uso']),
  ('Lavadora / Lava e seca', 4, array[
    'Liga', 'Enche e drena', 'Centrifugação', 'Sem vazamentos', 'Trava da porta', 'Ciclo de teste concluído',
    'Local limpo após o serviço', 'Cliente orientado sobre o uso']),
  ('Micro-ondas / Forno / Air fryer', 5, array[
    'Liga', 'Aquece (teste com água)', 'Painel e teclas', 'Porta e trava', 'Prato giratório / cesto',
    'Sem faíscas ou odor', 'Local limpo após o serviço', 'Cliente orientado sobre o uso']),
  ('Áudio / Eletroportátil', 6, array[
    'Liga', 'Funções principais testadas', 'Cabos e conectores', 'Carcaça sem danos',
    'Local limpo após o serviço', 'Cliente orientado sobre o uso']),
  ('Outro', 99, array[
    'Equipamento testado após o serviço', 'Sem danos aparentes', 'Local limpo após o serviço', 'Cliente orientado sobre o uso']);

-- ---------------------------------------------------------------
-- Funções de gestão da equipe
-- ---------------------------------------------------------------

-- Admin (SQL Editor / service_role): cria a equipe com o 1º gestor
create function agenda.os_criar_equipe(p_nome text, p_email_gestor text) returns uuid
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_equipe uuid;
  v_user   uuid;
begin
  select p.id into v_user from agenda.perfis p join auth.users u on u.id = p.id
  where lower(u.email) = lower(btrim(p_email_gestor));
  if v_user is null then
    raise exception 'Gestor % não está habilitado na agenda (use agenda.habilitar_usuario)', p_email_gestor;
  end if;
  insert into agenda.os_equipes (nome) values (btrim(p_nome)) returning id into v_equipe;
  insert into agenda.os_membros (equipe_id, user_id, papel) values (v_equipe, v_user, 'gestor');
  return v_equipe;
end $$;

-- Gestor (no app) ou admin: inclui ou muda o papel de alguém já habilitado na agenda
create function agenda.os_definir_membro(p_equipe uuid, p_email text, p_papel text) returns uuid
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_user uuid;
begin
  if auth.uid() is not null and agenda.os_papel(p_equipe) is distinct from 'gestor' then
    raise exception 'Só o gestor da equipe pode incluir membros' using errcode = 'insufficient_privilege';
  end if;
  if p_papel not in ('gestor', 'tecnico') then
    raise exception 'Papel inválido: %', p_papel;
  end if;
  select p.id into v_user from agenda.perfis p join auth.users u on u.id = p.id
  where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Pessoa não habilitada na agenda: %. Peça ao administrador para habilitar.', p_email;
  end if;
  if v_user = auth.uid() and p_papel <> 'gestor' and
     (select count(*) from agenda.os_membros where equipe_id = p_equipe and papel = 'gestor') = 1 then
    raise exception 'A equipe precisa de ao menos um gestor';
  end if;
  insert into agenda.os_membros (equipe_id, user_id, papel) values (p_equipe, v_user, p_papel)
  on conflict (equipe_id, user_id) do update set papel = excluded.papel;
  return v_user;
end $$;

create function agenda.os_remover_membro(p_equipe uuid, p_user uuid) returns void
language plpgsql security definer set search_path = agenda, pg_catalog as $$
begin
  if auth.uid() is not null and agenda.os_papel(p_equipe) is distinct from 'gestor' then
    raise exception 'Só o gestor da equipe pode remover membros' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from agenda.os_membros where equipe_id = p_equipe and user_id = p_user and papel = 'gestor')
     and (select count(*) from agenda.os_membros where equipe_id = p_equipe and papel = 'gestor') = 1 then
    raise exception 'A equipe precisa de ao menos um gestor';
  end if;
  delete from agenda.os_membros where equipe_id = p_equipe and user_id = p_user;
end $$;

-- Equipes de quem está logado + todos os membros delas (com nome)
create function agenda.os_minhas_equipes()
returns table (equipe_id uuid, equipe_nome text, meu_papel text, user_id uuid, nome text, papel text)
language sql stable security definer set search_path = agenda, pg_catalog as $$
  select e.id, e.nome, eu.papel, m.user_id, p.nome, m.papel
  from agenda.os_membros eu
  join agenda.os_equipes e on e.id = eu.equipe_id
  join agenda.os_membros m on m.equipe_id = e.id
  join agenda.perfis p on p.id = m.user_id
  where eu.user_id = auth.uid()
  order by e.nome, m.papel, p.nome
$$;

-- ---------------------------------------------------------------
-- Triggers da OS (substituem as da 0004)
-- ---------------------------------------------------------------

-- Valida equipe/técnico (insert e update). auth.uid() nulo = admin/service_role: sem restrição.
create function agenda.os_validar_equipe() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_gestor boolean;
begin
  if v_uid is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and (new.equipe_id is distinct from old.equipe_id or new.tecnico_id is distinct from old.tecnico_id) then
    v_gestor := old.equipe_id is not null and agenda.os_papel(old.equipe_id) = 'gestor';
    if v_uid <> old.user_id and not v_gestor then
      raise exception 'Só quem abriu a OS ou o gestor da equipe pode atribuir técnico ou trocar a equipe'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.equipe_id is not null
     and (tg_op = 'INSERT' or new.equipe_id is distinct from old.equipe_id)
     and agenda.os_papel(new.equipe_id) is null then
    raise exception 'Você não é membro desta equipe' using errcode = 'check_violation';
  end if;

  if new.tecnico_id is not null and (tg_op = 'INSERT' or new.tecnico_id is distinct from old.tecnico_id
                                     or new.equipe_id is distinct from old.equipe_id) then
    if new.equipe_id is null then
      if new.tecnico_id <> new.user_id then
        raise exception 'Sem equipe, a OS só pode ser atribuída a quem a abriu' using errcode = 'check_violation';
      end if;
    elsif not exists (select 1 from agenda.os_membros where equipe_id = new.equipe_id and user_id = new.tecnico_id) then
      raise exception 'O técnico precisa ser membro da equipe da OS' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelada' and old.status <> 'cancelada'
     and v_uid <> old.user_id and not (old.equipe_id is not null and agenda.os_papel(old.equipe_id) = 'gestor') then
    raise exception 'Só quem abriu a OS ou o gestor pode cancelar' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger os_ordens_validar_equipe
  before insert or update on agenda.os_ordens
  for each row execute function agenda.os_validar_equipe();

-- Regras de status, fotos, checklist e assinatura (substitui a da 0004)
create or replace function agenda.os_validar() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  n_antes     integer;
  n_depois    integer;
  n_pendentes integer;
begin
  if new.numero is distinct from old.numero or new.ano is distinct from old.ano
     or new.sequencial is distinct from old.sequencial or new.user_id is distinct from old.user_id
     or new.aberta_em is distinct from old.aberta_em then
    raise exception 'Número, dono e data de abertura da OS não podem ser alterados'
      using errcode = 'check_violation';
  end if;

  if old.status = 'cancelada' then
    raise exception 'OS % está cancelada e não pode ser alterada', old.numero using errcode = 'check_violation';
  end if;
  if old.status = 'concluida' and new.status = 'concluida' then
    raise exception 'OS % está concluída. Reabra para editar', old.numero using errcode = 'check_violation';
  end if;
  if old.status = 'concluida' and new.status not in ('em_andamento') then
    raise exception 'OS concluída só pode ser reaberta (em andamento)' using errcode = 'check_violation';
  end if;

  -- assinatura: o servidor carimba a hora
  if new.assinatura_caminho is distinct from old.assinatura_caminho then
    new.assinado_em := case when new.assinatura_caminho is null then null else now() end;
    if new.assinatura_caminho is null then new.assinatura_nome := null; end if;
  else
    new.assinado_em := old.assinado_em;
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'em_andamento' then
        new.iniciada_em  := coalesce(old.iniciada_em, now());
        new.concluida_em := null;
      when 'aguardando_peca' then
        new.iniciada_em  := coalesce(old.iniciada_em, now());
      when 'concluida' then
        select count(*) filter (where momento = 'antes'), count(*) filter (where momento = 'depois')
          into n_antes, n_depois
          from agenda.os_fotos where os_id = new.id;
        if n_antes = 0 or n_depois = 0 then
          raise exception 'Para concluir a OS % anexe ao menos 1 foto de ANTES e 1 de DEPOIS (tem % antes / % depois)',
            old.numero, n_antes, n_depois using errcode = 'check_violation';
        end if;
        select count(*) into n_pendentes from jsonb_array_elements(new.checklist) e
          where coalesce(e ->> 'resposta', '') = '';
        if n_pendentes > 0 then
          raise exception 'Para concluir a OS % responda todo o checklist (% item(ns) pendente(s))',
            old.numero, n_pendentes using errcode = 'check_violation';
        end if;
        new.iniciada_em  := coalesce(old.iniciada_em, now());
        new.concluida_em := now();
      when 'cancelada' then
        new.cancelada_em := now();
      when 'aberta' then
        if old.status <> 'aberta' then
          raise exception 'Uma OS em andamento não volta para aberta' using errcode = 'check_violation';
        end if;
    end case;
  else
    new.iniciada_em  := old.iniciada_em;
    new.concluida_em := old.concluida_em;
    new.cancelada_em := old.cancelada_em;
  end if;

  new.atualizada_em := now();
  return new;
end $$;

-- Assinatura não vem pronta na abertura
create or replace function agenda.os_antes_inserir() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
begin
  new.aberta_em     := now();
  new.atualizada_em := now();
  new.ano           := extract(year from now() at time zone 'America/Fortaleza')::integer;
  new.sequencial    := agenda.os_proximo_numero(new.ano);
  new.numero        := format('OS-%s-%s', new.ano, lpad(new.sequencial::text, 5, '0'));
  new.iniciada_em   := case when new.status = 'em_andamento' then now() end;
  new.concluida_em  := null;
  new.cancelada_em  := null;
  new.assinatura_caminho := null;
  new.assinatura_nome    := null;
  new.assinado_em        := null;
  if new.status in ('concluida', 'cancelada') then
    raise exception 'Uma OS nova não pode nascer % — abra e depois conclua', new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Histórico com nome do autor, atribuição e assinatura
alter table agenda.os_historico add column autor_nome text;

create or replace function agenda.os_registrar_historico() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_autor uuid := auth.uid();
  v_nome  text := agenda.os_nome(auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao, para, detalhe)
    values (new.id, new.user_id, v_autor, v_nome, 'abertura', new.status, new.numero);
    if new.tecnico_id is not null then
      insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao, para)
      values (new.id, new.user_id, v_autor, v_nome, 'atribuicao', agenda.os_nome(new.tecnico_id));
    end if;
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao, de, para, detalhe)
    values (new.id, new.user_id, v_autor, v_nome, 'status', old.status, new.status,
            case when new.status = 'cancelada' then new.motivo_cancelamento end);
  end if;
  if new.tecnico_id is distinct from old.tecnico_id then
    insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao, de, para)
    values (new.id, new.user_id, v_autor, v_nome, 'atribuicao', agenda.os_nome(old.tecnico_id), agenda.os_nome(new.tecnico_id));
  end if;
  if new.assinatura_caminho is distinct from old.assinatura_caminho then
    insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao, detalhe)
    values (new.id, new.user_id, v_autor, v_nome,
            case when new.assinatura_caminho is null then 'assinatura_removida' else 'assinatura' end,
            coalesce(new.assinatura_nome, old.assinatura_nome));
  end if;
  -- edição de dados (checklist sozinho não gera linha: cada toque seria um registro;
  -- status, atribuição e assinatura já têm linha própria acima)
  if (to_jsonb(new) - array['checklist', 'atualizada_em', 'tecnico_id', 'assinatura_caminho', 'assinatura_nome',
                            'assinado_em', 'status', 'iniciada_em', 'concluida_em', 'cancelada_em', 'motivo_cancelamento'])
     is distinct from
     (to_jsonb(old) - array['checklist', 'atualizada_em', 'tecnico_id', 'assinatura_caminho', 'assinatura_nome',
                            'assinado_em', 'status', 'iniciada_em', 'concluida_em', 'cancelada_em', 'motivo_cancelamento']) then
    insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao)
    values (new.id, new.user_id, v_autor, v_nome, 'edicao');
  end if;
  return null;
end $$;

-- Fotos: técnico/gestor podem enviar; a foto pertence ao dono da OS e guarda o autor
alter table agenda.os_fotos add column autor_id uuid default auth.uid() references agenda.perfis (id) on delete set null;

create or replace function agenda.os_fotos_controlar() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_os agenda.os_ordens;
begin
  select * into v_os from agenda.os_ordens where id = coalesce(new.os_id, old.os_id);
  if not found then
    return coalesce(new, old);
  end if;

  if v_os.status in ('concluida', 'cancelada') then
    raise exception 'OS % está %: fotos não podem ser incluídas nem removidas', v_os.numero, v_os.status
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    new.user_id  := v_os.user_id;          -- a foto é da OS (pasta do dono)
    new.autor_id := coalesce(auth.uid(), new.autor_id);
    insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao, para, detalhe)
    values (v_os.id, v_os.user_id, auth.uid(), agenda.os_nome(auth.uid()), 'foto_incluida', new.momento, new.legenda);
    return new;
  else
    insert into agenda.os_historico (os_id, user_id, autor_id, autor_nome, acao, de, detalhe)
    values (v_os.id, v_os.user_id, auth.uid(), agenda.os_nome(auth.uid()), 'foto_removida', old.momento, old.legenda);
    return old;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Permissões e RLS (substituem as policies da 0004)
-- ---------------------------------------------------------------
grant select on agenda.os_equipes, agenda.os_membros, agenda.os_checklist_modelos to authenticated;
grant all on agenda.os_equipes, agenda.os_membros, agenda.os_checklist_modelos to service_role;

alter table agenda.os_equipes           enable row level security;
alter table agenda.os_membros           enable row level security;
alter table agenda.os_checklist_modelos enable row level security;

create policy "os_equipes: ver as minhas" on agenda.os_equipes
  for select to authenticated using (agenda.os_papel(id) is not null);
create policy "os_membros: ver colegas" on agenda.os_membros
  for select to authenticated using (agenda.os_papel(equipe_id) is not null);
create policy "os_checklist_modelos: ler" on agenda.os_checklist_modelos
  for select to authenticated using (true);

drop policy "os: tudo do próprio" on agenda.os_ordens;
create policy "os: ver (dono, técnico, gestor)" on agenda.os_ordens
  for select to authenticated using (
    user_id = (select auth.uid())
    or (tecnico_id = (select auth.uid()) and (equipe_id is null or agenda.os_papel(equipe_id) is not null))
    or (equipe_id is not null and agenda.os_papel(equipe_id) = 'gestor'));
create policy "os: abrir" on agenda.os_ordens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "os: editar (dono, técnico, gestor)" on agenda.os_ordens
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (tecnico_id = (select auth.uid()) and (equipe_id is null or agenda.os_papel(equipe_id) is not null))
    or (equipe_id is not null and agenda.os_papel(equipe_id) = 'gestor'))
  with check (
    user_id = (select auth.uid())
    or (tecnico_id = (select auth.uid()) and (equipe_id is null or agenda.os_papel(equipe_id) is not null))
    or (equipe_id is not null and agenda.os_papel(equipe_id) = 'gestor'));

drop policy "os_fotos: tudo do próprio" on agenda.os_fotos;
create policy "os_fotos: quem acessa a OS" on agenda.os_fotos
  for all to authenticated
  using (agenda.os_pode_acessar(os_id))
  with check (agenda.os_pode_acessar(os_id));

drop policy "os_historico: ver o próprio" on agenda.os_historico;
create policy "os_historico: quem acessa a OS" on agenda.os_historico
  for select to authenticated using (agenda.os_pode_acessar(os_id));

grant update (equipe_id, tecnico_id, categoria, checklist, assinatura_caminho, assinatura_nome)
  on agenda.os_ordens to authenticated;

revoke all on function agenda.os_criar_equipe(text, text) from public, anon, authenticated;
grant execute on function agenda.os_criar_equipe(text, text) to service_role;
revoke all on function agenda.os_definir_membro(uuid, text, text) from public, anon;
revoke all on function agenda.os_remover_membro(uuid, uuid)       from public, anon;
revoke all on function agenda.os_minhas_equipes()                  from public, anon;
revoke all on function agenda.os_papel(uuid)                       from public, anon;
revoke all on function agenda.os_nome(uuid)                        from public, anon, authenticated;
revoke all on function agenda.os_pode_acessar(uuid)                from public, anon;
grant execute on function agenda.os_definir_membro(uuid, text, text),
                          agenda.os_remover_membro(uuid, uuid),
                          agenda.os_minhas_equipes(),
                          agenda.os_papel(uuid),
                          agenda.os_pode_acessar(uuid) to authenticated, service_role;
grant execute on function agenda.os_nome(uuid) to service_role;

-- ---------------------------------------------------------------
-- Storage: a pasta é a da OS (<dono>/<os_id>/…); acessa quem acessa a OS
-- ---------------------------------------------------------------
drop policy "agenda_os_fotos: ler as próprias" on storage.objects;
drop policy "agenda_os_fotos: enviar nas próprias OS" on storage.objects;
drop policy "agenda_os_fotos: apagar as próprias" on storage.objects;

create function agenda.os_caminho_liberado(p_nome text, p_escrita boolean) returns boolean
language sql stable security definer set search_path = agenda, pg_catalog as $$
  select exists (
    select 1 from agenda.os_ordens o
    where o.id::text = (storage.foldername(p_nome))[2]
      and o.user_id::text = (storage.foldername(p_nome))[1]
      and agenda.os_pode_acessar(o.id)
      and (not p_escrita or o.status not in ('concluida', 'cancelada'))
  )
$$;
revoke all on function agenda.os_caminho_liberado(text, boolean) from public, anon;
grant execute on function agenda.os_caminho_liberado(text, boolean) to authenticated, service_role;

create policy "agenda_os_fotos: ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'agenda-os-fotos' and agenda.os_caminho_liberado(name, false));

create policy "agenda_os_fotos: enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agenda-os-fotos'
    and (storage.foldername(name))[3] in ('antes', 'durante', 'depois', 'assinatura')
    and agenda.os_caminho_liberado(name, true));

create policy "agenda_os_fotos: apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'agenda-os-fotos' and agenda.os_caminho_liberado(name, true));
