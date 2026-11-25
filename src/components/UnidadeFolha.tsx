import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nomeUnidade, rotuloStatus } from '../lib/apartamentos'
import { dataCurta, hora, tempoDesde } from '../lib/datas'
import type { Predio, StatusUnidade, Unidade } from '../lib/types'

type Props = {
  predio: Predio
  unidade: Unidade
  /** grava o novo status; rejeita se o servidor recusar */
  onMudar: (status: StatusUnidade) => Promise<void>
  onFechar: () => void
}

const tracos = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
/** chave de volta no escritório */
const IconeVago = () => (
  <svg {...tracos}>
    <circle cx="7.5" cy="15.5" r="4" />
    <path d="M10.4 12.6 20 3M16.5 6.5l3 3M13.5 9.5l2.2 2.2" />
  </svg>
)
/** tem gente */
const IconeOcupado = () => (
  <svg {...tracos}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20.2c.7-3.9 3.5-6.2 7.2-6.2s6.5 2.3 7.2 6.2" />
  </svg>
)

const OPCOES: [StatusUnidade, () => JSX.Element][] = [
  ['vago', IconeVago],
  ['ocupado', IconeOcupado],
]
const TEMPO_SAIDA = 190 // ms, igual à animação folha-desce

/**
 * Folha que sobe ao tocar numa unidade: mostra o status atual e deixa escolher
 * Vago ou Ocupado. Escolher o outro grava na hora; escolher o atual só fecha.
 */
export function UnidadeFolha({ predio, unidade, onMudar, onFechar }: Props) {
  const dlg = useRef<HTMLDialogElement>(null)
  const saida = useRef<number>()
  const [saindo, setSaindo] = useState(false)
  const [salvando, setSalvando] = useState<StatusUnidade | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // <dialog> modal: prende o foco, fecha no Esc e devolve o foco à unidade ao fechar
  useLayoutEffect(() => {
    const d = dlg.current
    if (!d || d.open) return
    d.showModal()
    // foco no status atual: um Enter a mais não muda nada por engano
    d.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true })
  }, [])
  useEffect(() => () => window.clearTimeout(saida.current), [])

  function fechar() {
    if (saindo) return
    const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (semMovimento) return dlg.current?.close()
    setSaindo(true)
    saida.current = window.setTimeout(() => dlg.current?.close(), TEMPO_SAIDA)
  }

  async function escolher(status: StatusUnidade) {
    if (salvando) return
    if (status === unidade.status) return fechar()
    setSalvando(status)
    setErro(null)
    try {
      await onMudar(status)
      setSalvando(null)
      fechar()
    } catch {
      setErro('Não foi possível salvar. Confira a conexão e tente de novo.')
      setSalvando(null)
    }
  }

  const desde = unidade.status_desde ? new Date(unidade.status_desde) : null

  return (
    <dialog
      ref={dlg}
      className={`folha ${saindo ? 'folha--saindo' : ''}`}
      aria-labelledby="folha-titulo"
      onClose={onFechar}
      onCancel={(e) => {
        e.preventDefault() // Esc: fecha com a mesma animação (e não fecha no meio de um salvamento)
        if (!salvando) fechar()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !salvando) fechar() // toque fora da folha
      }}
    >
      <div className="folha__corpo">
        <span className="folha__alca" aria-hidden="true" />
        <p className="folha__predio">{predio.nome}</p>
        <h3 className="folha__titulo" id="folha-titulo">
          {nomeUnidade(predio, unidade)}
        </h3>
        <p className="folha__status">
          <i className={`aptos__marca aptos__marca--${unidade.status}`} aria-hidden="true" />
          <strong>{rotuloStatus(unidade.status)}</strong>
          {desde ? ` desde ${dataCurta(desde)} (${tempoDesde(desde)})` : ' · sem data de início registrada'}
        </p>

        <div className="folha__opcoes" role="group" aria-label="Como está agora?">
          {OPCOES.map(([status, Icone]) => {
            const atual = status === unidade.status
            return (
              <button
                key={status}
                type="button"
                className={`folha__opcao folha__opcao--${status}`}
                aria-pressed={atual}
                disabled={salvando !== null}
                onClick={() => escolher(status)}
              >
                <Icone />
                <strong>{salvando === status ? 'Salvando…' : rotuloStatus(status)}</strong>
                <small>{atual ? 'está assim agora' : `marcar como ${rotuloStatus(status).toLowerCase()}`}</small>
              </button>
            )
          })}
        </div>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        {unidade.atualizado_em && (
          <p className="folha__rodape">
            Última alteração: {unidade.atualizado_por_nome ? `${unidade.atualizado_por_nome}, ` : ''}
            {dataCurta(new Date(unidade.atualizado_em))} às {hora(unidade.atualizado_em)}
          </p>
        )}

        <button type="button" className="folha__fechar" aria-label="Fechar" disabled={salvando !== null} onClick={fechar}>
          ✕
        </button>
      </div>
    </dialog>
  )
}
