import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { mudarStatusUnidade } from '../lib/api'
import { rotuloCompleto, rotuloStatus } from '../lib/apartamentos'
import type { Alvo, ComandoApartamento } from '../lib/comandoApartamento'
import type { StatusUnidade } from '../lib/types'

type Linha =
  | { tipo: 'aplicando'; numero: string; alvo: Alvo }
  | { tipo: 'feito'; numero: string; alvo: Alvo; anterior: StatusUnidade }
  | { tipo: 'ja-estava'; numero: string; alvo: Alvo }
  | { tipo: 'erro'; numero: string; alvo: Alvo }
  | { tipo: 'escolher'; numero: string; opcoes: Alvo[] }
  | { tipo: 'nao-existe'; numero: string }

type Props = {
  comando: ComandoApartamento
  transcricao: string | null
  /** "Não era isso": desfaz o que foi aplicado e segue como compromisso */
  onEraCompromisso: () => void
  onGravarOutro: () => void
}

const onde = (a: Alvo) => rotuloCompleto(a.predio, a.unidade)

/**
 * Resultado do comando de voz da aba Apartamentos. O que foi entendido sem dúvida é
 * aplicado na hora (com Desfazer); unidade repetida em vários prédios pergunta qual.
 */
export function ComandoApartamentoResultado({ comando, transcricao, onEraCompromisso, onGravarOutro }: Props) {
  const status = comando.status
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    comando.itens.map((i): Linha =>
      i.opcoes.length === 0
        ? { tipo: 'nao-existe', numero: i.numero }
        : i.opcoes.length > 1
          ? { tipo: 'escolher', numero: i.numero, opcoes: i.opcoes }
          : i.opcoes[0].unidade.status === status
            ? { tipo: 'ja-estava', numero: i.numero, alvo: i.opcoes[0] }
            : { tipo: 'aplicando', numero: i.numero, alvo: i.opcoes[0] },
    ),
  )
  const [desfazendo, setDesfazendo] = useState(false)
  const [desfeito, setDesfeito] = useState(false)
  const iniciou = useRef(false)

  async function aplicar(indice: number, alvo: Alvo) {
    const anterior = alvo.unidade.status
    setLinhas((ls) => ls.map((l, i) => (i === indice ? (anterior === status ? { tipo: 'ja-estava', numero: l.numero, alvo } : { tipo: 'aplicando', numero: l.numero, alvo }) : l)))
    if (anterior === status) return
    try {
      await mudarStatusUnidade(alvo.unidade.id, status)
      setLinhas((ls) => ls.map((l, i) => (i === indice ? { tipo: 'feito', numero: l.numero, alvo, anterior } : l)))
    } catch {
      setLinhas((ls) => ls.map((l, i) => (i === indice ? { tipo: 'erro', numero: l.numero, alvo } : l)))
    }
  }

  // aplica de uma vez o que veio sem dúvida (uma vez só, mesmo com o StrictMode)
  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    linhas.forEach((l, i) => {
      if (l.tipo === 'aplicando') aplicar(i, l.alvo)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const feitos = linhas.filter((l): l is Extract<Linha, { tipo: 'feito' }> => l.tipo === 'feito')

  async function desfazerTudo(): Promise<boolean> {
    setDesfazendo(true)
    const r = await Promise.allSettled(feitos.map((l) => mudarStatusUnidade(l.alvo.unidade.id, l.anterior)))
    setDesfazendo(false)
    const ok = r.every((x) => x.status === 'fulfilled')
    if (ok && feitos.length) setDesfeito(true)
    return ok
  }

  const aplicando = linhas.some((l) => l.tipo === 'aplicando')

  return (
    <div className="comando" role="status">
      {transcricao && <blockquote className="transcricao">“{transcricao}”</blockquote>}
      <h3 className="comando__titulo">
        {desfeito ? 'Alteração desfeita' : `Marcar como ${rotuloStatus(status).toLowerCase()}`}
      </h3>

      <ul className="comando__lista">
        {linhas.map((l, i) => (
          <li key={`${l.numero}-${i}`} className={`comando__item comando__item--${l.tipo}`}>
            {l.tipo === 'escolher' ? (
              <>
                <span>
                  Unidade <strong>{l.numero}</strong> existe em mais de um prédio. Qual?
                </span>
                <span className="comando__opcoes">
                  {l.opcoes.map((a) => (
                    <button key={a.unidade.id} type="button" className="btn btn--sec" onClick={() => aplicar(i, a)}>
                      {a.predio.nome}
                    </button>
                  ))}
                </span>
              </>
            ) : l.tipo === 'nao-existe' ? (
              <span>
                Não achei a unidade <strong>{l.numero}</strong> no quadro. Nada foi alterado.
              </span>
            ) : (
              <>
                <i className={`aptos__marca aptos__marca--${status}`} aria-hidden="true" />
                <span>
                  <strong>{onde(l.alvo)}</strong>
                  {l.tipo === 'aplicando' && ' · salvando…'}
                  {l.tipo === 'feito' && (desfeito ? ` · voltou para ${rotuloStatus(l.anterior).toLowerCase()}` : ` · agora está ${rotuloStatus(status).toLowerCase()}`)}
                  {l.tipo === 'ja-estava' && ` · já estava ${rotuloStatus(status).toLowerCase()}`}
                  {l.tipo === 'erro' && ' · não foi possível salvar'}
                </span>
                {l.tipo === 'erro' && (
                  <button type="button" className="btn btn--sec" onClick={() => aplicar(i, l.alvo)}>
                    Tentar de novo
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="comando__acoes">
        {feitos.length > 0 && !desfeito && (
          <button type="button" className="btn btn--sec" disabled={desfazendo || aplicando} onClick={() => desfazerTudo()}>
            {desfazendo ? 'Desfazendo…' : 'Desfazer'}
          </button>
        )}
        <Link to="/apartamentos" className="btn">
          Ver na aba Apartamentos
        </Link>
      </div>
      <div className="comando__acoes">
        <button type="button" className="btn btn--sec" onClick={onGravarOutro} disabled={aplicando || desfazendo}>
          Gravar outro
        </button>
        <button
          type="button"
          className="btn btn--sec"
          disabled={aplicando || desfazendo}
          onClick={async () => {
            if (desfeito || (await desfazerTudo())) onEraCompromisso()
          }}
        >
          Não era isso: é compromisso
        </button>
      </div>
    </div>
  )
}
