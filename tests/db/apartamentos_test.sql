-- Testes da aba Apartamentos (0007). Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;
create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;
set search_path = agenda, public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com'),
  ('00000000-0000-0000-0000-00000000000c', 'ops@ex.com');  -- login do rf-ops, sem agenda
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000005a0', 'saulo@ex.com');
select habilitar_usuario('ana@ex.com', 'Ana') \g /dev/null
select habilitar_usuario('bia@ex.com', 'Bia') \g /dev/null
select habilitar_usuario('saulo@ex.com', 'Saulo') \g /dev/null
-- 0009 precisa do perfil Saulo: roda aqui, não no run.sh (os outros testes contam perfis)
\i supabase/migrations/0009_casas_so_saulo.sql

-- unidade usada nos testes: Feitosa 1 · 101 (começa ocupada)
create temp table _u as
select u.id from unidades u join predios p on p.id = u.predio_id where p.nome = 'Feitosa 1' and u.numero = '101';
grant select on _u to anon, authenticated, service_role;

-- ---------- Carga inicial = planilha ----------
insert into _resultado select 'carga: 4 prédios na ordem da planilha',
  (select array_agg(nome order by ordem) from predios where categoria = 'locacao') = array['Feitosa 1', 'Feitosa 2', 'Feitosa 3', 'Connect Office'];
insert into _resultado select 'carga: 68 unidades (11 + 16 + 34 + 7)',
  (select array_agg(n order by ordem)
     from (select p.ordem, count(*) as n from unidades u join predios p on p.id = u.predio_id where p.categoria = 'locacao' group by p.ordem) x)
  = array[11, 16, 34, 7]::bigint[];
insert into _resultado select 'carga: exatamente as 8 vagas da planilha',
  (select array_agg(p.nome || ' ' || u.numero order by p.ordem, u.numero::int)
     from unidades u join predios p on p.id = u.predio_id where u.status = 'vago' and p.categoria = 'locacao')
  = array['Feitosa 2 304', 'Feitosa 3 6', 'Feitosa 3 18', 'Feitosa 3 24',
          'Connect Office 102', 'Connect Office 104', 'Connect Office 201', 'Connect Office 202'];
insert into _resultado select 'carga: as outras 60 estão ocupadas', (select count(*) = 60 from unidades where status = 'ocupado');
insert into _resultado select '0008: 5 casas de temporada, 1 unidade cada, todas vagas',
  (select array_agg(p.nome || ':' || u.numero || ':' || u.status order by p.ordem) from unidades u join predios p on p.id = u.predio_id where p.categoria = 'temporada')
  = array['Escritório Moradas:1:vago', 'Residência Roneely:1:vago', 'Casa da Serra:1:vago', 'Casa Camocim:1:vago', 'Apartamento de Fortaleza:1:vago']
  and (select bool_and(tipo_unidade = 'imovel') from predios where categoria = 'temporada');
insert into _resultado select 'carga: Feitosa 1 tem as unidades 1, 3 e 4 (sem a 2)',
  (select array_agg(u.numero order by u.numero::int) from unidades u join predios p on p.id = u.predio_id
    where p.nome = 'Feitosa 1' and u.numero::int < 100) = array['1', '3', '4'];
insert into _resultado select 'carga: Connect Office é de salas; os Feitosa, de apartamentos',
  (select tipo_unidade = 'sala' from predios where nome = 'Connect Office')
  and (select bool_and(tipo_unidade = 'apartamento') from predios where nome like 'Feitosa%');
insert into _resultado select 'carga: sem data de início inventada e histórico vazio',
  (select count(*) = 0 from unidades where status_desde is not null or atualizado_em is not null or atualizado_por is not null)
  and (select count(*) = 0 from unidades_historico);

-- ---------- Usuária habilitada: vê tudo e muda o status ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
insert into _resultado select 'habilitada vê os 4 prédios e as 68 unidades',
  (select count(*) = 9 from predios) and (select count(*) = 73 from unidades);

update unidades set status = 'vago' where id = (select id from _u);
insert into _resultado select 'liberar (ocupado → vago) carimba quando e quem',
  (select status = 'vago' and status_desde is not null and atualizado_em = status_desde
          and atualizado_por = auth.uid() and atualizado_por_nome = 'Ana'
     from unidades where id = (select id from _u));
insert into _resultado select 'a mudança vai para o histórico',
  (select count(*) = 1 and bool_and(status_anterior = 'ocupado' and status_novo = 'vago'
                                     and alterado_por = auth.uid() and alterado_por_nome = 'Ana')
     from unidades_historico where unidade_id = (select id from _u));
