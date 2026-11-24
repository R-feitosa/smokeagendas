-- Agenda por Voz — 0003: recorrência real + reenvio do lembrete até confirmar
--
-- RECORRÊNCIA
--   Cada série guarda uma âncora (serie_ancora = início da 1ª ocorrência) e cada
--   ocorrência o seu índice (ocorrencia_n). A ocorrência k cai em
--       (âncora no fuso da pessoa) + k × passo   → convertido de volta para UTC
--   Isso evita deriva (31/01 mensal → 28/02 → 31/03, não 28/03) e mantém a hora
--   local em mudanças de horário de verão.
--   As ocorrências são materializadas até HORIZONTE (7 dias) à frente — é o que a
--   tela "Semana" mostra. O cron completa o horizonte a cada minuto.
--   Cancelar UMA ocorrência não encerra a série; para isso: agenda.encerrar_serie().
--
-- REENVIO
--   Depois do 1º aviso, se o compromisso continua 'pendente', o aviso é repetido a
--   cada perfis.reenviar_a_cada_min minutos, até perfis.max_reenvios vezes.
--   Concluir/cancelar para os reenvios; "Adiar" e remarcar zeram a contagem.

-- ---------------------------------------------------------------
-- Preferências de reenvio (por pessoa)
-- ---------------------------------------------------------------
alter table agenda.perfis
  add column reenviar_a_cada_min integer not null default 5 check (reenviar_a_cada_min between 1 and 120),
  add column max_reenvios        integer not null default 3 check (max_reenvios between 0 and 10);

grant update (reenviar_a_cada_min, max_reenvios) on agenda.perfis to authenticated;

-- ---------------------------------------------------------------
-- Colunas novas em eventos
-- ---------------------------------------------------------------
alter table agenda.eventos
  add column lembretes_enviados integer not null default 0 check (lembretes_enviados >= 0),
  add column serie_id           uuid,
  add column serie_ancora       timestamptz,
  add column ocorrencia_n       integer,
  add column proxima_gerada_em  timestamptz,
  add constraint eventos_serie_coerente check (
    (serie_id is null and serie_ancora is null and ocorrencia_n is null)
    or (serie_id is not null and serie_ancora is not null and ocorrencia_n >= 0)
  );

comment on column agenda.eventos.recorrencia is 'diaria | semanal | mensal. Ocorrências geradas até 7 dias à frente.';
comment on column agenda.eventos.lembretes_enviados is 'Avisos já enviados neste ciclo (1º + reenvios). Zera ao adiar/remarcar.';

-- uma ocorrência por índice dentro da série (trava de idempotência)
create unique index eventos_serie_ocorrencia_uq on agenda.eventos (serie_id, ocorrencia_n) where serie_id is not null;
-- séries cuja próxima ocorrência ainda não foi gerada
create index eventos_serie_a_gerar_idx on agenda.eventos (inicio) where recorrencia is not null and proxima_gerada_em is null;
-- o reenvio também olha eventos já avisados: o índice parcial antigo não serve mais
drop index agenda.eventos_pendentes_idx;
create index eventos_pendentes_idx on agenda.eventos (inicio) where status = 'pendente';

-- ---------------------------------------------------------------
-- Rearmar: remarcar horário/antecedência ou adiar zera o ciclo de avisos
-- ---------------------------------------------------------------
create or replace function agenda.rearmar_lembrete() returns trigger
language plpgsql set search_path = agenda, pg_catalog as $$
begin
  if new.inicio is distinct from old.inicio
     or new.lembrar_min_antes is distinct from old.lembrar_min_antes then
    new.lembrete_enviado_em := null;
    new.adiar_ate := null;
    new.lembretes_enviados := 0;
  elsif new.adiar_ate is not null and new.adiar_ate is distinct from old.adiar_ate then
    -- a pessoa tocou em "Adiar": novo ciclo de avisos a partir de adiar_ate
    new.lembretes_enviados := 0;
  end if;
  return new;
end $$;

drop trigger eventos_rearmar_lembrete on agenda.eventos;
create trigger eventos_rearmar_lembrete
  before update of inicio, lembrar_min_antes, adiar_ate on agenda.eventos
  for each row execute function agenda.rearmar_lembrete();

