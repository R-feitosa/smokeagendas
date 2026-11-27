import { useState } from 'react'
import { salvarChecklist } from '../lib/os'
import type { ItemChecklist, OrdemServico, RespostaChecklist } from '../lib/types'

type Props = { os: OrdemServico; travada: boolean; onSalvo: (os: OrdemServico) => void }

const OPCOES: [Exclude<RespostaChecklist, null>, string][] = [
  ['ok', 'OK'],
  ['nao_ok', 'Não OK'],
  ['na', 'N/A'],
]

/** Cada toque salva na hora (bom para quem está em campo). Concluir exige tudo respondido. */
export function OsChecklist({ os, travada, onSalvo }: Props) {
  const [itens, setItens] = useState<ItemChecklist[]>(os.checklist ?? [])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(novo: ItemChecklist[]) {
    const anterior = itens
    setItens(novo)
    setSalvando(true)
    setErro(null)
    try {
      onSalvo(await salvarChecklist(os.id, novo))
    } catch (e) {
      setItens(anterior)
      setErro(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  const responder = (i: number, r: RespostaChecklist) =>
    gravar(itens.map((it, j) => (j === i ? { ...it, resposta: it.resposta === r ? null : r } : it)))

  if (itens.length === 0 && travada) return <p className="vazio">Sem checklist.</p>

  return (
    <div className="checklist-os">
      {itens.length === 0 && <p className="vazio">Escolha a categoria do equipamento nos dados da OS para carregar o checklist, ou inclua itens.</p>}
      <ol>
        {itens.map((it, i) => (
          <li key={`${i}-${it.item}`} className={`ck ck--${it.resposta ?? 'pendente'}`}>
            <div className="ck__item">{it.item}</div>
            <div className="ck__botoes" role="group" aria-label={it.item}>
              {OPCOES.map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  disabled={travada || salvando}
                  className={`ck__btn ${it.resposta === v ? `ck__btn--${v}` : ''}`}
                  aria-pressed={it.resposta === v}
                  onClick={() => responder(i, v)}
                >
                  {r}
                </button>
              ))}
            </div>
            {(it.obs || it.resposta === 'nao_ok') && (
              <input
                className="ck__obs"
                placeholder="Observação"
                defaultValue={it.obs ?? ''}
                maxLength={500}
                disabled={travada}
                onBlur={(e) => {
                  const obs = e.target.value.trim()
                  if (obs !== (it.obs ?? '')) gravar(itens.map((x, j) => (j === i ? { ...x, obs: obs || undefined } : x)))
                }}
              />
            )}
            {!travada && (
              <button
                type="button"
                className="ck__remover"
                aria-label="Remover item"
                onClick={() => window.confirm(`Remover "${it.item}" do checklist?`) && gravar(itens.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      {!travada && (
        <button
          type="button"
          className="btn btn--sec btn--peq"
          disabled={salvando || itens.length >= 60}
          onClick={() => {
            const item = window.prompt('Novo item do checklist')?.trim()
            if (item) gravar([...itens, { item: item.slice(0, 200), resposta: null }])
          }}
        >
          + Item
        </button>
      )}
      {erro && <p className="erro">{erro}</p>}
    </div>
  )
}
