import type { Evento } from '../lib/types'
import { hora, rotuloAntecedencia } from '../lib/datas'

type Props = {
  evento: Evento
  onConcluir: (id: string) => void
  onExcluir: (id: string) => void
}

export function EventCard({ evento, onConcluir, onExcluir }: Props) {
  const feito = evento.status === 'concluido'
  return (
    <li className={`card ${feito ? 'card--feito' : ''}`}>
      <div className="card__hora">{hora(evento.inicio)}</div>
      <div className="card__corpo">
        <strong>{evento.titulo}</strong>
        {evento.descricao && <p>{evento.descricao}</p>}
        <small>
          🔔 {evento.lembrar_min_antes > 0 ? `${rotuloAntecedencia(evento.lembrar_min_antes)} antes` : rotuloAntecedencia(0)}
          {evento.recorrencia ? ` · repete (${evento.recorrencia})` : ''}
        </small>
      </div>
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
    </li>
  )
}
