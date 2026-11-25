-- Testes da projeção de repetições (0004). Rode com: npm run test:db
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

create temp table _t as
select ((date_trunc('day', now() at time zone 'America/Fortaleza') + interval '1 day 9 hours')
        at time zone 'America/Fortaleza') as amanha9;
grant select on _t to authenticated;
create temp table _p (dono text, titulo text, n integer, inicio timestamptz, fim timestamptz);
grant all on _p to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
insert into eventos (titulo, inicio, fim, recorrencia) select 'diária', amanha9, amanha9 + interval '30 minutes', 'diaria' from _t;
insert into eventos (titulo, inicio, recorrencia) values ('mensal 31', '2027-01-31 09:00 America/Fortaleza', 'mensal');
insert into eventos (titulo, inicio, recorrencia) select 'encerrada', amanha9, 'semanal' from _t;
select encerrar_serie((select id from eventos where titulo = 'encerrada' and ocorrencia_n = 0)) \g /dev/null
insert into _p select 'ana', titulo, ocorrencia_n, inicio, fim from projetar_ocorrencias(now(), now() + interval '40 days');

-- diária: gravadas + projetadas cobrem cada dia da janela exatamente uma vez
insert into _resultado select 'diária: projeção começa logo depois da última gravada (sem buraco nem repetição)',
  (select min(n) from _p where titulo = 'diária') = (select max(ocorrencia_n) + 1 from eventos where titulo = 'diária');
insert into _resultado select 'diária: gravadas + projetadas = um por dia, sempre 09:00 local',
  (with tudo as (select inicio from eventos where titulo = 'diária' and inicio >= now()
                 union all select inicio from _p where titulo = 'diária')
   select count(*) = count(distinct (inicio at time zone 'America/Fortaleza')::date)
      and bool_and(to_char(inicio at time zone 'America/Fortaleza', 'HH24:MI') = '09:00')
      and count(*) between 39 and 41
   from tudo);
insert into _resultado select 'diária: duração preservada na projeção',
  (select bool_and(fim - inicio = interval '30 minutes') from _p where titulo = 'diária');
insert into _resultado select 'série encerrada não projeta',
  (select count(*) = 0 from _p where titulo = 'encerrada');

-- mensal sem deriva, e o que já foi gravado sai da projeção
delete from _p;
insert into _p select 'ana', titulo, ocorrencia_n, inicio, fim
  from projetar_ocorrencias('2027-02-01 America/Fortaleza', '2027-04-01 America/Fortaleza') where titulo = 'mensal 31';
insert into _resultado select 'mensal: projeta 28/02 e 31/03 às 09:00 (sem deriva)',
  (select array_agg(to_char(inicio at time zone 'America/Fortaleza', 'DD/MM HH24:MI') order by n) from _p)
  = array['28/02 09:00', '31/03 09:00'];
reset role;
select gerar_proxima((select id from eventos where titulo = 'mensal 31' and ocorrencia_n = 0)) \g /dev/null
set role authenticated;
insert into _resultado select 'mensal: depois de gravar 28/02, a projeção só traz 31/03 (sem duplicar)',
  (select array_agg(ocorrencia_n) from projetar_ocorrencias('2027-02-01 America/Fortaleza', '2027-04-01 America/Fortaleza')
    where titulo = 'mensal 31') = array[2];
insert into _resultado select 'ocorrência gravada e cancelada não reaparece na projeção',
  (select count(*) = 0 from projetar_ocorrencias('2027-02-01 America/Fortaleza', '2027-04-01 America/Fortaleza') p
    join eventos e on e.serie_id = p.serie_id and e.ocorrencia_n = p.ocorrencia_n);
insert into _resultado select 'janela maior que 62 dias não projeta',
  (select count(*) = 0 from projetar_ocorrencias(now(), now() + interval '90 days'));

-- Bia (Nova York): semanal atravessando o início do horário de verão (14/03/2027) mantém 09:00 local
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
insert into eventos (titulo, inicio, recorrencia) values ('semanal NY', '2027-03-07 09:00 America/New_York', 'semanal');
insert into _resultado select 'fuso da pessoa: 09:00 em NY antes e depois do horário de verão',
  (select array_agg(to_char(inicio at time zone 'America/New_York', 'DD/MM HH24:MI') order by inicio)
     from projetar_ocorrencias('2027-03-08 America/New_York', '2027-03-22 America/New_York'))
  = array['14/03 09:00', '21/03 09:00'];
insert into _resultado select 'isolamento: Bia não vê as séries da Ana',
  (select count(*) = 0 from projetar_ocorrencias(now(), now() + interval '40 days') where titulo <> 'semanal NY');
reset role;

set role anon;
do $$ begin
  perform agenda.projetar_ocorrencias(now(), now() + interval '1 day');
  insert into _resultado values ('anon não chama projetar_ocorrencias', false);
exception when insufficient_privilege then
  insert into _resultado values ('anon não chama projetar_ocorrencias', true);
end $$;
reset role;

\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then raise exception 'há testes falhando'; end if;
end $$;