-- ---------------------------------------------------------------
-- Série: começa quando o evento ganha recorrência
-- ---------------------------------------------------------------
create function agenda.iniciar_serie() returns trigger
language plpgsql set search_path = agenda, pg_catalog as $$
begin
  if new.recorrencia is null then
    return new;
  end if;
  if new.serie_id is null then
    new.serie_id := new.id;
    new.serie_ancora := new.inicio;
    new.ocorrencia_n := 0;
  elsif tg_op = 'UPDATE' and new.recorrencia is distinct from old.recorrencia then
    -- trocou o passo (ex.: semanal → diária) ou reativou uma série encerrada:
    -- nova série a partir desta ocorrência. As posteriores da série antiga saem,
    -- senão a ponta antiga continuaria gerando em paralelo.
    update agenda.eventos
       set recorrencia = null,
           status = case when status = 'pendente' then 'cancelado' else status end
     where serie_id = old.serie_id and ocorrencia_n > old.ocorrencia_n and id <> new.id;
    new.serie_id := gen_random_uuid();
    new.serie_ancora := new.inicio;
    new.ocorrencia_n := 0;
    new.proxima_gerada_em := null;
  end if;
  return new;
end $$;

create trigger eventos_iniciar_serie
  before insert or update of recorrencia on agenda.eventos
  for each row execute function agenda.iniciar_serie();

-- ---------------------------------------------------------------
-- Gera a ocorrência seguinte de UM evento (idempotente)
-- ---------------------------------------------------------------
create function agenda.gerar_proxima(p_evento_id uuid) returns uuid
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  e        agenda.eventos;
  v_fuso   text;
  v_passo  interval;
  v_k      integer;
  v_inicio timestamptz;
  v_novo   uuid;
begin
  select * into e from agenda.eventos where id = p_evento_id for update;
  if not found or e.recorrencia is null or e.proxima_gerada_em is not null then
    return null;
  end if;

  select fuso into v_fuso from agenda.perfis where id = e.user_id;
  v_passo := case e.recorrencia
               when 'diaria'  then interval '1 day'
               when 'semanal' then interval '7 days'
               else                interval '1 month'
             end;

  -- menor índice seguinte que caia depois desta ocorrência e no futuro
  -- (se o sistema ficou parado, pula as que já passaram em vez de criá-las)
  select k, ((e.serie_ancora at time zone v_fuso) + k * v_passo) at time zone v_fuso
    into v_k, v_inicio
  from generate_series(e.ocorrencia_n + 1, e.ocorrencia_n + 20000) as k
  where ((e.serie_ancora at time zone v_fuso) + k * v_passo) at time zone v_fuso > greatest(now(), e.inicio)
  order by k
  limit 1;

  update agenda.eventos set proxima_gerada_em = now() where id = e.id;
  if v_inicio is null then
    return null;
  end if;

  insert into agenda.eventos (user_id, titulo, descricao, inicio, fim, lembrar_min_antes,
                              recorrencia, serie_id, serie_ancora, ocorrencia_n)
  values (e.user_id, e.titulo, e.descricao, v_inicio, v_inicio + (e.fim - e.inicio), e.lembrar_min_antes,
          e.recorrencia, e.serie_id, e.serie_ancora, v_k)
  on conflict (serie_id, ocorrencia_n) where serie_id is not null do nothing
  returning id into v_novo;

  return v_novo;
end $$;

-- Ao criar (ou dar recorrência a) um evento, já preenche o horizonte de 7 dias.
-- O insert da ocorrência nova dispara este mesmo trigger, encadeando até o horizonte.
create function agenda.preencher_horizonte() returns trigger
language plpgsql security definer set search_path = agenda, pg_catalog as $$
begin
  if new.recorrencia is not null and new.proxima_gerada_em is null
     and new.inicio <= now() + interval '7 days' then
    perform agenda.gerar_proxima(new.id);
  end if;
  return null;
end $$;

create trigger eventos_preencher_horizonte
  after insert or update of recorrencia on agenda.eventos
  for each row execute function agenda.preencher_horizonte();

-- Varredura do cron: completa o horizonte de todas as séries (o tempo andou).
-- Devolve quantas ocorrências foram criadas (incluindo as encadeadas pelo trigger).
create function agenda.gerar_ocorrencias(horizonte interval default interval '7 days')
returns integer
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  v_antes integer;
  v_rodada integer;
  v_id uuid;
begin
  select count(*) into v_antes from agenda.eventos where serie_id is not null;
  for i in 1..50 loop   -- cada rodada avança cada série uma ocorrência
    v_rodada := 0;
    for v_id in
      select id from agenda.eventos
      where recorrencia is not null and proxima_gerada_em is null
        and inicio <= now() + horizonte
      order by inicio
      limit 1000
    loop
      if agenda.gerar_proxima(v_id) is not null then
        v_rodada := v_rodada + 1;
      end if;
    end loop;
    exit when v_rodada = 0;
  end loop;
  return (select count(*) from agenda.eventos where serie_id is not null) - v_antes;
end $$;

