-- Agenda por Voz — 0004: Ordens de Serviço (OS) com fotos de ANTES / DURANTE / DEPOIS
--
-- O que entra:
--   agenda.os_ordens     a OS em si (número OS-AAAA-NNNNN, cliente, equipamento, status…)
--   agenda.os_fotos      metadados das fotos; o arquivo fica no Storage (bucket privado)
--   agenda.os_historico  trilha de auditoria (abertura, mudança de status, foto incluída/removida)
--   bucket agenda-os-fotos  caminho: <user_id>/<os_id>/<momento>/<arquivo>
--
-- Regras de negócio garantidas NO BANCO (não dependem do app):
--   1. Número sequencial por ano, único, gerado no servidor (não dá para forjar).
--   2. Só conclui com ao menos 1 foto de ANTES e 1 de DEPOIS e com o serviço executado descrito.
--   3. OS concluída ou cancelada fica travada: não aceita foto nova nem remoção (prova preservada).
--      Para corrigir, reabra (status volta para em_andamento) — e isso fica no histórico.
--   4. Datas de início/conclusão/cancelamento são carimbadas pelo servidor.
--   5. Histórico só é escrito por trigger; o usuário apenas lê.
--
-- Mesmo isolamento do resto da agenda: schema `agenda`, RLS por user_id, nada em `public`.

-- ---------------------------------------------------------------
-- Contador de numeração por ano (OS-2026-00001, OS-2026-00002…)
-- ---------------------------------------------------------------
create table agenda.os_contador (
  ano     integer primary key,
  ultimo  integer not null default 0
);

