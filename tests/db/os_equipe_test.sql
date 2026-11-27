-- Testes da 0005: equipes, checklist e assinatura. Rode com: npm run test:db
\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table _resultado (teste text, ok boolean);
grant all on _resultado to anon, authenticated, service_role;
create temp table _ids (nome text primary key, id uuid);
grant all on _ids to authenticated, service_role;

-- g = gestor, t = técnico, u = técnico 2, x = de fora da equipe
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'gestor@ex.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'tec@ex.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'tec2@ex.com'),
  ('00000000-0000-0000-0000-0000000000a4', 'fora@ex.com');

set search_path = agenda, public;
set role service_role;
select habilitar_usuario('gestor@ex.com', 'Gil') \g /dev/null
select habilitar_usuario('tec@ex.com', 'Téo') \g /dev/null
select habilitar_usuario('tec2@ex.com', 'Uri') \g /dev/null
select habilitar_usuario('fora@ex.com', 'Xavi') \g /dev/null
insert into _ids select 'equipe', os_criar_equipe('PHILCO Fortaleza', 'gestor@ex.com');
reset role;

insert into _resultado select 'modelos de checklist semeados', (select count(*) >= 6 from os_checklist_modelos);

set role authenticated;
-- ---------- Gestão da equipe ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false) \g /dev/null
select os_definir_membro((select id from _ids where nome = 'equipe'), 'tec@ex.com', 'tecnico') \g /dev/null
select os_definir_membro((select id from _ids where nome = 'equipe'), 'TEC2@ex.com', 'tecnico') \g /dev/null
insert into _resultado select 'gestor inclui técnicos; os_minhas_equipes lista com nomes',
  (select count(*) = 3 and bool_or(nome = 'Téo' and papel = 'tecnico') from os_minhas_equipes());

do $$ begin
  perform agenda.os_definir_membro((select id from _ids where nome = 'equipe'), 'gestor@ex.com', 'tecnico');
  insert into _resultado values ('equipe não fica sem gestor', false);
exception when raise_exception then
  insert into _resultado values ('equipe não fica sem gestor', true);
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false) \g /dev/null
do $$ begin
  perform agenda.os_definir_membro((select id from _ids where nome = 'equipe'), 'fora@ex.com', 'tecnico');
  insert into _resultado values ('técnico não inclui membros', false);
exception when insufficient_privilege then
  insert into _resultado values ('técnico não inclui membros', true);
end $$;

do $$ begin
  perform agenda.os_criar_equipe('Minha', 'tec@ex.com');
  insert into _resultado values ('usuário não cria equipe (só admin)', false);
exception when insufficient_privilege then
  insert into _resultado values ('usuário não cria equipe (só admin)', true);
end $$;

-- ---------- Visibilidade ----------
-- gestor abre OS da equipe atribuída ao Téo; outra sem técnico
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into os_ordens (problema, equipe_id, tecnico_id, categoria, checklist)
values ('TV loja 1', (select id from _ids where nome = 'equipe'), '00000000-0000-0000-0000-0000000000a2', 'TV / Monitor',
        '[{"item":"Liga","resposta":null},{"item":"Som","resposta":null}]');
insert into os_ordens (problema, equipe_id) values ('Fila sem técnico', (select id from _ids where nome = 'equipe'));
insert into _ids select 'os1', id from os_ordens where problema = 'TV loja 1';

-- técnico abre uma OS própria na equipe
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false) \g /dev/null
insert into os_ordens (problema, equipe_id, tecnico_id)
values ('Aberta pelo Uri', (select id from _ids where nome = 'equipe'), '00000000-0000-0000-0000-0000000000a3');

insert into _resultado select 'técnico vê só as dele (Uri: 1)', (select count(*) = 1 from os_ordens);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false) \g /dev/null
insert into _resultado select 'técnico vê a atribuída a ele (Téo: 1)',
  (select count(*) = 1 and bool_and(problema = 'TV loja 1') from os_ordens);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false) \g /dev/null
