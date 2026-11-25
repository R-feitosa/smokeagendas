-- Agenda por Voz — 0005: agenda da equipe (quem organiza é o dono da conta)
--
-- O dono da conta (ex.: Saulo) registra também os compromissos da equipe dele.
-- Cada compromisso diz "de quem é" em eventos.responsavel:
--   null      → do próprio dono ("Minha")
--   'Toyota'  → de um membro da equipe ("Equipe")
-- A lista de membros fica em perfis.equipe (nomes livres, editáveis pelo dono).
-- Nada muda no acesso: continua tudo da conta do dono (RLS por user_id) e os avisos
-- chegam no aparelho dele. As repetições herdam o responsável.

alter table agenda.perfis
  add column equipe text[] not null default '{}'
    check (cardinality(equipe) <= 20 and array_position(equipe, null) is null);

grant update (equipe) on agenda.perfis to authenticated;

alter table agenda.eventos
  add column responsavel text
    check (responsavel is null or char_length(btrim(responsavel)) between 1 and 60);

comment on column agenda.eventos.responsavel is 'null = do dono da conta; nome = membro da equipe (perfis.equipe)';
comment on column agenda.perfis.equipe is 'Membros da equipe do dono da conta (filtro Minha | Equipe)';

-- ---------------------------------------------------------------
-- gerar_proxima: igual à 0003, agora copiando o responsável
-- ---------------------------------------------------------------
create or replace function agenda.gerar_proxima(p_evento_id uuid) returns uuid
language plpgsql security definer set search_path = agenda, pg_catalog as $$
declare
  e        agenda.eventos;
  v_fuso   text;
  v_passo  interval;
  v_k      integer;
  v_inicio timestamptz;
  v_novo   uuid;
begin
  select * into e from agenda.eventos where id = p_evento_id for update;
  if not found or e.recorrencia is null or e.proxima_gerada_em is not null then
    return null;
  end if;

  select fuso into v_fuso from agenda.perfis where id = e.user_id;
  v_passo := case e.recorrencia
               when 'diaria'  then interval '1 day'
               when 'semanal' then interval '7 days'
               else                interval '1 month'
             end;

  select k, ((e.serie_ancora at time zone v_fuso) + k * v_passo) at time zone v_fuso
    into v_k, v_inicio
  from generate_series(e.ocorrencia_n + 1, e.ocorrencia_n + 20000) as k
  where ((e.serie_ancora at time zone v_fuso) + k * v_passo) at time zone v_fuso > greatest(now(), e.inicio)
  order by k
  limit 1;

  update agenda.eventos set proxima_gerada_em = now() where id = e.id;
  if v_inicio is null then
    return null;
  end if;

  insert into agenda.eventos (user_id, titulo, descricao, inicio, fim, lembrar_min_antes,
                              recorrencia, serie_id, serie_ancora, ocorrencia_n, responsavel)
  values (e.user_id, e.titulo, e.descricao, v_inicio, v_inicio + (e.fim - e.inicio), e.lembrar_min_antes,
          e.recorrencia, e.serie_id, e.serie_ancora, v_k, e.responsavel)
  on conflict (serie_id, ocorrencia_n) where serie_id is not null do nothing
  returning id into v_novo;

  return v_novo;
end $$;

-- ---------------------------------------------------------------
-- projetar_ocorrencias: igual à 0004, agora devolvendo o responsável
-- (o tipo de retorno muda, então é drop + create)
-- ---------------------------------------------------------------
drop function agenda.projetar_ocorrencias(timestamptz, timestamptz);

create function agenda.projetar_ocorrencias(p_de timestamptz, p_ate timestamptz)
returns table (
  serie_id uuid,
  ocorrencia_n integer,
  inicio timestamptz,
  fim timestamptz,
  titulo text,
  descricao text,
  lembrar_min_antes integer,
  recorrencia text,
  responsavel text
)
language sql stable security invoker set search_path = agenda, pg_catalog as $$
  with ponta as (
    select e.serie_id, e.serie_ancora, e.ocorrencia_n, e.inicio, e.fim, e.titulo, e.descricao,
           e.lembrar_min_antes, e.recorrencia::text as recorrencia, e.responsavel, p.fuso,
           case e.recorrencia when 'diaria' then interval '1 day'
                              when 'semanal' then interval '7 days'
                              else interval '1 month' end as passo
      from agenda.eventos e
      join agenda.perfis p on p.id = e.user_id
     where e.recorrencia is not null
       and e.proxima_gerada_em is null
       and p_ate > p_de and p_ate - p_de <= interval '62 days'
  ),
  candidatas as (
    select pt.*, k,
           ((pt.serie_ancora at time zone pt.fuso) + k * pt.passo) at time zone pt.fuso as data_k
      from ponta pt,
           generate_series(pt.ocorrencia_n + 1, pt.ocorrencia_n + 5000) as k
  )
  select c.serie_id, c.k, c.data_k, c.data_k + (c.fim - c.inicio), c.titulo, c.descricao,
         c.lembrar_min_antes, c.recorrencia, c.responsavel
    from candidatas c
   where c.data_k >= p_de and c.data_k < p_ate
     and c.data_k > greatest(now(), c.inicio)
     and not exists (select 1 from agenda.eventos x
                      where x.serie_id = c.serie_id and x.ocorrencia_n = c.k)
   order by c.data_k;
$$;

revoke all on function agenda.projetar_ocorrencias(timestamptz, timestamptz) from public, anon;
grant execute on function agenda.projetar_ocorrencias(timestamptz, timestamptz) to authenticated;
