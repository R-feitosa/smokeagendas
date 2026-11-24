-- Testes do schema. Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table _resultado (teste text, ok boolean);
grant all on _resultado to authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com',  '{"nome":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com',  '{}');

insert into _resultado
select 'perfil criado pelo trigger com nome/fuso padrão',
       (select count(*) = 2 from profiles)
   and (select nome = 'Ana' from profiles where id = '00000000-0000-0000-0000-00000000000a')
   and (select nome = 'bia' and fuso = 'America/Fortaleza' from profiles where id = '00000000-0000-0000-0000-00000000000b');

-- fuso inválido é recusado
do $$ begin
  update profiles set fuso = 'Marte/Olimpo' where nome = 'Ana';
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
  insert into eventos (user_id, titulo, inicio)
  values ('00000000-0000-0000-0000-00000000000a', 'intruso', now());
  insert into _resultado values ('RLS: não grava em nome de outro', false);
exception when insufficient_privilege then
  insert into _resultado values ('RLS: não grava em nome de outro', true);
end $$;

do $$ begin
  perform reivindicar_lembretes();
  insert into _resultado values ('authenticated não chama reivindicar_lembretes', false);
exception when insufficient_privilege then
  insert into _resultado values ('authenticated não chama reivindicar_lembretes', true);
end $$;

do $$ begin
  insert into eventos (titulo, inicio, fim) values ('fim antes', now(), now() - interval '1 hour');
  insert into _resultado values ('fim < inicio recusado', false);
exception when check_violation then
  insert into _resultado values ('fim < inicio recusado', true);
end $$;

do $$ begin
  insert into eventos (titulo, inicio) values ('   ', now());
  insert into _resultado values ('título vazio recusado', false);
exception when check_violation then
  insert into _resultado values ('título vazio recusado', true);
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

-- ---------- Relatório ----------
\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then
    raise exception 'há testes falhando';
  end if;
end $$;
