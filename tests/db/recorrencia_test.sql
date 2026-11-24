-- Testes de recorrência (0003). Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;
create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;
set search_path = agenda, public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com');
select habilitar_usuario('ana@ex.com', 'Ana') \g /dev/null
select habilitar_usuario('bia@ex.com', 'Bia', 'America/New_York') \g /dev/null

-- amanhã 09:00 em Fortaleza
create temp table _t as
select ((date_trunc('day', now() at time zone 'America/Fortaleza') + interval '1 day 9 hours')
        at time zone 'America/Fortaleza') as amanha9;
grant select on _t to authenticated;

-- ---------- criação pelo app (usuário logado) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
insert into eventos (titulo, inicio, recorrencia) select 'diária', amanha9, 'diaria' from _t;
insert into eventos (titulo, inicio, fim, recorrencia) select 'semanal', amanha9, amanha9 + interval '1 hour', 'semanal' from _t;
insert into eventos (titulo, inicio) select 'avulso', amanha9 from _t;
insert into eventos (titulo, inicio, recorrencia) values ('mensal 31', '2027-01-31 09:00 America/Fortaleza', 'mensal');
insert into eventos (titulo, inicio, recorrencia)
  values ('atrasada', ((date_trunc('day', now() at time zone 'America/Fortaleza') - interval '3 days' + interval '9 hours') at time zone 'America/Fortaleza'), 'diaria');
reset role;

insert into _resultado select 'diária: preenche ~7 dias à frente',
  (select count(*) between 7 and 9 and max(inicio) > now() + interval '7 days' from eventos where titulo = 'diária');
insert into _resultado select 'diária: sempre 09:00 local, dias consecutivos, n = 0..k',
  (select bool_and(to_char(inicio at time zone 'America/Fortaleza', 'HH24:MI') = '09:00')
      and count(distinct (inicio at time zone 'America/Fortaleza')::date) = count(*)
      and max(ocorrencia_n) = count(*) - 1
   from eventos where titulo = 'diária');
insert into _resultado select 'diária: só a última fica sem proxima_gerada_em',
  (select count(*) = 1 from eventos where titulo = 'diária' and proxima_gerada_em is null);
insert into _resultado select 'semanal: 2 ocorrências, 7 dias de distância',
  (select count(*) = 2 and max(inicio) - min(inicio) = interval '7 days' from eventos where titulo = 'semanal');
insert into _resultado select 'semanal: duração (fim - início) preservada',
  (select bool_and(fim - inicio = interval '1 hour') from eventos where titulo = 'semanal');
insert into _resultado select 'avulso: sem campos de série',
  (select serie_id is null and ocorrencia_n is null from eventos where titulo = 'avulso');
insert into _resultado select 'mensal além do horizonte: só a 1ª existe',
  (select count(*) = 1 from eventos where titulo = 'mensal 31');
insert into _resultado select 'série atrasada: não cria ocorrências no passado',
  (select count(*) filter (where inicio < now()) = 1 and max(inicio) > now() from eventos where titulo = 'atrasada');

-- ---------- mensal sem deriva: 31/01 → 28/02 → 31/03 ----------
select gerar_proxima((select id from eventos where titulo = 'mensal 31' and ocorrencia_n = 0)) \g /dev/null
select gerar_proxima((select id from eventos where titulo = 'mensal 31' and ocorrencia_n = 1)) \g /dev/null
insert into _resultado select 'mensal: 31/01 → 28/02 → 31/03 (sem deriva)',
  (select array_agg(to_char(inicio at time zone 'America/Fortaleza', 'DD/MM HH24:MI') order by ocorrencia_n)
   from eventos where titulo = 'mensal 31') = array['31/01 09:00', '28/02 09:00', '31/03 09:00'];

insert into _resultado select 'gerar_proxima é idempotente',
  (select gerar_proxima((select id from eventos where titulo = 'mensal 31' and ocorrencia_n = 0)) is null)
  and (select count(*) = 3 from eventos where titulo = 'mensal 31');

-- ---------- horário de verão (Nova York muda em 14/03/2027) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
insert into eventos (titulo, inicio, recorrencia) values ('dst', '2027-03-13 09:00 America/New_York', 'diaria');
reset role;
select gerar_proxima((select id from eventos where titulo = 'dst' and ocorrencia_n = 0)) \g /dev/null
insert into _resultado select 'horário de verão: continua 09:00 local (UTC muda de 14h para 13h)',
  (select array_agg(to_char(inicio at time zone 'America/New_York', 'DD/MM HH24:MI') || ' ' || to_char(inicio at time zone 'UTC', 'HH24') order by ocorrencia_n)
   from eventos where titulo = 'dst') = array['13/03 09:00 14', '14/03 09:00 13'];

