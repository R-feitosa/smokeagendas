import { useId } from 'react'

// fios de fumaça (viewBox 100 x 200), cada um com ritmo próprio no CSS
const FIOS = [
  'M50 200 C 35 165, 65 140, 50 110 S 35 55, 52 20',
  'M46 200 C 60 170, 30 145, 48 115 S 66 60, 44 25',
  'M54 200 C 42 175, 62 150, 52 125 S 40 80, 58 45',
]

type Props = {
  /** posição/tamanho vêm da classe; "escura" é para fundo claro */
  className?: string
  escura?: boolean
}

/** Fumaça subindo, decorativa. Respeita "reduzir movimento" (fica parada e mais fraca). */
export function Fumaca({ className = '', escura = false }: Props) {
  const desfoque = useId()
  return (
    <svg
      className={`fumaca ${escura ? 'fumaca--escura' : ''} ${className}`}
      viewBox="0 0 100 200"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={desfoque} x="-60%" y="-10%" width="220%" height="120%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      {FIOS.map((d, i) => (
        <path key={i} d={d} className={`fumaca__fio fumaca__fio--${i}`} filter={`url(#${desfoque})`} />
      ))}
    </svg>
  )
}
