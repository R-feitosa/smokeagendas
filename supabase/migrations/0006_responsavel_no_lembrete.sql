-- Agenda por Voz — 0006: nome do responsável na notificação
--
-- reivindicar_lembretes passa a devolver eventos.responsavel (0005), para o push
-- mostrar "Toyota: Visita ao cliente". Mesma lógica da 0003; só ganha a coluna.
-- O tipo de retorno muda → drop + create (numa transação: o cron não vê o intervalo).

drop function agenda.reivindicar_lembretes(integer);

create function agenda.reivindicar_lembretes(lote integer default 200)
returns table (id uuid, user_id uuid, titulo text, descricao text, inicio timestamptz, fuso text, envio integer,
               responsavel text)
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
    returning e.id, e.user_id, e.titulo, e.descricao, e.inicio, e.lembretes_enviados, e.responsavel
  )
  select m.id, m.user_id, m.titulo, m.descricao, m.inicio, p.fuso, m.lembretes_enviados as envio, m.responsavel
  from marcados m
  join agenda.perfis p on p.id = m.user_id
  order by m.inicio;
$$;

revoke all on function agenda.reivindicar_lembretes(integer) from public, anon, authenticated;
grant execute on function agenda.reivindicar_lembretes(integer) to service_role;
