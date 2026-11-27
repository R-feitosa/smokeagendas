import { useRef, useState } from 'react'
import { enviarFoto, excluirFoto, legendarFoto, ROTULO_MOMENTO } from '../lib/os'
import type { FotoOS, MomentoFoto, OrdemServico } from '../lib/types'

type Props = {
  os: OrdemServico
  fotos: FotoOS[]
  onMudou: () => void
}

const MOMENTOS: MomentoFoto[] = ['antes', 'durante', 'depois']

/** Fotos por momento: câmera direto no celular, várias de uma vez, legenda e remoção. */
export function OsFotos({ os, fotos, onMudou }: Props) {
  const travada = os.status === 'concluida' || os.status === 'cancelada'

  return (
    <div className="fotos">
      {MOMENTOS.map((m) => (
        <GrupoFotos key={m} os={os} momento={m} fotos={fotos.filter((f) => f.momento === m)} travada={travada} onMudou={onMudou} />
      ))}
    </div>
  )
}

function GrupoFotos({
  os, momento, fotos, travada, onMudou,
}: { os: OrdemServico; momento: MomentoFoto; fotos: FotoOS[]; travada: boolean; onMudou: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const obrigatoria = momento !== 'durante'

  async function aoEscolher(arquivos: FileList | null) {
    if (!arquivos?.length) return
    setErro(null)
    const lista = Array.from(arquivos)
    try {
      for (let i = 0; i < lista.length; i++) {
        setEnviando(`Enviando ${i + 1} de ${lista.length}…`)
        await enviarFoto(os, momento, lista[i])
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar')
    } finally {
      setEnviando(null)
      if (input.current) input.current.value = ''
      onMudou()
    }
  }

  return (
    <section className="fotos__grupo">
      <header className="fotos__cab">
        <strong>
          {ROTULO_MOMENTO[momento]} <span className={`selo ${fotos.length ? 'selo--ok' : obrigatoria ? 'selo--falta' : ''}`}>{fotos.length}</span>
        </strong>
        {!travada && (
          <button type="button" className="btn btn--sec btn--peq" onClick={() => input.current?.click()} disabled={!!enviando}>
            📷 Adicionar
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => aoEscolher(e.target.files)}
        />
      </header>
      {enviando && <p className="sub">{enviando}</p>}
      {erro && <p className="erro">{erro}</p>}
      {fotos.length === 0 && !enviando && (
        <p className="vazio">{obrigatoria ? `Obrigatória para concluir.` : 'Opcional.'}</p>
      )}
      <ul className="fotos__grade">
        {fotos.map((f) => (
          <Miniatura key={f.id} foto={f} travada={travada} onMudou={onMudou} onErro={setErro} />
        ))}
      </ul>
    </section>
  )
}

function Miniatura({
  foto, travada, onMudou, onErro,
}: { foto: FotoOS; travada: boolean; onMudou: () => void; onErro: (m: string) => void }) {
  return (
    <li className="foto">
      <a href={foto.url} target="_blank" rel="noreferrer">
        {foto.url ? <img src={foto.url} alt={foto.legenda ?? 'Foto da OS'} loading="lazy" /> : <span>sem prévia</span>}
      </a>
      <small>{new Date(foto.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>
      {foto.legenda && <small className="foto__legenda">{foto.legenda}</small>}
      {!travada && (
        <div className="foto__acoes">
          <button
            type="button"
            aria-label="Legenda"
            onClick={async () => {
              const l = window.prompt('Legenda da foto', foto.legenda ?? '')
              if (l === null) return
              try {
                await legendarFoto(foto.id, l)
                onMudou()
              } catch (e) {
                onErro(e instanceof Error ? e.message : 'Falha')
              }
            }}
          >
            ✏️
          </button>
          <button
            type="button"
            aria-label="Remover foto"
            onClick={async () => {
              if (!window.confirm('Remover esta foto? A remoção fica registrada no histórico.')) return
              try {
                await excluirFoto(foto)
                onMudou()
              } catch (e) {
                onErro(e instanceof Error ? e.message : 'Falha')
              }
            }}
          >
            🗑
          </button>
        </div>
      )}
    </li>
  )
}
