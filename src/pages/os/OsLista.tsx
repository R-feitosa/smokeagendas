import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOsContexto } from '../../hooks/useOsContexto'
import {
  calcularIndicadores, estaAtrasada, exportarCsv, listarOS, nomeMembro, ROTULO_PRIORIDADE, ROTULO_STATUS,
} from '../../lib/os'
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
  const [tecnico, setTecnico] = useState('') // '' = todos · '-' = a definir · uuid
  const ctx = useOsContexto()
  const gestor = ctx.equipes.some((e) => e.meu_papel === 'gestor')
  const membros = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of ctx.equipes) for (const x of e.membros) m.set(x.user_id, x.nome ?? 'Sem nome')
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [ctx.equipes])
  const nomeTec = (o: OrdemServico) => (o.equipe_id ? nomeMembro(ctx.equipes, o.tecnico_id) : o.tecnico)

  useEffect(() => {
    listarOS()
      .then(setLista)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [])

  const porTecnico = useMemo(
    () => (tecnico === '' ? lista : lista.filter((o) => (tecnico === '-' ? !o.tecnico_id : o.tecnico_id === tecnico))),
    [lista, tecnico],
  )
  const kpi = useMemo(() => calcularIndicadores(porTecnico), [porTecnico])

  // painel do gestor: carga e desempenho por técnico (OS das equipes)
  const painel = useMemo(() => {
    if (!gestor) return []
    const grupos = new Map<string, OrdemServico[]>()
    for (const o of lista.filter((x) => x.equipe_id)) {
      const k = o.tecnico_id ?? '-'
      grupos.set(k, [...(grupos.get(k) ?? []), o])
    }
    return [...grupos.entries()]
      .map(([k, os]) => ({ k, nome: k === '-' ? 'A definir' : nomeMembro(ctx.equipes, k) ?? 'Ex-membro', ...calcularIndicadores(os) }))
      .sort((a, b) => b.abertas - a.abertas)
  }, [gestor, lista, ctx.equipes])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return porTecnico.filter((o) => {
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
  }, [porTecnico, filtro, busca])

  return (
    <section>
      <div className="titulo-acao">
        <h2>Ordens de Serviço</h2>
        <div className="titulo-acao__botoes">
          {ctx.equipes.length > 0 && <Link to="/os/equipe" className="btn btn--sec btn--peq">👥 Equipe</Link>}
          <Link to="/os/nova" className="btn btn--peq">+ Nova OS</Link>
        </div>
      </div>

      {membros.length > 0 && (
        <select className="busca" value={tecnico} onChange={(e) => setTecnico(e.target.value)} aria-label="Filtrar por técnico">
          <option value="">Todos os técnicos</option>
          <option value="-">A definir (sem técnico)</option>
          {membros.map(([id, nome]) => (
            <option key={id} value={id}>{id === ctx.meuId ? `${nome} (eu)` : nome}</option>
          ))}
        </select>
      )}

      <div className="kpis">
        <div className="kpi"><span>{kpi.abertas}</span>em aberto</div>
        <div className={`kpi ${kpi.atrasadas ? 'kpi--alerta' : ''}`}><span>{kpi.atrasadas}</span>atrasadas</div>
        <div className="kpi"><span>{kpi.concluidasMes}</span>concluídas no mês</div>
        <div className="kpi"><span>{kpi.noPrazoPct != null ? `${kpi.noPrazoPct}%` : '—'}</span>no prazo (mês)</div>
        <div className="kpi"><span>{kpi.tempoMedioH != null ? `${kpi.tempoMedioH}h` : '—'}</span>tempo médio</div>
      </div>

      {painel.length > 0 && tecnico === '' && (
        <details className="painel">
          <summary>Painel por técnico</summary>
          <table>
            <thead>
              <tr><th>Técnico</th><th>Abertas</th><th>Atras.</th><th>Concl. mês</th><th>No prazo</th><th>Tempo méd.</th></tr>
            </thead>
            <tbody>
              {painel.map((p) => (
                <tr key={p.k} onClick={() => setTecnico(p.k)}>
                  <td>{p.nome}</td><td>{p.abertas}</td>
                  <td className={p.atrasadas ? 'erro' : ''}>{p.atrasadas}</td>
                  <td>{p.concluidasMes}</td>
                  <td>{p.noPrazoPct != null ? `${p.noPrazoPct}%` : '—'}</td>
                  <td>{p.tempoMedioH != null ? `${p.tempoMedioH}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

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
                  {nomeTec(o) ? ` · 👤 ${nomeTec(o)}` : o.equipe_id ? ' · 👤 a definir' : ''}
                  {estaAtrasada(o) ? ' · ⚠️ atrasada' : ''}
                </small>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {lista.length > 0 && (
        <button className="btn btn--sec btn--bloco" onClick={() => exportarCsv(visiveis, ctx.equipes)}>
          ⬇️ Exportar planilha (CSV) — {visiveis.length} OS
        </button>
      )}
    </section>
  )
}
