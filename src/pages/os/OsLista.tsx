import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { calcularIndicadores, estaAtrasada, exportarCsv, listarOS, ROTULO_PRIORIDADE, ROTULO_STATUS } from '../../lib/os'
import type { OrdemServico } from '../../lib/types'

type Filtro = 'ativas' | 'atrasadas' | 'concluida' | 'cancelada' | 'todas'

const FILTROS: [Filtro, string][] = [
  ['ativas', 'Em aberto'],
  ['atrasadas', 'Atrasadas'],
  ['concluida', 'Concluídas'],
  ['cancelada', 'Canceladas'],
  ['todas', 'Todas'],
]

export function OsLista() {
  const [lista, setLista] = useState<OrdemServico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('ativas')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    listarOS()
      .then(setLista)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [])

  const kpi = useMemo(() => calcularIndicadores(lista), [lista])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((o) => {
      const passa =
        filtro === 'todas' ? true
        : filtro === 'ativas' ? ['aberta', 'em_andamento', 'aguardando_peca'].includes(o.status)
        : filtro === 'atrasadas' ? estaAtrasada(o)
        : o.status === filtro
      if (!passa) return false
      if (!q) return true
      return [o.numero, o.cliente, o.unidade, o.equipamento, o.modelo, o.numero_serie, o.patrimonio, o.problema, o.tecnico]
        .some((c) => c?.toLowerCase().includes(q))
    })
  }, [lista, filtro, busca])

  return (
    <section>
      <div className="titulo-acao">
        <h2>Ordens de Serviço</h2>
        <Link to="/os/nova" className="btn btn--peq">+ Nova OS</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><span>{kpi.abertas}</span>em aberto</div>
        <div className={`kpi ${kpi.atrasadas ? 'kpi--alerta' : ''}`}><span>{kpi.atrasadas}</span>atrasadas</div>
        <div className="kpi"><span>{kpi.concluidasMes}</span>concluídas no mês</div>
        <div className="kpi"><span>{kpi.noPrazoPct != null ? `${kpi.noPrazoPct}%` : '—'}</span>no prazo (mês)</div>
        <div className="kpi"><span>{kpi.tempoMedioH != null ? `${kpi.tempoMedioH}h` : '—'}</span>tempo médio</div>
      </div>

      <input
        className="busca"
        type="search"
        placeholder="Buscar nº, equipamento, série, unidade…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="chips">
        {FILTROS.map(([v, r]) => (
          <button key={v} className={`chip ${filtro === v ? 'chip--on' : ''}`} onClick={() => setFiltro(v)}>
            {r}
          </button>
        ))}
      </div>

      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}
      {!carregando && !erro && visiveis.length === 0 && <p className="vazio">Nenhuma OS neste filtro.</p>}

      <ul className="lista">
        {visiveis.map((o) => (
          <li key={o.id}>
            <Link to={`/os/${o.id}`} className={`card card--link ${estaAtrasada(o) ? 'card--atraso' : ''}`}>
              <div className="card__corpo">
                <div className="os__topo">
                  <strong>{o.numero}</strong>
                  <span className={`status status--${o.status}`}>{ROTULO_STATUS[o.status]}</span>
                </div>
                <p>{[o.equipamento, o.modelo].filter(Boolean).join(' · ') || o.problema}</p>
                <small>
                  {o.cliente}{o.unidade ? ` · ${o.unidade}` : ''} · prioridade {ROTULO_PRIORIDADE[o.prioridade].toLowerCase()}
                  {o.prazo ? ` · prazo ${new Date(o.prazo).toLocaleDateString('pt-BR')}` : ''}
                  {estaAtrasada(o) ? ' · ⚠️ atrasada' : ''}
                </small>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {lista.length > 0 && (
        <button className="btn btn--sec btn--bloco" onClick={() => exportarCsv(visiveis)}>
          ⬇️ Exportar planilha (CSV) — {visiveis.length} OS
        </button>
      )}
    </section>
  )
}
