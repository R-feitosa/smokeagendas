import { useRef } from 'react'
import { Fumaca, type FumacaHandle } from './Fumaca'
import { CHAMINE, Marca } from './Marca'

/** Marca grande com fumaça saindo do telhado; tocar solta uma baforada. */
export function MarcaFumegante() {
  const icone = useRef<SVGSVGElement>(null)
  const fumaca = useRef<FumacaHandle>(null)
  return (
    <button type="button" className="login__marca" onClick={() => fumaca.current?.rajada()} aria-label="Feitosa Participações Imobiliárias">
      <Fumaca ref={fumaca} className="marca__fumaca" fonte={icone} ponto={CHAMINE} taxa={5} aneis={0.45} vento={6} escala={1.15} />
      <Marca tamanho="g" refIcone={icone} />
    </button>
  )
}
