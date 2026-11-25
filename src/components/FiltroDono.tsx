import type { FiltroDono as Filtro } from '../lib/equipe'

type Props = { filtro: Filtro; onMudar: (f: Filtro) => void; equipe: string[] }

/** Tudo | Minha | Equipe — só aparece para quem tem equipe cadastrada. */
export function FiltroDono({ filtro, onMudar, equipe }: Props) {
  if (equipe.length === 0) return null
  const opcoes: [Filtro, string][] = [
    ['tudo', 'Tudo'],
    ['minha', 'Minha'],
    ['equipe', 'Equipe'],
  ]
  return (
    <div className="filtro-dono" role="group" aria-label="De quem é">
      {opcoes.map(([f, rotulo]) => (
        <button key={f} type="button" aria-pressed={filtro === f} onClick={() => onMudar(f)}>
          {rotulo}
        </button>
      ))}
      {filtro === 'equipe' && <span className="filtro-dono__quem">{equipe.join(' · ')}</span>}
    </div>
  )
}