insert into _resultado select 'gestor vê todas da equipe (3)', (select count(*) = 3 from os_ordens);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false) \g /dev/null
insert into _resultado select 'quem é de fora não vê nada', (select count(*) = 0 from os_ordens)
  and (select count(*) = 0 from os_membros) and (select count(*) = 0 from os_equipes);

do $$ begin
  insert into agenda.os_ordens (problema, equipe_id) values ('intruso', (select id from _ids where nome = 'equipe'));
  insert into _resultado values ('de fora não abre OS na equipe', false);
exception when check_violation then
  insert into _resultado values ('de fora não abre OS na equipe', true);
end $$;

do $$ begin
  insert into agenda.os_ordens (problema, tecnico_id) values ('atribui a outro sem equipe', '00000000-0000-0000-0000-0000000000a2');
  insert into _resultado values ('sem equipe não atribui a terceiro', false);
exception when check_violation then
  insert into _resultado values ('sem equipe não atribui a terceiro', true);
end $$;

-- ---------- Atribuição e cancelamento ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false) \g /dev/null
do $$ begin
  update agenda.os_ordens set tecnico_id = '00000000-0000-0000-0000-0000000000a3' where problema = 'TV loja 1';
  insert into _resultado values ('técnico não reatribui OS', false);
exception when check_violation then
  insert into _resultado values ('técnico não reatribui OS', true);
end $$;

do $$ begin
  update agenda.os_ordens set status = 'cancelada', motivo_cancelamento = 'x' where problema = 'TV loja 1';
  insert into _resultado values ('técnico não cancela OS do gestor', false);
exception when check_violation then
  insert into _resultado values ('técnico não cancela OS do gestor', true);
end $$;

-- técnico trabalha na OS: status, fotos, checklist
update os_ordens set status = 'em_andamento', diagnostico = 'Fonte queimada' where problema = 'TV loja 1';
insert into os_fotos (os_id, momento, caminho)
select id, 'antes', user_id || '/' || id || '/antes/1.jpg' from os_ordens where problema = 'TV loja 1';
insert into os_fotos (os_id, momento, caminho)
select id, 'depois', user_id || '/' || id || '/depois/1.jpg' from os_ordens where problema = 'TV loja 1';
insert into _resultado select 'técnico envia fotos; foto fica na pasta do dono e guarda o autor',
  (select count(*) = 2 and bool_and(user_id = '00000000-0000-0000-0000-0000000000a1'
                                    and autor_id = '00000000-0000-0000-0000-0000000000a2') from os_fotos);

-- storage: técnico envia na OS atribuída
insert into storage.objects (bucket_id, name)
select 'agenda-os-fotos', user_id || '/' || id || '/antes/s.jpg' from os_ordens where problema = 'TV loja 1';
insert into _resultado select 'storage: técnico envia na OS atribuída', (select count(*) = 1 from storage.objects);

-- ---------- Checklist ----------
do $$ begin
  update agenda.os_ordens set checklist = '[{"item":"Liga","resposta":"talvez"}]' where problema = 'TV loja 1';
  insert into _resultado values ('checklist com resposta inválida recusado', false);
exception when check_violation then
  insert into _resultado values ('checklist com resposta inválida recusado', true);
end $$;

do $$ begin
  insert into agenda.os_ordens (problema, checklist) values ('lixo', '{"a":1}');
  insert into _resultado values ('checklist inválido recusado já na abertura', false);
exception when check_violation then
  insert into _resultado values ('checklist inválido recusado já na abertura', true);
end $$;

do $$ begin
  update agenda.os_ordens set status = 'concluida', servico_executado = 'Troca da fonte' where problema = 'TV loja 1';
  insert into _resultado values ('não conclui com checklist pendente', false);
exception when check_violation then
  insert into _resultado values ('não conclui com checklist pendente', true);
end $$;