-- ---------- varredura do cron ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
insert into eventos (titulo, inicio, recorrencia) select 'longe', amanha9 + interval '20 days', 'diaria' from _t;
reset role;
insert into _resultado select 'fora do horizonte: nada gerado na criação',
  (select count(*) = 1 from eventos where titulo = 'longe');
-- simula o tempo andando 20 dias: a série inteira (âncora e ocorrência) fica a 1 dia
update eventos set inicio = (select amanha9 from _t), serie_ancora = (select amanha9 from _t) where titulo = 'longe';
create temp table _varredura as select gerar_ocorrencias() as criadas;   -- instrução própria (snapshot)
insert into _resultado select 'gerar_ocorrencias completa o horizonte e conta o que criou',
  (select criadas from _varredura) = (select count(*) - 1 from eventos where titulo = 'longe')
  and (select count(*) between 7 and 9 from eventos where titulo = 'longe');
insert into _resultado select 'gerar_ocorrencias sem nada a fazer devolve 0', (select gerar_ocorrencias() = 0);

-- ---------- cancelar uma, mudar passo, encerrar ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
update eventos set status = 'cancelado' where titulo = 'diária' and ocorrencia_n = 2;
insert into _resultado select 'cancelar uma ocorrência não encerra a série',
  (select count(*) filter (where status = 'pendente') = count(*) - 1 and bool_and(recorrencia = 'diaria')
   from eventos where titulo = 'diária');

update eventos set recorrencia = 'semanal' where titulo = 'longe' and ocorrencia_n = 2;   -- 'longe' é diária
insert into _resultado select 'trocar o passo inicia série nova a partir da ocorrência',
  (select count(distinct serie_id) = 2 from eventos where titulo = 'longe')
  and (select ocorrencia_n = 0 and recorrencia = 'semanal' from eventos where titulo = 'longe' and serie_ancora = inicio and recorrencia is not null and inicio = (select amanha9 + interval '2 days' from _t));
insert into _resultado select 'trocar o passo cancela as posteriores da série antiga (sem série paralela)',
  (select bool_and(status = 'cancelado' and recorrencia is null) from eventos
    where titulo = 'longe' and inicio > (select amanha9 + interval '2 days' from _t)
      and serie_id <> (select serie_id from eventos where titulo = 'longe' and inicio = (select amanha9 + interval '2 days' from _t))
  );

create temp table _enc as
select encerrar_serie((select id from eventos where titulo = 'diária' and ocorrencia_n = 0)) as qtd;
insert into _resultado select 'encerrar_serie cancela as futuras pendentes e tira a recorrência',
  (select qtd from _enc) = (select count(*) from eventos where titulo = 'diária' and ocorrencia_n > 0 and status = 'cancelado') - 1
  and (select bool_and(recorrencia is null) from eventos where titulo = 'diária')
  and (select status = 'pendente' from eventos where titulo = 'diária' and ocorrencia_n = 0);

do $$ begin
  perform agenda.encerrar_serie((select id from agenda.eventos where titulo = 'dst' limit 1));
  insert into _resultado values ('encerrar_serie de outra pessoa falha', false);
exception when raise_exception then
  insert into _resultado values ('encerrar_serie de outra pessoa falha', true);
end $$;

do $$ begin
  perform agenda.gerar_ocorrencias();
  insert into _resultado values ('authenticated não chama gerar_ocorrencias', false);
exception when insufficient_privilege then
  insert into _resultado values ('authenticated não chama gerar_ocorrencias', true);
end $$;
do $$ begin
  perform agenda.gerar_proxima(gen_random_uuid());
  insert into _resultado values ('authenticated não chama gerar_proxima', false);
exception when insufficient_privilege then
  insert into _resultado values ('authenticated não chama gerar_proxima', true);
end $$;
reset role;

insert into _resultado select 'série encerrada não volta a gerar',
  (select gerar_ocorrencias() = 0) and (select count(*) filter (where status = 'pendente') = 1 from eventos where titulo = 'diária');

\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then raise exception 'há testes falhando'; end if;
end $$;
