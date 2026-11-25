-- Agenda por Voz — 0004: projeção das repetições para o calendário
--
-- As ocorrências de uma série só são GRAVADAS até 7 dias à frente (0003). Para o
-- calendário mostrar o mês inteiro, esta função CALCULA (sem gravar) as próximas,
-- com exatamente a mesma regra de agenda.gerar_proxima:
--   ocorrência k = (âncora no fuso da pessoa) + k × passo  → de volta para UTC
--   só a partir da "ponta" da série (recorrencia não nula e proxima_gerada_em nula),
--   só no futuro, e nunca um índice que já exista (cancelado inclusive).
-- Série encerrada (encerrar_serie) não tem ponta → não projeta nada.
-- Roda com as permissões de quem chama: RLS vale, cada um só vê as próprias séries.

create function agenda.projetar_ocorrencias(p_de timestamptz, p_ate timestamptz)
returns table (
  serie_id uuid,
  ocorrencia_n integer,
  inicio timestamptz,
  fim timestamptz,
  titulo text,
  descricao text,
  lembrar_min_antes integer,
  recorrencia text
)
language sql stable security invoker set search_path = agenda, pg_catalog as $$
  with ponta as (
    select e.serie_id, e.serie_ancora, e.ocorrencia_n, e.inicio, e.fim, e.titulo, e.descricao,
           e.lembrar_min_antes, e.recorrencia::text as recorrencia, p.fuso,
           case e.recorrencia when 'diaria' then interval '1 day'
                              when 'semanal' then interval '7 days'
                              else interval '1 month' end as passo
      from agenda.eventos e
      join agenda.perfis p on p.id = e.user_id
     where e.recorrencia is not null
       and e.proxima_gerada_em is null
       -- janela de no máximo ~2 meses (a grade do mês tem até 42 dias)
       and p_ate > p_de and p_ate - p_de <= interval '62 days'
  ),
  candidatas as (
    select pt.*, k,
           ((pt.serie_ancora at time zone pt.fuso) + k * pt.passo) at time zone pt.fuso as data_k
      from ponta pt,
           generate_series(pt.ocorrencia_n + 1, pt.ocorrencia_n + 5000) as k
  )
  select c.serie_id, c.k, c.data_k, c.data_k + (c.fim - c.inicio), c.titulo, c.descricao,
         c.lembrar_min_antes, c.recorrencia
    from candidatas c
   where c.data_k >= p_de and c.data_k < p_ate
     and c.data_k > greatest(now(), c.inicio)
     and not exists (select 1 from agenda.eventos x
                      where x.serie_id = c.serie_id and x.ocorrencia_n = c.k)
   order by c.data_k;
$$;

revoke all on function agenda.projetar_ocorrencias(timestamptz, timestamptz) from public, anon;
grant execute on function agenda.projetar_ocorrencias(timestamptz, timestamptz) to authenticated;