update os_ordens set checklist = '[{"item":"Liga","resposta":"ok"},{"item":"Som","resposta":"na","obs":"sem caixa"}]'
where problema = 'TV loja 1';
insert into _resultado select 'mexer só no checklist não gera linha de edição',
  (select count(*) = 1 from os_historico h join os_ordens o on o.id = h.os_id
   where o.problema = 'TV loja 1' and h.acao = 'edicao');   -- a única é a do diagnóstico

-- ---------- Assinatura ----------
do $$ begin
  update agenda.os_ordens set assinatura_caminho = '00000000-0000-0000-0000-0000000000a2/x/assinatura/a.png',
                              assinatura_nome = 'Cliente' where problema = 'TV loja 1';
  insert into _resultado values ('assinatura fora da pasta da OS recusada', false);
exception when check_violation then
  insert into _resultado values ('assinatura fora da pasta da OS recusada', true);
end $$;

do $$ begin
  update agenda.os_ordens set assinatura_caminho = user_id || '/' || id || '/assinatura/a.png' where problema = 'TV loja 1';
  insert into _resultado values ('assinatura exige nome de quem assinou', false);
exception when check_violation then
  insert into _resultado values ('assinatura exige nome de quem assinou', true);
end $$;

update os_ordens set assinatura_caminho = user_id || '/' || id || '/assinatura/a.png',
                     assinatura_nome = 'Maria (gerente da loja)', assinado_em = '2000-01-01'
where problema = 'TV loja 1';
insert into _resultado select 'assinado_em carimbado pelo servidor',
  (select assinado_em > now() - interval '1 minute' from os_ordens where problema = 'TV loja 1');

update os_ordens set status = 'concluida', servico_executado = 'Troca da fonte' where problema = 'TV loja 1';
insert into _resultado select 'técnico conclui com fotos + checklist + serviço',
  (select status = 'concluida' from os_ordens where problema = 'TV loja 1');

do $$ begin
  update agenda.os_ordens set assinatura_caminho = null where problema = 'TV loja 1';
  insert into _resultado values ('assinatura travada após conclusão', false);
exception when check_violation then
  insert into _resultado values ('assinatura travada após conclusão', true);
end $$;

insert into _resultado select 'histórico com autor, atribuição e assinatura',
  (select bool_or(acao = 'atribuicao' and para = 'Téo')
      and bool_or(acao = 'assinatura' and detalhe like 'Maria%')
      and bool_or(acao = 'status' and para = 'concluida' and autor_nome = 'Téo')
   from os_historico h join os_ordens o on o.id = h.os_id where o.problema = 'TV loja 1');

-- ---------- Reatribuição pelo gestor e saída da equipe ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false) \g /dev/null
update os_ordens set tecnico_id = '00000000-0000-0000-0000-0000000000a2' where problema = 'Fila sem técnico';
do $$ begin
  update agenda.os_ordens set tecnico_id = '00000000-0000-0000-0000-0000000000a4' where problema = 'Fila sem técnico';
  insert into _resultado values ('gestor não atribui a quem não é da equipe', false);
exception when check_violation then
  insert into _resultado values ('gestor não atribui a quem não é da equipe', true);
end $$;

select os_remover_membro((select id from _ids where nome = 'equipe'), '00000000-0000-0000-0000-0000000000a2') \g /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false) \g /dev/null
insert into _resultado select 'técnico removido da equipe perde acesso às OS atribuídas',
  (select count(*) = 0 from os_ordens) and (select count(*) = 0 from os_fotos)
  and (select count(*) = 0 from storage.objects);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false) \g /dev/null
update os_ordens set status = 'cancelada', motivo_cancelamento = 'Duplicada' where problema = 'Aberta pelo Uri';
insert into _resultado select 'gestor cancela OS aberta por técnico',
  (select status = 'cancelada' from os_ordens where problema = 'Aberta pelo Uri');

reset role;

-- ---------- Relatório ----------
\echo
select case when ok then 'PASSOU' else 'FALHOU' end as resultado, teste from _resultado;
do $$ begin
  if exists (select 1 from _resultado where not ok) then
    raise exception 'há testes falhando';
  end if;
end $$;
