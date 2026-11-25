import type { Evento, Recorrencia } from '../lib/types'
import { hora, rotuloAntecedencia } from '../lib/datas'

const REPETE: Record<NonNullable<Recorrencia>, string> = {
  diaria: 'repete todo dia',
  semanal: 'repete toda semana',
  mensal: 'repete todo mês',
}

type Props = {
  evento: Evento
  onConcluir: (id: string) => void
  onExcluir: (id: string) => void
}

export function EventCard({ evento, onConcluir, onExcluir }: Props) {
  const feito = evento.status === 'concluido'
  return (
    <li className={`card ${feito ? 'card--feito' : ''} ${evento.prevista ? 'card--prevista' : ''}`}>
      <div className="card__hora">{hora(evento.inicio)}</div>
      <div className="card__corpo">
        {evento.responsavel && <span className="selo selo--pessoa">{evento.responsavel}</span>}
        <strong>{evento.titulo}</strong>
        {evento.descricao && <p>{evento.descricao}</p>}
        <small>
          🔔 {evento.lembrar_min_antes > 0 ? `${rotuloAntecedencia(evento.lembrar_min_antes)} antes` : rotuloAntecedencia(0)}
          {evento.recorrencia ? ` · ${REPETE[evento.recorrencia]}` : ''}
        </small>
        {evento.prevista && <span className="selo">Prevista</span>}
      </div>
      {!evento.prevista && (
        <div className="card__acoes">
          {!feito && (
            <button aria-label="Concluir" onClick={() => onConcluir(evento.id)}>
              ✓
            </button>
          )}
          <button aria-label="Excluir" onClick={() => onExcluir(evento.id)}>
            ✕
          </button>
        </div>
      )}
    </li>
  )
}
