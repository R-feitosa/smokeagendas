-- Agenda por Voz — 0008: casas de temporada na aba Apartamentos
--
-- Pedido de 26/11/2026: além dos prédios de locação, a aba mostra 5 imóveis de
-- temporada, numa seção separada ("Casas de temporada"). Cada um é um imóvel inteiro:
-- vira um "prédio" com UMA unidade (numero '1'), para reaproveitar status, carimbo
-- de quem/quando, histórico e RLS da 0007 sem tabela nova.
--
--   predios.categoria    'locacao' (padrão, os 4 da 0007) | 'temporada'
--   predios.tipo_unidade ganha 'imovel' (o app mostra só o nome do imóvel)
--
-- Carga: os 5 entram como VAGO (informado: ficam ocupados em fins de semana e o
-- controle é feito na hora). Idempotente: rodar de novo não duplica nem desfaz status.

alter table agenda.predios
  add column if not exists categoria text not null default 'locacao'
    check (categoria in ('locacao', 'temporada'));

comment on column agenda.predios.categoria is 'locacao = prédio de apartamentos/salas; temporada = casa de temporada (1 unidade)';

alter table agenda.predios drop constraint if exists predios_tipo_unidade_check;
alter table agenda.predios add constraint predios_tipo_unidade_check
  check (tipo_unidade in ('apartamento', 'sala', 'imovel'));

insert into agenda.predios (nome, tipo_unidade, ordem, categoria) values
  ('Escritório Moradas',       'imovel', 101, 'temporada'),
  ('Residência Roneely',       'imovel', 102, 'temporada'),
  ('Casa da Serra',            'imovel', 103, 'temporada'),
  ('Casa Camocim',             'imovel', 104, 'temporada'),
  ('Apartamento de Fortaleza', 'imovel', 105, 'temporada')
on conflict (nome) do nothing;

insert into agenda.unidades (predio_id, numero, status)
select p.id, '1', 'vago' from agenda.predios p where p.categoria = 'temporada'
on conflict (predio_id, numero) do nothing;

notify pgrst, 'reload schema';
