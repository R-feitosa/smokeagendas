import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarVistorias, semTabelasDeApartamentos, type VistoriaComUnidade } from '../lib/api'
import { dataBr, progresso, rotuloUnidade } from '../lib/vistoria'

/** Lista: vistorias em andamento (a fazer) e concluídas. Abre o checklist ao tocar. */
export function Vistorias() {
  const [lista, setLista] = useState<VistoriaComUnidade[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    listarVistorias()
      .then(setLista)
      .catch((e) =>
        setErro(
          semTabelasDeApartamentos(e)
            ? 'As vistorias ainda não existem no servidor (falta aplicar a migration 0010_vistorias).'
            : 'Não foi possível carregar as vistorias.',
        ),
      )
  }, [])

  const abertas = lista?.filter((v) => v.status === 'em_andamento') ?? []
  const concluidas = lista?.filter((v) => v.status === 'concluida') ?? []

  const item = (v: VistoriaComUnidade) => {
    const p = progresso(v)
    return (
      <li key={v.id}>
        <Link to={`/vistorias/${v.id}`} className={`vist-item vist-item--${v.status}`}>
          <span className="vist-item__texto">
            <strong>{rotuloUnidade(v.predio_nome, v.numero, v.tipo_unidade)}</strong>
            <small>
              {v.status === 'concluida'
                ? `Concluída em ${dataBr(v.data_vistoria)}${v.vistoriador_nome ? ` · ${v.vistoriador_nome}` : ''}${p.ruins.length ? ` · ${p.ruins.length} ${p.ruins.length === 1 ? 'item ruim' : 'itens ruins'}` : ''}`
                : `${p.avaliados} de ${p.total} itens · aberta em ${dataBr(v.criada_em.slice(0, 10))}`}
            </small>
          </span>
          <span className="vist-item__selo">{v.status === 'concluida' ? 'Concluída' : 'Fazer'}</span>
        </Link>
      </li>
    )
  }

  return (
    <section>
      <h2>Vistorias</h2>
      <p className="sub">Checklist de saída: abre sozinho quando uma unidade de locação fica vaga.</p>
      {erro && <p className="erro">{erro}</p>}
      {!lista && !erro && <p className="vazio">Carregando…</p>}
      {lista && (
        <>
          <h3 className="painel__secao">A fazer · {abertas.length}</h3>
          {abertas.length === 0 ? (
            <p className="vazio">Nenhuma vistoria pendente. Ela aparece aqui quando uma unidade for marcada como vaga.</p>
          ) : (
            <ul className="vist-lista">{abertas.map(item)}</ul>
          )}
          {concluidas.length > 0 && (
            <>
              <h3 className="painel__secao">Concluídas</h3>
              <ul className="vist-lista">{concluidas.map(item)}</ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
