import { useEffect, useRef, useState } from 'react'
import { iniciarGravacao, type Gravacao } from '../lib/recorder'

type Props = {
  desabilitado?: boolean
  onGravado: (audio: Blob) => void
  onErro: (mensagem: string) => void
}

/** Toque para começar, toque de novo para parar. */
export function Recorder({ desabilitado, onGravado, onErro }: Props) {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const gravacao = useRef<Gravacao | null>(null)

  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [gravando])

  // se sair da tela gravando, solta o microfone
  useEffect(() => () => gravacao.current?.cancelar(), [])

  async function alternar() {
    if (!gravando) {
      try {
        gravacao.current = await iniciarGravacao()
        setSegundos(0)
        setGravando(true)
      } catch {
        onErro('Não consegui acessar o microfone. Verifique a permissão do navegador.')
      }
      return
    }
    const g = gravacao.current!
    setGravando(false)
    gravacao.current = null
    onGravado(await g.parar())
  }

  const mmss = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`

  return (
    <div className="recorder">
      <button
        type="button"
        className={`recorder__botao ${gravando ? 'recorder__botao--on' : ''}`}
        onClick={alternar}
        disabled={desabilitado}
        aria-label={gravando ? 'Parar gravação' : 'Começar a gravar'}
      >
        {gravando ? '■' : '🎙'}
      </button>
      <p className="recorder__legenda">
        {gravando ? `Gravando… ${mmss}` : 'Toque e fale: “reunião com o cliente sexta às 15h, me avisa 30 minutos antes”'}
      </p>
    </div>
  )
}
