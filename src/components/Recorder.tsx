import { useCallback, useEffect, useRef, useState } from 'react'
import { DURACAO_MAX_MS, DURACAO_MIN_MS, ErroGravacao, iniciarGravacao, type Gravacao } from '../lib/recorder'

type Props = {
  /** chamado quando a gravação realmente começa (para limpar erros antigos) */
  onComecar?: () => void
  onGravado: (audio: Blob) => void
  onErro: (mensagem: string) => void
}

function mmss(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const IconeMic = ({ tamanho = 48 }: { tamanho?: number }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </svg>
)
const IconeParar = () => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
)

/** Toque para começar, toque de novo para parar. Para sozinho em 2 minutos. */
export function Recorder({ onComecar, onGravado, onErro }: Props) {
  const [iniciando, setIniciando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [decorrido, setDecorrido] = useState(0)
  const gravacao = useRef<Gravacao | null>(null)
  const inicio = useRef(0)
  const montado = useRef(false)
  const halo = useRef<HTMLDivElement>(null)
  // os callbacks mudam a cada render; o cronômetro precisa sempre dos mais recentes
  const cb = useRef({ onComecar, onGravado, onErro })
  cb.current = { onComecar, onGravado, onErro }

  useEffect(() => {
    montado.current = true
    // se sair da tela gravando, solta o microfone
    return () => {
      montado.current = false
      gravacao.current?.cancelar()
      gravacao.current = null
    }
  }, [])

  const finalizar = useCallback(async () => {
    const g = gravacao.current
    if (!g) return // já finalizado (toque + limite de tempo ao mesmo tempo)
    gravacao.current = null
    const duracao = Date.now() - inicio.current
    setGravando(false)
    setDecorrido(0)
    const audio = await g.parar()
    if (duracao < DURACAO_MIN_MS) {
      cb.current.onErro('Gravação muito curta. Toque no microfone e fale por alguns segundos.')
      return
    }
    cb.current.onGravado(audio)
  }, [])

  const cancelar = useCallback(() => {
    gravacao.current?.cancelar()
    gravacao.current = null
    setGravando(false)
    setDecorrido(0)
  }, [])

  // cronômetro pelo relógio (não por contagem de ticks, que atrasa com a aba em segundo plano)
  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => {
      const ms = Date.now() - inicio.current
      setDecorrido(ms)
      if (ms >= DURACAO_MAX_MS) void finalizar()
    }, 250)
    return () => clearInterval(t)
  }, [gravando, finalizar])

  // medidor de volume: escreve direto no estilo, sem re-renderizar a cada frame
  useEffect(() => {
    if (!gravando) return
    let raf = 0
    const quadro = () => {
      halo.current?.style.setProperty('--nivel', (gravacao.current?.nivel() ?? 0).toFixed(3))
      raf = requestAnimationFrame(quadro)
    }
    raf = requestAnimationFrame(quadro)
    return () => cancelAnimationFrame(raf)
  }, [gravando])

  async function alternar() {
    if (gravando) return void finalizar()
    setIniciando(true)
    try {
      const g = await iniciarGravacao()
      if (!montado.current) return g.cancelar() // saiu da tela enquanto o navegador pedia permissão
      gravacao.current = g
      inicio.current = Date.now()
      setDecorrido(0)
      setGravando(true)
      cb.current.onComecar?.()
      navigator.vibrate?.(15)
    } catch (e) {
      cb.current.onErro(e instanceof ErroGravacao ? e.message : 'Não consegui iniciar a gravação.')
    } finally {
      setIniciando(false)
    }
  }

  const restante = Math.max(0, DURACAO_MAX_MS - decorrido)

  return (
    <div className="recorder">
      <div className="recorder__palco">
        <div ref={halo} className={`recorder__halo ${gravando ? 'recorder__halo--on' : ''}`} aria-hidden="true" />
        <button
          type="button"
          className={`recorder__botao ${gravando ? 'recorder__botao--on' : ''}`}
          onClick={alternar}
          disabled={iniciando}
          aria-label={gravando ? 'Parar e criar o compromisso' : 'Começar a gravar'}
        >
          {gravando ? <IconeParar /> : <IconeMic />}
        </button>
      </div>

      <div className="recorder__status" role="status" aria-live="polite">
        {iniciando && <p>Aguardando o microfone…</p>}
        {!iniciando && !gravando && <p className="recorder__dica">Toque no microfone e fale</p>}
        {gravando && (
          <>
            <p className="recorder__tempo">{mmss(decorrido)}</p>
            <p className="recorder__dica">
              {restante <= 15_000 ? `Encerra em ${Math.ceil(restante / 1000)} s` : 'Gravando… toque para terminar'}
            </p>
          </>
        )}
      </div>

      {gravando && (
        <button type="button" className="btn btn--sec" onClick={cancelar}>
          Cancelar
        </button>
      )}
    </div>
  )
}
