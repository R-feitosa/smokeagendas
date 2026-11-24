-- Testes do schema. Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com',  '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com',  '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'ops@ex.com',  '{}');  -- usuário do ops, sem agenda

set search_path = agenda, public;

insert into _resultado
select 'nenhum perfil criado automaticamente (sem trigger em auth.users)', (select count(*) = 0 from perfis);

set role service_role;
select habilitar_usuario('ana@ex.com', 'Ana') \g /dev/null
select habilitar_usuario('BIA@ex.com') \g /dev/null
reset role;

insert into _resultado
select 'habilitar_usuario cria perfil com nome/fuso padrão',
       (select count(*) = 2 from perfis)
   and (select nome = 'Ana' from perfis where id = '00000000-0000-0000-0000-00000000000a')
   and (select nome = 'BIA' and fuso = 'America/Fortaleza' from perfis where id = '00000000-0000-0000-0000-00000000000b');

do $$ begin
  perform agenda.habilitar_usuario('ninguem@ex.com');
  insert into _resultado values ('habilitar e-mail inexistente falha', false);
exception when raise_exception then
  insert into _resultado values ('habilitar e-mail inexistente falha', true);
end $$;

-- fuso inválido é recusado
do $$ begin
  update agenda.perfis set fuso = 'Marte/Olimpo' where nome = 'Ana';
  insert into _resultado values ('fuso inválido recusado', false);
exception when check_violation then
  insert into _resultado values ('fuso inválido recusado', true);
end $$;

-- ---------- RLS ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
insert into eventos (titulo, inicio, lembrar_min_antes) values
  ('vencido agora',     now() + interval '10 minutes', 30),   -- avisar 20 min atrás  -> sai
  ('futuro',            now() + interval '3 hours',    30),   -- ainda não            -> fica
  ('antigo demais',     now() - interval '3 hours',    0),    -- fora da janela de 2h -> fica
  ('adiado p/ passado', now() + interval '5 hours',    0);    -- com adiar_ate        -> sai
update eventos set adiar_ate = now() - interval '1 minute' where titulo = 'adiado p/ passado';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
insert into eventos (titulo, inicio) values ('da Bia', now() + interval '1 minute');
insert into _resultado select 'RLS: Bia só vê o que é dela', (select count(*) = 1 from eventos);

do $$ begin
  insert into agenda.eventos (user_id, titulo, inicio)
  values ('00000000-0000-0000-0000-00000000000a', 'intruso', now());
  insert into _resultado values ('RLS: não grava em nome de outro', false);
exception when insufficient_privilege then
  insert into _resultado values ('RLS: não grava em nome de outro', true);
end $$;

do $$ begin
  perform agenda.reivindicar_lembretes();
  insert into _resultado values ('authenticated não chama reivindicar_lembretes', false);
exception when insufficient_privilege then
  insert into _resultado values ('authenticated não chama reivindicar_lembretes', true);
end $$;

do $$ begin
  insert into agenda.eventos (titulo, inicio, fim) values ('fim antes', now(), now() - interval '1 hour');
  insert into _resultado values ('fim < inicio recusado', false);
exception when check_violation then
  insert into _resultado values ('fim < inicio recusado', true);
end $$;

do $$ begin
  insert into agenda.eventos (titulo, inicio) values ('   ', now());
  insert into _resultado values ('título vazio recusado', false);
exception when check_violation then
  insert into _resultado values ('título vazio recusado', true);
end $$;
-- usuário do ops, sem perfil na agenda: não lê perfis, não grava evento nem push
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
insert into _resultado select 'usuário não habilitado não vê perfis', (select count(*) = 0 from agenda.perfis);
do $$ begin
  insert into agenda.eventos (titulo, inicio) values ('não deveria', now());
  insert into _resultado values ('usuário não habilitado não cria evento', false);
exception when foreign_key_violation then
  insert into _resultado values ('usuário não habilitado não cria evento', true);
end $$;
do $$ begin
  insert into agenda.push_subscriptions (endpoint, p256dh, auth) values ('https://x', 'k', 'a');
  insert into _resultado values ('usuário não habilitado não cria push', false);
exception when foreign_key_violation then
  insert into _resultado values ('usuário não habilitado não cria push', true);
end $$;
do $$ begin
  perform agenda.habilitar_usuario('ops@ex.com');
  insert into _resultado values ('usuário logado não se auto-habilita', false);
exception when insufficient_privilege then
  insert into _resultado values ('usuário logado não se auto-habilita', true);
end $$;
reset role;

-- anon não enxerga o schema
set role anon;
do $$ begin
  perform 1 from agenda.eventos;
  insert into _resultado values ('anon sem acesso ao schema', false);
exception when insufficient_privilege then
  insert into _resultado values ('anon sem acesso ao schema', true);
end $$;
reset role;

-- ---------- Reivindicação de lembretes ----------
set role service_role;
create temp table _lote1 as select * from reivindicar_lembretes();
create temp table _lote2 as select * from reivindicar_lembretes();
reset role;

insert into _resultado select 'lote 1 traz só os vencidos',
  (select array_agg(titulo order by titulo) from _lote1) = array['adiado p/ passado', 'da Bia', 'vencido agora'];
insert into _resultado select 'lote 1 traz o fuso do perfil',
  (select bool_and(fuso = 'America/Fortaleza') from _lote1);
insert into _resultado select 'lote 2 vazio (não reenvia)', (select count(*) = 0 from _lote2);
insert into _resultado select 'adiar_ate zerado após envio',
  (select adiar_ate is null and lembrete_enviado_em is not null from eventos where titulo = 'adiado p/ passado');

-- liberar_lembrete devolve para a fila
set role service_role;
select liberar_lembrete((select id from eventos where titulo = 'vencido agora')) \g /dev/null
create temp table _lote3 as select * from reivindicar_lembretes();
reset role;
insert into _resultado select 'liberar_lembrete faz reenviar',
  (select array_agg(titulo) from _lote3) = array['vencido agora'];

-- remarcar rearma o lembrete
update eventos set inicio = inicio + interval '1 day' where titulo = 'vencido agora';
insert into _resultado select 'remarcar horário rearma lembrete',
  (select lembrete_enviado_em is null from eventos where titulo = 'vencido agora');
update eventos set titulo = 'da Bia (editado)' where titulo = 'da Bia';
insert into _resultado select 'editar só o título não rearma',
  (select lembrete_enviado_em is not null from eventos where titulo = 'da Bia (editado)');

-- concorrência: lote limitado
insert into _resultado select 'parâmetro lote limita o tamanho',
  (select count(*) = 0 from reivindicar_lembretes(0));

-- excluir o perfil leva os dados da agenda junto, sem tocar em auth.users
delete from perfis where id = '00000000-0000-0000-0000-00000000000b';
insert into _resultado select 'desabilitar remove dados da agenda e mantém o login',
  (select count(*) = 0 from eventos where user_id = '00000000-0000-0000-0000-00000000000b')
  and (select count(*) = 1 from auth.users where id = '00000000-0000-0000-0000-00000000000b');

-- nada foi criado em public
insert into _resultado select 'nenhum objeto criado em public',
  (select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public')
  and (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public');

-- ---------- Relatório ----------
\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then
    raise exception 'há testes falhando';
  end if;
end $$;