-- Encerra a série DEPOIS desta ocorrência: tira a recorrência de todas e cancela
-- as futuras ainda pendentes. Roda com as permissões de quem chama (RLS vale).
create function agenda.encerrar_serie(p_evento_id uuid) returns integer
language plpgsql security invoker set search_path = agenda, pg_catalog as $$
declare
  v_serie uuid;
  v_n     integer;
  v_qtd   integer;
begin
  select serie_id, ocorrencia_n into v_serie, v_n from agenda.eventos where id = p_evento_id;
  if v_serie is null then
    raise exception 'Compromisso não encontrado ou não é recorrente';
  end if;
  update agenda.eventos set recorrencia = null where serie_id = v_serie and recorrencia is not null;
  update agenda.eventos set status = 'cancelado'
   where serie_id = v_serie and ocorrencia_n > v_n and status = 'pendente';
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- ---------------------------------------------------------------
-- Reivindicação de lembretes: 1º aviso + reenvios
-- (o tipo de retorno mudou — ganhou "envio" —, então é drop + create)
-- ---------------------------------------------------------------
drop function agenda.reivindicar_lembretes(integer);

create function agenda.reivindicar_lembretes(lote integer default 200)
returns table (id uuid, user_id uuid, titulo text, descricao text, inicio timestamptz, fuso text, envio integer)
language sql security definer set search_path = agenda, pg_catalog as $$
  with alvo as (
    select e.id
    from agenda.eventos e
    join agenda.perfis p on p.id = e.user_id
    where e.status = 'pendente'
      and e.inicio > now() - interval '2 hours'      -- não dispara coisa muito antiga
      and (
        -- 1º aviso (ou aviso após "Adiar")
        (e.lembrete_enviado_em is null
         and coalesce(e.adiar_ate, e.inicio - make_interval(mins => e.lembrar_min_antes)) <= now())
        or
        -- reenvio: ainda pendente, intervalo cumprido e dentro do limite
        (e.lembrete_enviado_em is not null
         and e.lembretes_enviados <= p.max_reenvios
         and e.lembrete_enviado_em <= now() - make_interval(mins => p.reenviar_a_cada_min))
      )
    order by e.inicio
    limit lote
    for update of e skip locked
  ),
  marcados as (
    update agenda.eventos e
       set lembrete_enviado_em = now(),
           adiar_ate = null,
           lembretes_enviados = e.lembretes_enviados + 1
      from alvo
     where e.id = alvo.id
    returning e.id, e.user_id, e.titulo, e.descricao, e.inicio, e.lembretes_enviados
  )
  select m.id, m.user_id, m.titulo, m.descricao, m.inicio, p.fuso, m.lembretes_enviados as envio
  from marcados m
  join agenda.perfis p on p.id = m.user_id
  order by m.inicio;
$$;

-- Falha transitória no push: desfaz a última reivindicação
create or replace function agenda.liberar_lembrete(evento_id uuid) returns void
language sql security definer set search_path = agenda, pg_catalog as $$
  update agenda.eventos
     set lembrete_enviado_em = null,
         lembretes_enviados = greatest(lembretes_enviados - 1, 0)
   where id = evento_id and status = 'pendente';
$$;

-- ---------------------------------------------------------------
-- Cron: antes de chamar o envio, completa as séries
-- ---------------------------------------------------------------
create or replace function agenda.disparar_send_reminders() returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_url    text;
  v_secret text;
begin
  -- falha na geração não pode impedir o envio dos lembretes
  begin
    perform agenda.gerar_ocorrencias();
  exception when others then
    raise warning 'agenda.gerar_ocorrencias falhou: %', sqlerrm;
  end;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'agenda_project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'agenda_cron_secret';
  if v_url is null or v_secret is null then
    raise log 'agenda-send-reminders: configure agenda_project_url no Vault';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/agenda-send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

-- ---------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------
revoke all on function agenda.gerar_proxima(uuid)             from public, anon, authenticated;
revoke all on function agenda.gerar_ocorrencias(interval)     from public, anon, authenticated;
revoke all on function agenda.preencher_horizonte()           from public, anon, authenticated;
revoke all on function agenda.iniciar_serie()                 from public, anon, authenticated;
revoke all on function agenda.reivindicar_lembretes(integer)  from public, anon, authenticated;
revoke all on function agenda.disparar_send_reminders()       from public, anon, authenticated;
revoke all on function agenda.encerrar_serie(uuid)            from public, anon;
grant execute on function agenda.encerrar_serie(uuid)            to authenticated;
grant execute on function agenda.reivindicar_lembretes(integer) to service_role;
grant execute on function agenda.gerar_ocorrencias(interval)    to service_role;