insert into _resultado select 'só a unidade tocada mudou (agora 9 vagas)', (select count(*) = 9 from unidades u join predios p on p.id = u.predio_id where u.status = 'vago' and p.categoria = 'locacao');

-- marcar o mesmo status de novo não é mudança: não recarimba nem gera histórico
create temp table _antes as select status_desde from unidades where id = (select id from _u);
update unidades set status = 'vago' where id = (select id from _u);
insert into _resultado select 'repetir o mesmo status não recarimba nem duplica o histórico',
  (select u.status_desde = a.status_desde from unidades u, _antes a where u.id = (select id from _u))
  and (select count(*) = 1 from unidades_historico);

do $$ begin
  update agenda.unidades set status = 'reservado' where id = (select id from _u);
  insert into _resultado values ('status fora de vago|ocupado recusado', false);
exception when check_violation then
  insert into _resultado values ('status fora de vago|ocupado recusado', true);
end $$;

-- o app só altera a coluna status: nada de renumerar, forjar o carimbo ou mexer no cadastro
do $$ begin
  update agenda.unidades set numero = '999' where id = (select id from _u);
  insert into _resultado values ('app não renumera unidade', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não renumera unidade', true);
end $$;
do $$ begin
  update agenda.unidades set atualizado_por_nome = 'Outra pessoa', status_desde = now() - interval '1 year' where id = (select id from _u);
  insert into _resultado values ('app não forja quem/quando mudou', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não forja quem/quando mudou', true);
end $$;
do $$ begin
  insert into agenda.unidades (predio_id, numero) select id, '900' from agenda.predios limit 1;
  insert into _resultado values ('app não cria unidade', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não cria unidade', true);
end $$;
do $$ begin
  delete from agenda.unidades where id = (select id from _u);
  insert into _resultado values ('app não apaga unidade', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não apaga unidade', true);
end $$;
do $$ begin
  update agenda.predios set nome = 'Outro nome' where nome = 'Feitosa 1';
  insert into _resultado values ('app não altera prédio', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não altera prédio', true);
end $$;
do $$ begin
  insert into agenda.unidades_historico (unidade_id, status_anterior, status_novo)
  values ((select id from _u), 'vago', 'ocupado');
  insert into _resultado values ('app não escreve no histórico', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não escreve no histórico', true);
end $$;
do $$ begin
  delete from agenda.unidades_historico;
  insert into _resultado values ('app não apaga o histórico', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não apaga o histórico', true);
end $$;
do $$ begin
  truncate agenda.unidades_historico;
  insert into _resultado values ('app não trunca o histórico', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não trunca o histórico', true);
end $$;

-- ---------- Dado do escritório: outra pessoa habilitada vê e também altera ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
insert into _resultado select 'Bia vê a mudança feita pela Ana',
  (select status = 'vago' and atualizado_por_nome = 'Ana' from unidades where id = (select id from _u));
update unidades set status = 'ocupado' where id = (select id from _u);
insert into _resultado select 'Bia ocupa de novo: carimbo passa a ser dela',
  (select status = 'ocupado' and atualizado_por_nome = 'Bia' and atualizado_por = auth.uid()
     from unidades where id = (select id from _u));
insert into _resultado select 'histórico guarda as duas mudanças, na ordem',
  (select array_agg(status_novo || ':' || alterado_por_nome order by id) from unidades_historico
    where unidade_id = (select id from _u)) = array['vago:Ana', 'ocupado:Bia'];

-- ---------- Login do rf-ops sem perfil na agenda: nada ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
insert into _resultado select 'não habilitado não vê prédios, unidades nem histórico',
  (select count(*) = 0 from predios) and (select count(*) = 0 from unidades) and (select count(*) = 0 from unidades_historico);
update unidades set status = 'vago';   -- RLS: não alcança nenhuma linha
reset role;
insert into _resultado select 'não habilitado não altera status (seguem as 8 vagas da planilha)',
  (select count(*) = 13 from unidades where status = 'vago') and (select count(*) = 2 from unidades_historico);

-- anon não enxerga o schema
set role anon;
do $$ begin
  perform 1 from agenda.unidades;
  insert into _resultado values ('anon sem acesso às unidades', false);
exception when insufficient_privilege then
  insert into _resultado values ('anon sem acesso às unidades', true);
end $$;
reset role;

-- ---------- Administração (SQL Editor / service_role) ----------
-- aqui o "usuário" da sessão ainda é o ops (sem perfil): a mudança entra sem autor, sem erro de FK
update unidades set status = 'vago' where id = (select id from _u);
insert into _resultado select 'mudança administrativa: registrada sem autor',
  (select status = 'vago' and status_desde is not null and atualizado_por is null and atualizado_por_nome is null
     from unidades where id = (select id from _u))
  and (select alterado_por is null and status_novo = 'vago' from unidades_historico order by id desc limit 1);
set role service_role;
insert into unidades (predio_id, numero) select id, '900' from predios where nome = 'Feitosa 1';
delete from unidades where numero = '900';
reset role;
insert into _resultado select 'service_role cadastra e remove unidade', (select count(*) = 73 from unidades);

-- desabilitar a pessoa não apaga o rastro: fica o nome
delete from perfis where nome = 'Bia';
insert into _resultado select 'desabilitar alguém mantém o histórico com o nome',
  (select count(*) = 1 and bool_and(alterado_por is null) from unidades_historico where alterado_por_nome = 'Bia');

-- ---------- Idempotência: aplicar a 0007 de novo ----------
\i supabase/migrations/0007_apartamentos.sql
\i supabase/migrations/0008_casas_temporada.sql
\i supabase/migrations/0009_casas_so_saulo.sql
\i supabase/migrations/0010_vistorias.sql
\i supabase/migrations/0011_vistoria_temporada.sql
insert into _resultado select 'reaplicar não duplica prédios nem unidades',
  (select count(*) = 9 from predios) and (select count(*) = 73 from unidades);
insert into _resultado select 'reaplicar não sobrescreve status alterado no app nem o histórico',
  (select status = 'vago' and atualizado_em is not null from unidades where id = (select id from _u))
  and (select count(*) = 3 from unidades_historico);
insert into _resultado select 'reaplicar não duplica triggers nem policies',
  (select count(*) = 3 from pg_trigger where tgrelid = 'agenda.unidades'::regclass and not tgisinternal)
  and (select count(*) = 4 from pg_policies where schemaname = 'agenda'
        and tablename in ('predios', 'unidades', 'unidades_historico'));

-- RLS ligado nas três tabelas e nada criado em public
insert into _resultado select 'RLS ligado nas três tabelas',
  (select count(*) = 3 from pg_tables where schemaname = 'agenda'
    and tablename in ('predios', 'unidades', 'unidades_historico') and rowsecurity);
insert into _resultado select 'nenhum objeto criado em public',
  (select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public')
  and (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public');

-- ---------- 0009: só o Saulo altera as casas de temporada ----------
insert into _resultado select '0009: casas marcadas como do Saulo; prédios de locação livres',
  (select bool_and(editavel_por = '00000000-0000-0000-0000-0000000005a0' and editavel_por_nome = 'Saulo') from predios where categoria = 'temporada')
  and (select bool_and(editavel_por is null) from predios where categoria = 'locacao');
create temp table _casa as select u.id from unidades u join predios p on p.id = u.predio_id where p.nome = 'Casa da Serra';
grant select on _casa to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
update unidades set status = 'ocupado' where id = (select id from _casa);
insert into _resultado select 'Ana vê a casa mas não altera', (select status = 'vago' from unidades where id = (select id from _casa));
update unidades set status = 'ocupado' where id = (select id from _u);
insert into _resultado select 'Ana continua alterando apartamento', (select status = 'ocupado' from unidades where id = (select id from _u));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a0', false) \g /dev/null
update unidades set status = 'ocupado' where id = (select id from _casa);
insert into _resultado select 'Saulo altera a casa (carimbo com o nome dele)',
  (select status = 'ocupado' and atualizado_por_nome = 'Saulo' from unidades where id = (select id from _casa));
update unidades set status = 'vago' where id = (select id from _u);
insert into _resultado select 'Saulo também altera apartamento', (select status = 'vago' from unidades where id = (select id from _u));
do $$ begin
  update agenda.predios set editavel_por = null;
  insert into _resultado values ('app não destrava a casa', false);
exception when insufficient_privilege then
  insert into _resultado values ('app não destrava a casa', true);
end $$;
reset role;
\i supabase/migrations/0009_casas_so_saulo.sql
insert into _resultado select '0009 reaplicada: idempotente', (select count(*) = 5 from predios where editavel_por is not null)
  and (select count(*) = 1 from pg_policies where tablename = 'unidades' and cmd = 'UPDATE');

\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then raise exception 'há testes falhando'; end if;
end $$;