create function agenda.os_proximo_numero(p_ano integer) returns integer
language sql security definer set search_path = agenda, pg_catalog as $$
  insert into agenda.os_contador as c (ano, ultimo) values (p_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
  returning ultimo;
$$;

-- ---------------------------------------------------------------
-- Ordens de serviço
-- ---------------------------------------------------------------
create table agenda.os_ordens (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references agenda.perfis (id) on delete cascade,
  numero             text not null unique,      -- preenchido pelo trigger
  ano                integer not null,
  sequencial         integer not null,

  cliente            text not null default 'PHILCO' check (char_length(btrim(cliente)) between 1 and 120),
  unidade            text check (char_length(unidade) <= 200),          -- loja/filial/endereço
  solicitante        text check (char_length(solicitante) <= 120),
  contato            text check (char_length(contato) <= 120),          -- telefone/e-mail do solicitante
  tecnico            text check (char_length(tecnico) <= 120),

  tipo               text not null default 'corretiva'
                     check (tipo in ('corretiva', 'preventiva', 'instalacao', 'garantia', 'vistoria', 'outro')),
  prioridade         text not null default 'media'
                     check (prioridade in ('baixa', 'media', 'alta', 'urgente')),

  equipamento        text check (char_length(equipamento) <= 160),      -- ex.: TV 50", Ar-condicionado 12k
  marca              text check (char_length(marca) <= 80),
  modelo             text check (char_length(modelo) <= 80),
  numero_serie       text check (char_length(numero_serie) <= 80),
  patrimonio         text check (char_length(patrimonio) <= 80),

  problema           text not null check (char_length(btrim(problema)) between 1 and 4000),
  diagnostico        text check (char_length(diagnostico) <= 4000),
  servico_executado  text check (char_length(servico_executado) <= 4000),
  pecas              text check (char_length(pecas) <= 2000),
  observacoes        text check (char_length(observacoes) <= 4000),
  valor              numeric(12, 2) check (valor >= 0),

  status             text not null default 'aberta'
                     check (status in ('aberta', 'em_andamento', 'aguardando_peca', 'concluida', 'cancelada')),
  prazo              timestamptz,
  aberta_em          timestamptz not null default now(),
  iniciada_em        timestamptz,
  concluida_em       timestamptz,
  cancelada_em       timestamptz,
  motivo_cancelamento text check (char_length(motivo_cancelamento) <= 1000),
  atualizada_em      timestamptz not null default now(),

  constraint os_concluida_tem_servico check (
    status <> 'concluida' or char_length(btrim(coalesce(servico_executado, ''))) > 0
  ),
  constraint os_cancelada_tem_motivo check (
    status <> 'cancelada' or char_length(btrim(coalesce(motivo_cancelamento, ''))) > 0
  )
);

comment on table agenda.os_ordens is 'Ordens de serviço. Concluir exige foto de ANTES e de DEPOIS (trigger os_validar).';

create index os_ordens_user_status_idx on agenda.os_ordens (user_id, status, aberta_em desc);

-- ---------------------------------------------------------------
-- Fotos (o arquivo vive no Storage; aqui só os metadados)
-- ---------------------------------------------------------------
create table agenda.os_fotos (
  id             uuid primary key default gen_random_uuid(),
  os_id          uuid not null references agenda.os_ordens (id) on delete cascade,
  user_id        uuid not null default auth.uid() references agenda.perfis (id) on delete cascade,
  momento        text not null check (momento in ('antes', 'durante', 'depois')),
  caminho        text not null unique,          -- <user_id>/<os_id>/<momento>/<arquivo>
  legenda        text check (char_length(legenda) <= 300),
  tamanho_bytes  integer check (tamanho_bytes between 1 and 10485760),
  largura        integer,
  altura         integer,
  criado_em      timestamptz not null default now(),
  constraint os_fotos_caminho_coerente check (
    caminho like user_id::text || '/' || os_id::text || '/' || momento || '/%'
  )
);

create index os_fotos_os_idx on agenda.os_fotos (os_id, momento, criado_em);

-- ---------------------------------------------------------------
-- Histórico (auditoria) — escrito só por triggers
-- ---------------------------------------------------------------
create table agenda.os_historico (
  id         bigint generated always as identity primary key,
  os_id      uuid not null references agenda.os_ordens (id) on delete cascade,
  user_id    uuid not null references agenda.perfis (id) on delete cascade,
  autor_id   uuid,                                   -- quem fez (auth.uid() no momento)
  quando     timestamptz not null default now(),
  acao       text not null,                          -- abertura | status | foto_incluida | foto_removida | edicao
  de         text,
  para       text,
  detalhe    text
);

create index os_historico_os_idx on agenda.os_historico (os_id, quando);

-- ---------------------------------------------------------------
-- Triggers da OS
-- ---------------------------------------------------------------

-- Antes de inserir: numeração e carimbos (o cliente não escolhe número nem datas)
create function agenda.os_antes_inserir() returns trigger
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
  if new.status in ('concluida', 'cancelada') then
    raise exception 'Uma OS nova não pode nascer % — abra e depois conclua', new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger os_ordens_antes_inserir
  before insert on agenda.os_ordens
  for each row execute function agenda.os_antes_inserir();

-- Antes de atualizar: imutáveis, transições, trava de concluída/cancelada e regra das fotos
create function agenda.os_validar() returns trigger
language plpgsql set search_path = agenda, pg_catalog as $$
declare
  n_antes  integer;
  n_depois integer;
begin
  -- identidade e numeração não mudam
  if new.numero is distinct from old.numero or new.ano is distinct from old.ano
     or new.sequencial is distinct from old.sequencial or new.user_id is distinct from old.user_id
     or new.aberta_em is distinct from old.aberta_em then
    raise exception 'Número, dono e data de abertura da OS não podem ser alterados'
      using errcode = 'check_violation';
  end if;

  -- cancelada é definitiva
  if old.status = 'cancelada' then
    raise exception 'OS % está cancelada e não pode ser alterada', old.numero using errcode = 'check_violation';
  end if;

  -- concluída: só sai daqui reabrindo (status -> em_andamento); campos ficam travados
  if old.status = 'concluida' and new.status = 'concluida' then
    raise exception 'OS % está concluída. Reabra para editar', old.numero using errcode = 'check_violation';
  end if;
  if old.status = 'concluida' and new.status not in ('em_andamento') then
    raise exception 'OS concluída só pode ser reaberta (em andamento)' using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'em_andamento' then
        new.iniciada_em  := coalesce(old.iniciada_em, now());
        new.concluida_em := null;             -- reabertura
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
    -- sem mudança de status, carimbos não podem ser mexidos pelo cliente
    new.iniciada_em  := old.iniciada_em;
    new.concluida_em := old.concluida_em;
    new.cancelada_em := old.cancelada_em;
  end if;

  new.atualizada_em := now();
  return new;
end $$;

create trigger os_ordens_validar
  before update on agenda.os_ordens
  for each row execute function agenda.os_validar();

-- Depois de inserir/atualizar: histórico
create function agenda.os_registrar_historico() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
begin
  if tg_op = 'INSERT' then
    insert into agenda.os_historico (os_id, user_id, autor_id, acao, para, detalhe)
    values (new.id, new.user_id, auth.uid(), 'abertura', new.status, new.numero);
  elsif new.status is distinct from old.status then
    insert into agenda.os_historico (os_id, user_id, autor_id, acao, de, para, detalhe)
    values (new.id, new.user_id, auth.uid(), 'status', old.status, new.status,
            case when new.status = 'cancelada' then new.motivo_cancelamento end);
  else
    insert into agenda.os_historico (os_id, user_id, autor_id, acao)
    values (new.id, new.user_id, auth.uid(), 'edicao');
  end if;
  return null;
end $$;

create trigger os_ordens_historico
  after insert or update on agenda.os_ordens
  for each row execute function agenda.os_registrar_historico();

-- Fotos: só em OS aberta/em andamento/aguardando peça; registra no histórico
create function agenda.os_fotos_controlar() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_os agenda.os_ordens;
begin
  select * into v_os from agenda.os_ordens where id = coalesce(new.os_id, old.os_id);
  -- OS apagada em cascata (perfil removido): não há o que travar nem registrar
  if not found then
    return coalesce(new, old);
  end if;

  if v_os.status in ('concluida', 'cancelada') then
    raise exception 'OS % está %: fotos não podem ser incluídas nem removidas', v_os.numero, v_os.status
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.user_id <> v_os.user_id then
      raise exception 'A foto precisa pertencer ao dono da OS' using errcode = 'check_violation';
    end if;
    insert into agenda.os_historico (os_id, user_id, autor_id, acao, para, detalhe)
    values (v_os.id, v_os.user_id, auth.uid(), 'foto_incluida', new.momento, new.legenda);
    return new;
  else
    insert into agenda.os_historico (os_id, user_id, autor_id, acao, de, detalhe)
    values (v_os.id, v_os.user_id, auth.uid(), 'foto_removida', old.momento, old.legenda);
    return old;
  end if;
end $$;

create trigger os_fotos_controlar
  before insert or delete on agenda.os_fotos
  for each row execute function agenda.os_fotos_controlar();

-- Metadados da foto são imutáveis (trocar a foto = remover e incluir de novo, fica no histórico)
create function agenda.os_fotos_imutavel() returns trigger
language plpgsql set search_path = agenda, pg_catalog as $$
begin
  if new.os_id is distinct from old.os_id or new.caminho is distinct from old.caminho
     or new.momento is distinct from old.momento or new.user_id is distinct from old.user_id
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Só a legenda da foto pode ser alterada' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger os_fotos_imutavel
  before update on agenda.os_fotos
  for each row execute function agenda.os_fotos_imutavel();

-- ---------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------
grant select, insert, update on agenda.os_ordens  to authenticated;   -- sem DELETE: cancela-se
grant select, insert, delete on agenda.os_fotos   to authenticated;
grant update (legenda)       on agenda.os_fotos   to authenticated;
grant select                 on agenda.os_historico to authenticated;
grant all on agenda.os_ordens, agenda.os_fotos, agenda.os_historico, agenda.os_contador to service_role;
-- os_contador: sem acesso direto para authenticated (só via trigger security definer)

alter table agenda.os_ordens    enable row level security;
alter table agenda.os_fotos     enable row level security;
alter table agenda.os_historico enable row level security;
alter table agenda.os_contador  enable row level security;

create policy "os: tudo do próprio" on agenda.os_ordens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "os_fotos: tudo do próprio" on agenda.os_fotos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from agenda.os_ordens o where o.id = os_id and o.user_id = (select auth.uid()))
  );

create policy "os_historico: ver o próprio" on agenda.os_historico
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on function agenda.os_proximo_numero(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Storage: bucket privado para as fotos
-- Caminho obrigatório: <auth.uid()>/<os_id>/<momento>/<arquivo>
-- Nomes de policy com prefixo "agenda_os_fotos" para não colidir com o rf-ops.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agenda-os-fotos', 'agenda-os-fotos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy "agenda_os_fotos: ler as próprias" on storage.objects
  for select to authenticated
  using (bucket_id = 'agenda-os-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "agenda_os_fotos: enviar nas próprias OS" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agenda-os-fotos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from agenda.os_ordens o
      where o.user_id = (select auth.uid())
        and o.id::text = (storage.foldername(name))[2]
        and o.status not in ('concluida', 'cancelada')
    )
    and (storage.foldername(name))[3] in ('antes', 'durante', 'depois')
  );

create policy "agenda_os_fotos: apagar as próprias" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'agenda-os-fotos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from agenda.os_ordens o
      where o.user_id = (select auth.uid())
        and o.id::text = (storage.foldername(name))[2]
        and o.status not in ('concluida', 'cancelada')
    )
  );
