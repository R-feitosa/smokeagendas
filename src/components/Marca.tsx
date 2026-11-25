import { useId, type Ref } from 'react'

/**
 * Marca Feitosa Participações Imobiliárias, redesenhada em vetor a partir da arte original:
 * prédio de quatro lajes escalonadas, a de cima com telhado inclinado.
 * Se houver o arquivo original (SVG/PNG transparente), substituir aqui.
 */
export function MarcaIcone({ altura = 32, refIcone }: { altura?: number; refIcone?: Ref<SVGSVGElement> }) {
  const g = useId()
  return (
    <svg ref={refIcone} viewBox="0 0 265 235" height={altura} width={(altura * 265) / 235} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d5dbe4" />
        </linearGradient>
      </defs>
      <g fill={`url(#${g})`}>
        <polygon points="0,57 170,0 265,45 265,88 0,88" />
        <rect x="0" y="100" width="235" height="35" />
        <rect x="0" y="147" width="265" height="38" />
        <rect x="0" y="197" width="235" height="38" />
      </g>
    </svg>
  )
}

type Props = { tamanho?: 'p' | 'g'; refIcone?: Ref<SVGSVGElement> }

/** Ícone + "FEITOSA" + "Participações Imobiliárias" (sempre sobre fundo azul-marinho) */
export function Marca({ tamanho = 'p', refIcone }: Props) {
  return (
    <div className={`marca marca--${tamanho}`} role="img" aria-label="Feitosa Participações Imobiliárias">
      <MarcaIcone altura={tamanho === 'g' ? 64 : 30} refIcone={refIcone} />
      <div className="marca__texto" aria-hidden="true">
        <span className="marca__nome">Feitosa</span>
        <span className="marca__sub">Participações Imobiliárias</span>
      </div>
    </div>
  )
}

/** telhado do prédio, em fração do ícone: é dali que a fumaça sai */
export const CHAMINE = { x: 0.64, y: 0.03 }
