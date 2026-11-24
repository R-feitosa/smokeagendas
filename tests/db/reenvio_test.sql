-- Testes do reenvio de lembretes até confirmar (0003). Rode com: npm run test:db
-- O "tempo passando" é simulado recuando lembrete_enviado_em.
\set ON_ERROR_STOP on
set client_min_messages = warning;
create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;
set search_path = agenda, public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com');
select habilitar_usuario('ana@ex.com', 'Ana') \g /dev/null
select habilitar_usuario('bia@ex.com', 'Bia') \g /dev/null

-- devolve "titulo:envio" do que foi reivindicado agora
create function pg_temp.lote() returns text[] language sql as $$
  select coalesce(array_agg(titulo || ':' || envio order by titulo), '{}') from agenda.reivindicar_lembretes()
$$;
-- simula que o último aviso saiu há N minutos
create function pg_temp.passar(p_titulo text, p_min int) returns void language sql as $$
  update agenda.eventos set lembrete_enviado_em = now() - make_interval(mins => p_min) where titulo = p_titulo
$$;

insert into _resultado select 'padrões do perfil: a cada 5 min, até 3 reenvios',
  (select reenviar_a_cada_min = 5 and max_reenvios = 3 from perfis where nome = 'Ana');

-- ---------- ciclo completo: 1º aviso + 3 reenvios ----------
insert into eventos (user_id, titulo, inicio, lembrar_min_antes)
values ('00000000-0000-0000-0000-00000000000a', 'A', now() + interval '10 minutes', 30);

insert into _resultado select '1º aviso sai com envio=1', pg_temp.lote() = '{A:1}';
insert into _resultado select 'logo em seguida não reenvia', pg_temp.lote() = '{}';
select pg_temp.passar('A', 4) \g /dev/null
insert into _resultado select 'antes do intervalo (4 min) não reenvia', pg_temp.lote() = '{}';
select pg_temp.passar('A', 5) \g /dev/null
insert into _resultado select 'cumprido o intervalo reenvia (envio=2)', pg_temp.lote() = '{A:2}';
select pg_temp.passar('A', 5) \g /dev/null
insert into _resultado select '2º reenvio (envio=3)', pg_temp.lote() = '{A:3}';
select pg_temp.passar('A', 5) \g /dev/null
insert into _resultado select '3º reenvio (envio=4)', pg_temp.lote() = '{A:4}';
select pg_temp.passar('A', 60) \g /dev/null
insert into _resultado select 'passado o limite, para de reenviar', pg_temp.lote() = '{}';
update eventos set status = 'cancelado' where titulo = 'A';

-- ---------- concluir para os reenvios ----------
insert into eventos (user_id, titulo, inicio) values ('00000000-0000-0000-0000-00000000000a', 'C', now() + interval '5 minutes');
select pg_temp.lote() \g /dev/null
update eventos set status = 'concluido' where titulo = 'C';
select pg_temp.passar('C', 10) \g /dev/null
insert into _resultado select 'concluir interrompe os reenvios', pg_temp.lote() = '{}';

-- ---------- adiar zera a contagem ----------
insert into eventos (user_id, titulo, inicio) values ('00000000-0000-0000-0000-00000000000a', 'D', now() + interval '5 minutes');
select pg_temp.lote() \g /dev/null
select pg_temp.passar('D', 5) \g /dev/null
-- envio 2:
select pg_temp.lote() \g /dev/null
-- o app faz exatamente isto ao tocar em "Adiar 10 min"
update eventos set adiar_ate = now() + interval '10 minutes', lembrete_enviado_em = null where titulo = 'D';
insert into _resultado select 'adiar zera lembretes_enviados', (select lembretes_enviados = 0 from eventos where titulo = 'D');
insert into _resultado select 'adiado não avisa antes da hora', pg_temp.lote() = '{}';
update eventos set adiar_ate = now() - interval '1 minute' where titulo = 'D';   -- chegou a hora
insert into _resultado select 'após adiar, novo ciclo começa em envio=1', pg_temp.lote() = '{D:1}';
update eventos set status = 'cancelado' where titulo = 'D';

-- ---------- falha transitória: liberar desfaz a reivindicação ----------
insert into eventos (user_id, titulo, inicio) values ('00000000-0000-0000-0000-00000000000a', 'E', now() + interval '5 minutes');
select pg_temp.lote() \g /dev/null
select pg_temp.passar('E', 5) \g /dev/null
-- envio 2 (falhou no push):
select pg_temp.lote() \g /dev/null
select liberar_lembrete((select id from eventos where titulo = 'E')) \g /dev/null
insert into _resultado select 'liberar devolve a contagem (2 → 1)', (select lembretes_enviados = 1 from eventos where titulo = 'E');
insert into _resultado select 'liberado é tentado de novo na hora, com o mesmo envio=2', pg_temp.lote() = '{E:2}';
update eventos set status = 'cancelado' where titulo = 'E';

-- ---------- remarcar zera a contagem ----------
insert into eventos (user_id, titulo, inicio) values ('00000000-0000-0000-0000-00000000000a', 'R', now() + interval '5 minutes');
select pg_temp.lote() \g /dev/null
update eventos set inicio = inicio + interval '1 day' where titulo = 'R';
insert into _resultado select 'remarcar zera contagem e aviso', (select lembretes_enviados = 0 and lembrete_enviado_em is null from eventos where titulo = 'R');
update eventos set status = 'cancelado' where titulo = 'R';

-- ---------- preferências por pessoa ----------
update perfis set max_reenvios = 0 where nome = 'Bia';
update perfis set reenviar_a_cada_min = 10 where nome = 'Ana';
insert into eventos (user_id, titulo, inicio) values
  ('00000000-0000-0000-0000-00000000000b', 'B', now() + interval '5 minutes'),
  ('00000000-0000-0000-0000-00000000000a', 'F', now() + interval '5 minutes');
insert into _resultado select '1º aviso de ambos', pg_temp.lote() = '{B:1,F:1}';
select pg_temp.passar('B', 30) \g /dev/null
select pg_temp.passar('F', 6) \g /dev/null
insert into _resultado select 'max_reenvios=0 desliga o reenvio; intervalo de 10 min respeitado', pg_temp.lote() = '{}';
select pg_temp.passar('F', 10) \g /dev/null
insert into _resultado select 'intervalo de 10 min cumprido reenvia', pg_temp.lote() = '{F:2}';

-- ---------- a pessoa ajusta as próprias preferências, dentro dos limites ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
update perfis set reenviar_a_cada_min = 15, max_reenvios = 5;
insert into _resultado select 'usuário altera as próprias preferências',
  (select reenviar_a_cada_min = 15 and max_reenvios = 5 from perfis);
do $$ begin
  update agenda.perfis set max_reenvios = 50;
  insert into _resultado values ('limite de 10 reenvios respeitado', false);
exception when check_violation then
  insert into _resultado values ('limite de 10 reenvios respeitado', true);
end $$;
update perfis set max_reenvios = 9 where nome = 'Bia';   -- não é dela: RLS ignora
reset role;
insert into _resultado select 'não altera preferências de outra pessoa',
  (select max_reenvios = 0 from perfis where nome = 'Bia');

\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then raise exception 'há testes falhando'; end if;
end $$;
