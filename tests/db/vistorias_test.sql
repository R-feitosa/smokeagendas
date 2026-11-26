-- Testes da vistoria de saída (0010). Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;
create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;
set search_path = agenda, public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com'),
  ('00000000-0000-0000-0000-00000000000c', 'ops@ex.com');  -- login do rf-ops, sem agenda
select habilitar_usuario('ana@ex.com', 'Ana') \g /dev/null

create temp table _u as
select
  (select u.id from unidades u join predios p on p.id = u.predio_id where p.nome = 'Feitosa 2' and u.numero = '101') as f2_101,
  (select u.id from unidades u join predios p on p.id = u.predio_id where p.nome = 'Feitosa 2' and u.numero = '304') as f2_304,
  (select u.id from unidades u join predios p on p.id = u.predio_id where p.nome = 'Casa da Serra') as casa;
grant select on _u to authenticated;

insert into _resultado select 'nenhuma vistoria criada pela migration (nem para as 8 já vagas)', (select count(*) = 0 from vistorias);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null

-- vagar abre a vistoria
update unidades set status = 'vago' where id = (select f2_101 from _u);
insert into _resultado select 'unidade de locação vagou → vistoria aberta',
  (select count(*) = 1 and bool_and(status = 'em_andamento' and tipo = 'saida' and modelo = 'saida_v1'
          and cidade = 'Sobral - CE' and locador = 'Feitosa Administradora de Imóveis Ltda.')
     from vistorias where unidade_id = (select f2_101 from _u));

-- desfazer com a vistoria em branco: some
update unidades set status = 'ocupado' where id = (select f2_101 from _u);
insert into _resultado select 'voltou a ocupar com vistoria em branco → apagada', (select count(*) = 0 from vistorias where unidade_id = (select f2_101 from _u));

-- vagar de novo, preencher algo e voltar: fica
update unidades set status = 'vago' where id = (select f2_101 from _u);
update vistorias set respostas = '{"quarto.pintura_paredes": {"avaliacao": "ruim", "obs": "manchas"}}' where unidade_id = (select f2_101 from _u);
insert into _resultado select 'preencher grava e marca atualizada_em',
  (select respostas -> 'quarto.pintura_paredes' ->> 'avaliacao' = 'ruim' and atualizada_em is not null from vistorias where unidade_id = (select f2_101 from _u));
update unidades set status = 'ocupado' where id = (select f2_101 from _u);
update unidades set status = 'vago' where id = (select f2_101 from _u);
insert into _resultado select 'vistoria já preenchida não se perde, e não duplica ao vagar de novo',
  (select count(*) = 1 from vistorias where unidade_id = (select f2_101 from _u));

-- casa de temporada não gera vistoria
update unidades set status = 'ocupado' where id = (select casa from _u);
update unidades set status = 'vago' where id = (select casa from _u);
insert into _resultado select 'casa de temporada não gera vistoria', (select count(*) = 0 from vistorias where unidade_id = (select casa from _u));

-- iniciar à mão: só em unidade vaga de locação
insert into vistorias (unidade_id) select f2_304 from _u;   -- 304 está vaga desde a carga
insert into _resultado select 'iniciar à mão em unidade vaga (304)', (select count(*) = 1 from vistorias where unidade_id = (select f2_304 from _u));
do $$ begin
  insert into agenda.vistorias (unidade_id) select id from agenda.unidades u
   where u.status = 'ocupado' and u.predio_id = (select id from agenda.predios where nome = 'Feitosa 1') limit 1;
  insert into _resultado values ('não inicia vistoria em unidade ocupada', false);
exception when insufficient_privilege then
  insert into _resultado values ('não inicia vistoria em unidade ocupada', true);
end $$;
do $$ begin
  insert into agenda.vistorias (unidade_id) select f2_304 from _u;
  insert into _resultado values ('não abre segunda vistoria na mesma unidade', false);
exception when unique_violation then
  insert into _resultado values ('não abre segunda vistoria na mesma unidade', true);
end $$;
do $$ begin
  insert into agenda.vistorias (unidade_id, status) values ((select f2_304 from _u), 'concluida');
  insert into _resultado values ('não cria vistoria já concluída', false);
exception when insufficient_privilege then
  insert into _resultado values ('não cria vistoria já concluída', true);
end $$;

-- concluir carimba e trava
update vistorias set status = 'concluida', pendencias = 'Realizar pintura das paredes.' where unidade_id = (select f2_101 from _u);
insert into _resultado select 'concluir carimba quem/quando',
  (select concluida_em is not null and concluida_por = auth.uid() and vistoriador_nome = 'Ana' from vistorias where unidade_id = (select f2_101 from _u));
do $$ begin
  update agenda.vistorias set pendencias = 'mudei' where unidade_id = (select f2_101 from _u);
  insert into _resultado values ('vistoria concluída não muda', false);
exception when check_violation then
  insert into _resultado values ('vistoria concluída não muda', true);
end $$;
do $$ begin
  update agenda.vistorias set concluida_em = now() - interval '1 year' where unidade_id = (select f2_304 from _u);
  insert into _resultado values ('app não forja data de conclusão', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não forja data de conclusão', true);
end $$;
do $$ begin
  delete from agenda.vistorias;
  insert into _resultado values ('app não apaga vistoria', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não apaga vistoria', true);
end $$;

-- depois de concluída, vagar de novo abre outra
update unidades set status = 'ocupado' where id = (select f2_101 from _u);
update unidades set status = 'vago' where id = (select f2_101 from _u);
insert into _resultado select 'após concluir, nova saída abre nova vistoria (histórico mantido)',
  (select count(*) = 2 and count(*) filter (where status = 'concluida') = 1 from vistorias where unidade_id = (select f2_101 from _u));

-- sem perfil na agenda: nada
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
insert into _resultado select 'não habilitado não vê vistorias', (select count(*) = 0 from vistorias);
reset role;

set role anon;
do $$ begin
  perform 1 from agenda.vistorias;
  insert into _resultado values ('anon sem acesso', false);
exception when insufficient_privilege then
  insert into _resultado values ('anon sem acesso', true);
end $$;
reset role;

\i supabase/migrations/0010_vistorias.sql
insert into _resultado select 'reaplicar 0010 não duplica nem apaga', (select count(*) = 3 from vistorias);

\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then raise exception 'há testes falhando'; end if;
end $$;
