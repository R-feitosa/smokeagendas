import { useEffect, useRef, useState } from 'react'
import { salvarAssinatura, urlAssinada } from '../lib/os'
import type { OrdemServico } from '../lib/types'

type Props = { os: OrdemServico; travada: boolean; onSalvo: (os: OrdemServico) => void }

/** Assinatura do cliente com o dedo, na tela. Fica guardada como PNG e entra no PDF. */
export function OsAssinatura({ os, travada, onSalvo }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [assinando, setAssinando] = useState(false)

  useEffect(() => {
    urlAssinada(os.assinatura_caminho).then(setUrl)
  }, [os.assinatura_caminho])

  if (assinando) {
    return (
      <Quadro
        nomeInicial={os.assinatura_nome ?? os.solicitante ?? ''}
        onCancelar={() => setAssinando(false)}
        onSalvar={async (png, nome) => {
          const nova = await salvarAssinatura(os, png, nome)
          setAssinando(false)
          onSalvo(nova)
        }}
      />
    )
  }

  if (os.assinatura_caminho) {
    return (
      <div className="assinatura">
        {url && <img src={url} alt={`Assinatura de ${os.assinatura_nome}`} />}
        <p>
          <strong>{os.assinatura_nome}</strong>
          <br />
          <small>Assinado em {os.assinado_em ? new Date(os.assinado_em).toLocaleString('pt-BR') : '—'}</small>
        </p>
        {!travada && (
          <button className="btn btn--sec btn--peq" onClick={() => setAssinando(true)}>Refazer assinatura</button>
        )}
      </div>
    )
  }

  if (travada) return <p className="vazio">Sem assinatura do cliente.</p>
  return (
    <button className="btn btn--sec btn--bloco" onClick={() => setAssinando(true)}>
      ✍️ Colher assinatura do cliente
    </button>
  )
}

function Quadro({
  nomeInicial, onCancelar, onSalvar,
}: { nomeInicial: string; onCancelar: () => void; onSalvar: (png: Blob, nome: string) => Promise<void> }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const [vazio, setVazio] = useState(true)
  const [nome, setNome] = useState(nomeInicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = r.width * dpr
    c.height = r.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  function limpar() {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setVazio(true)
  }

  async function salvar() {
    if (vazio || !nome.trim()) return
    setSalvando(true)
    setErro(null)
    try {
      const png = await new Promise<Blob | null>((ok) => canvas.current!.toBlob(ok, 'image/png'))
      if (!png) throw new Error('Falha ao gerar a imagem')
      await onSalvar(png, nome)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar')
      setSalvando(false)
    }
  }

  return (
    <div className="form">
      <canvas
        ref={canvas}
        className="assinatura__quadro"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          desenhando.current = true
          const ctx = e.currentTarget.getContext('2d')!
          const [x, y] = ponto(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + 0.1, y + 0.1)
          ctx.stroke()
          setVazio(false)
        }}
        onPointerMove={(e) => {
          if (!desenhando.current) return
          const ctx = e.currentTarget.getContext('2d')!
          const [x, y] = ponto(e)
          ctx.lineTo(x, y)
          ctx.stroke()
        }}
        onPointerUp={() => (desenhando.current = false)}
        onPointerCancel={() => (desenhando.current = false)}
      />
      <small className="sub">Assine com o dedo dentro do quadro.</small>
      <label>
        Nome de quem assinou *
        <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Nome e função (ex.: Maria, gerente da loja)" />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="form__acoes">
        <button type="button" className="btn btn--sec" onClick={onCancelar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn btn--sec" onClick={limpar} disabled={salvando}>Limpar</button>
        <button type="button" className="btn" onClick={salvar} disabled={salvando || vazio || !nome.trim()}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
