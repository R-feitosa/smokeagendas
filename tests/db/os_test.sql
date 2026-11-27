-- Testes das Ordens de Serviço (0004). Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ex.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@ex.com'),
  ('00000000-0000-0000-0000-00000000000c', 'ops@ex.com');   -- sem perfil na agenda

set search_path = agenda, public;
set role service_role;
select habilitar_usuario('ana@ex.com', 'Ana') \g /dev/null
select habilitar_usuario('bia@ex.com', 'Bia') \g /dev/null
reset role;

insert into _resultado select 'bucket de fotos é privado',
  (select not public from storage.buckets where id = 'agenda-os-fotos');

-- ---------- Abertura e numeração ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null

insert into os_ordens (problema, equipamento, numero, aberta_em)
values ('TV não liga', 'TV 50"', 'OS-FORJADA', '2000-01-01');
insert into os_ordens (problema, prioridade) values ('Ar pingando', 'alta');

insert into _resultado select 'número gerado pelo servidor (ignora o enviado)',
  (select count(*) = 2 from os_ordens where numero ~ '^OS-\d{4}-\d{5}$');
insert into _resultado select 'números sequenciais e distintos',
  (select max(sequencial) - min(sequencial) = 1 and count(distinct numero) = 2 from os_ordens);
insert into _resultado select 'data de abertura carimbada pelo servidor',
  (select aberta_em > now() - interval '1 minute' from os_ordens where problema = 'TV não liga');
insert into _resultado select 'cliente padrão PHILCO e status aberta',
  (select cliente = 'PHILCO' and status = 'aberta' from os_ordens where problema = 'TV não liga');
insert into _resultado select 'abertura registrada no histórico',
  (select count(*) = 2 from os_historico where acao = 'abertura');

do $$ begin
  insert into agenda.os_ordens (problema, status) values ('já nasce pronta', 'concluida');
  insert into _resultado values ('OS não nasce concluída', false);
exception when check_violation then
  insert into _resultado values ('OS não nasce concluída', true);
end $$;

-- ---------- RLS ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
insert into _resultado select 'RLS: Bia não vê OS da Ana', (select count(*) = 0 from os_ordens);
insert into _resultado select 'RLS: Bia não vê histórico da Ana', (select count(*) = 0 from os_historico);

do $$ begin
  insert into agenda.os_ordens (user_id, problema) values ('00000000-0000-0000-0000-00000000000a', 'intrusa');
  insert into _resultado values ('RLS: Bia não cria OS em nome da Ana', false);
exception when insufficient_privilege then
  insert into _resultado values ('RLS: Bia não cria OS em nome da Ana', true);
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
do $$ begin
  insert into agenda.os_ordens (problema) values ('sem perfil');
  insert into _resultado values ('usuário não habilitado não abre OS', false);
exception when foreign_key_violation then
  insert into _resultado values ('usuário não habilitado não abre OS', true);
end $$;

-- ---------- Regras de conclusão ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null

update os_ordens set status = 'em_andamento' where problema = 'TV não liga';
insert into _resultado select 'iniciar carimba iniciada_em',
  (select iniciada_em is not null from os_ordens where problema = 'TV não liga');

do $$ begin
  update agenda.os_ordens set status = 'concluida', servico_executado = 'Troca da fonte' where problema = 'TV não liga';
  insert into _resultado values ('não conclui sem fotos de antes/depois', false);
exception when check_violation then
  insert into _resultado values ('não conclui sem fotos de antes/depois', true);
end $$;

-- foto com caminho de outra pessoa é recusada
do $$ begin
  insert into agenda.os_fotos (os_id, momento, caminho)
  select id, 'antes', '00000000-0000-0000-0000-00000000000b/' || id || '/antes/x.jpg'
  from agenda.os_ordens where problema = 'TV não liga';
  insert into _resultado values ('foto com caminho de outro usuário recusada', false);
exception when check_violation then
  insert into _resultado values ('foto com caminho de outro usuário recusada', true);
end $$;

insert into os_fotos (os_id, momento, caminho, legenda)
select id, 'antes', '00000000-0000-0000-0000-00000000000a/' || id || '/antes/1.jpg', 'tela apagada'
from os_ordens where problema = 'TV não liga';

do $$ begin
  update agenda.os_ordens set status = 'concluida', servico_executado = 'Troca da fonte' where problema = 'TV não liga';
  insert into _resultado values ('não conclui só com foto de antes', false);
exception when check_violation then
  insert into _resultado values ('não conclui só com foto de antes', true);
end $$;

insert into os_fotos (os_id, momento, caminho, legenda)
select id, 'depois', '00000000-0000-0000-0000-00000000000a/' || id || '/depois/1.jpg', 'ligando'
from os_ordens where problema = 'TV não liga';

do $$ begin
  update agenda.os_ordens set status = 'concluida' where problema = 'TV não liga';
  insert into _resultado values ('não conclui sem descrever o serviço', false);
exception when check_violation then
  insert into _resultado values ('não conclui sem descrever o serviço', true);
end $$;

update os_ordens set status = 'concluida', servico_executado = 'Troca da fonte' where problema = 'TV não liga';
insert into _resultado select 'conclui com antes + depois + serviço',
  (select status = 'concluida' and concluida_em is not null from os_ordens where problema = 'TV não liga');

-- travas da OS concluída
do $$ begin
  update agenda.os_ordens set problema = 'reescrito' where problema = 'TV não liga';
  insert into _resultado values ('OS concluída não pode ser editada', false);
exception when check_violation then
  insert into _resultado values ('OS concluída não pode ser editada', true);
end $$;

do $$ begin
  delete from agenda.os_fotos where legenda = 'tela apagada';
  insert into _resultado values ('foto de OS concluída não pode ser apagada', false);
