-- Testes da agenda da equipe (0005). Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;
create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;
set search_path = agenda, public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'saulo@ex.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com');
select habilitar_usuario('saulo@ex.com', 'Saulo') \g /dev/null
select habilitar_usuario('bia@ex.com', 'Bia') \g /dev/null

create temp table _t as
select ((date_trunc('day', now() at time zone 'America/Fortaleza') + interval '1 day 9 hours')
        at time zone 'America/Fortaleza') as amanha9;
grant select on _t to authenticated;

insert into _resultado select 'equipe começa vazia', (select equipe = '{}' from perfis where nome = 'Saulo');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
update perfis set equipe = array['Toyota', 'Aristides'] where id = auth.uid();
insert into _resultado select 'dono define a própria equipe',
  (select equipe = array['Toyota', 'Aristides'] from perfis where id = auth.uid());
insert into eventos (titulo, inicio) select 'meu', amanha9 from _t;
insert into eventos (titulo, inicio, responsavel, recorrencia) select 'do Toyota', amanha9, 'Toyota', 'diaria' from _t;
do $$ begin
  insert into agenda.eventos (titulo, inicio, responsavel) values ('vazio', now() + interval '1 day', '  ');
  insert into _resultado values ('responsável em branco recusado', false);
exception when check_violation then
  insert into _resultado values ('responsável em branco recusado', true);
end $$;
insert into _resultado select 'sem responsável = do dono', (select responsavel is null from eventos where titulo = 'meu');
insert into _resultado select 'repetições gravadas herdam o responsável',
  (select count(*) > 1 and bool_and(responsavel = 'Toyota') from eventos where titulo = 'do Toyota');
insert into _resultado select 'repetições previstas herdam o responsável',
  (select count(*) > 0 and bool_and(responsavel = 'Toyota')
     from projetar_ocorrencias(now(), now() + interval '40 days') where titulo = 'do Toyota');

-- outra pessoa não mexe na equipe do Saulo nem vê os compromissos dele
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
update perfis set equipe = array['Invasor'] where nome = 'Saulo';
insert into _resultado select 'Bia não vê compromissos da equipe do Saulo', (select count(*) = 0 from eventos);
do $$ begin
  update agenda.perfis set equipe = array[null::text] where id = auth.uid();
  insert into _resultado values ('equipe com nome nulo recusada', false);
exception when check_violation then
  insert into _resultado values ('equipe com nome nulo recusada', true);
end $$;
reset role;
insert into _resultado select 'Bia não altera a equipe do Saulo',
  (select equipe = array['Toyota', 'Aristides'] from perfis where nome = 'Saulo');

-- 0006: o lembrete vencido sai com o nome do responsável (para o título do push)
insert into eventos (user_id, titulo, inicio, lembrar_min_antes, responsavel)
  select id, 'visita vencida', now() + interval '10 minutes', 30, 'Aristides' from perfis where nome = 'Saulo';
insert into _resultado select 'lembrete reivindicado traz o responsável',
  (select responsavel = 'Aristides' from reivindicar_lembretes(50) where titulo = 'visita vencida');

\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then raise exception 'há testes falhando'; end if;
end $$;