exception when check_violation then
  insert into _resultado values ('foto de OS concluída não pode ser apagada', true);
end $$;

do $$ begin
  insert into agenda.os_fotos (os_id, momento, caminho)
  select id, 'depois', '00000000-0000-0000-0000-00000000000a/' || id || '/depois/2.jpg'
  from agenda.os_ordens where problema = 'TV não liga';
  insert into _resultado values ('OS concluída não recebe foto nova', false);
exception when check_violation then
  insert into _resultado values ('OS concluída não recebe foto nova', true);
end $$;

-- reabrir
update os_ordens set status = 'em_andamento' where problema = 'TV não liga';
insert into _resultado select 'reabrir limpa concluida_em e mantém iniciada_em',
  (select concluida_em is null and iniciada_em is not null from os_ordens where problema = 'TV não liga');

do $$ begin
  update agenda.os_ordens set numero = 'OS-1999-00001' where problema = 'TV não liga';
  insert into _resultado values ('número da OS é imutável', false);
exception when check_violation then
  insert into _resultado values ('número da OS é imutável', true);
end $$;

do $$ begin
  update agenda.os_fotos set momento = 'depois' where legenda = 'tela apagada';
  insert into _resultado values ('momento da foto é imutável', false);
exception when check_violation or insufficient_privilege then
  insert into _resultado values ('momento da foto é imutável', true);
end $$;

update os_fotos set legenda = 'tela apagada (frontal)' where legenda = 'tela apagada';
insert into _resultado select 'legenda da foto pode ser editada',
  (select count(*) = 1 from os_fotos where legenda = 'tela apagada (frontal)');

-- ---------- Cancelamento ----------
do $$ begin
  update agenda.os_ordens set status = 'cancelada' where problema = 'Ar pingando';
  insert into _resultado values ('cancelar exige motivo', false);
exception when check_violation then
  insert into _resultado values ('cancelar exige motivo', true);
end $$;

update os_ordens set status = 'cancelada', motivo_cancelamento = 'Cliente desistiu' where problema = 'Ar pingando';
do $$ begin
  update agenda.os_ordens set status = 'em_andamento' where problema = 'Ar pingando';
  insert into _resultado values ('OS cancelada é definitiva', false);
exception when check_violation then
  insert into _resultado values ('OS cancelada é definitiva', true);
end $$;

do $$ begin
  delete from agenda.os_ordens where problema = 'Ar pingando';
  insert into _resultado values ('OS não pode ser apagada (só cancelada)', false);
exception when insufficient_privilege then
  insert into _resultado values ('OS não pode ser apagada (só cancelada)', true);
end $$;

insert into _resultado select 'histórico registra status e fotos',
  (select count(*) filter (where acao = 'status') >= 4
      and count(*) filter (where acao = 'foto_incluida') = 2
   from os_historico);

do $$ begin
  insert into agenda.os_historico (os_id, user_id, acao)
  select id, user_id, 'forjado' from agenda.os_ordens limit 1;
  insert into _resultado values ('histórico não aceita escrita do usuário', false);
exception when insufficient_privilege then
  insert into _resultado values ('histórico não aceita escrita do usuário', true);
end $$;

do $$ begin
  perform agenda.os_proximo_numero(2026);
  insert into _resultado values ('contador não é chamável pelo usuário', false);
exception when insufficient_privilege then
  insert into _resultado values ('contador não é chamável pelo usuário', true);
end $$;

-- ---------- Storage ----------
insert into storage.objects (bucket_id, name)
select 'agenda-os-fotos', '00000000-0000-0000-0000-00000000000a/' || id || '/antes/novo.jpg'
from os_ordens where problema = 'TV não liga';
insert into _resultado select 'storage: dono envia foto na própria OS em andamento',
  (select count(*) = 1 from storage.objects);

do $$ begin
  insert into storage.objects (bucket_id, name)
  select 'agenda-os-fotos', '00000000-0000-0000-0000-00000000000a/' || id || '/antes/x.jpg'
  from agenda.os_ordens where problema = 'Ar pingando';
  insert into _resultado values ('storage: não envia foto em OS cancelada', false);
exception when insufficient_privilege then
  insert into _resultado values ('storage: não envia foto em OS cancelada', true);
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name)
  select 'agenda-os-fotos', '00000000-0000-0000-0000-00000000000a/' || id || '/qualquer/x.jpg'
  from agenda.os_ordens where problema = 'TV não liga';
  insert into _resultado values ('storage: pasta de momento inválida recusada', false);
exception when insufficient_privilege then
  insert into _resultado values ('storage: pasta de momento inválida recusada', true);
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
insert into _resultado select 'storage: Bia não vê fotos da Ana', (select count(*) = 0 from storage.objects);
do $$ begin
  insert into storage.objects (bucket_id, name)
  select 'agenda-os-fotos', '00000000-0000-0000-0000-00000000000b/00000000-0000-0000-0000-000000000099/antes/x.jpg';
  insert into _resultado values ('storage: não envia para OS inexistente/alheia', false);
exception when insufficient_privilege then
  insert into _resultado values ('storage: não envia para OS inexistente/alheia', true);
end $$;

reset role;

-- desabilitar a Ana leva as OS, fotos e histórico juntos (cascata passa pelos triggers)
delete from perfis where id = '00000000-0000-0000-0000-00000000000a';
insert into _resultado select 'desabilitar remove OS, fotos e histórico',
  (select count(*) = 0 from os_ordens) and (select count(*) = 0 from os_fotos) and (select count(*) = 0 from os_historico);

insert into _resultado select 'nenhum objeto criado em public',
  (select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public');

-- ---------- Relatório ----------
\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then
    raise exception 'há testes falhando';
  end if;
end $$;
