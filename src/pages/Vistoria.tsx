import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { concluirVistoria, obterVistoria, salvarVistoria, type CamposVistoria, type VistoriaComUnidade } from '../lib/api'
import {
  AVALIACOES,
  DECLARACAO,
  OPERACIONAL,
  SECOES,
  dataBr,
  progresso,
  rotuloUnidade,
  sugerirPendencias,
  type Avaliacao,
} from '../lib/vistoria'

type Gravacao = 'salvo' | 'salvando' | 'pendente' | 'erro'
const ESPERA_MS = 700 // junta toques seguidos num único salvamento

/**
 * Checklist de vistoria de saída (modelo do PDF da Feitosa). Salva sozinho a cada
 * alteração; "Concluir" confere se está completo e trava a vistoria no banco.
 */
export function Vistoria() {
  const { id = '' } = useParams()
  const [v, setV] = useState<VistoriaComUnidade | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gravacao, setGravacao] = useState<Gravacao>('salvo')
  const [concluindo, setConcluindo] = useState(false)
  const [tentouConcluir, setTentouConcluir] = useState(false)
  const pendente = useRef<CamposVistoria>({})
  const timer = useRef<number>()

  useEffect(() => {
    obterVistoria(id)
      .then(setV)
      .catch(() => setErro('Vistoria não encontrada.'))
  }, [id])

  const gravar = useCallback(async () => {
    window.clearTimeout(timer.current)
    const campos = pendente.current
    if (!Object.keys(campos).length) return true
    pendente.current = {}
    setGravacao('salvando')
    try {
      await salvarVistoria(id, campos)
      setGravacao((g) => (g === 'salvando' && !Object.keys(pendente.current).length ? 'salvo' : g))
      return true
    } catch {
      pendente.current = { ...campos, ...pendente.current } // tenta de novo na próxima alteração
      setGravacao('erro')
      return false
    }
  }, [id])

  // salva o que faltar ao sair da tela ou esconder o app
  useEffect(() => {
    const aoSair = () => {
      if (document.visibilityState === 'hidden') gravar()
    }
    document.addEventListener('visibilitychange', aoSair)
    return () => {
      document.removeEventListener('visibilitychange', aoSair)
      gravar()
    }
  }, [gravar])

  function mudar(campos: CamposVistoria) {
    setV((atual) => (atual ? { ...atual, ...campos } : atual))
    pendente.current = { ...pendente.current, ...campos }
    setGravacao('pendente')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(gravar, ESPERA_MS)
  }

  if (erro) return <section><p className="erro">{erro}</p><Link to="/vistorias">Voltar às vistorias</Link></section>
  if (!v) return <section><p className="vazio">Carregando…</p></section>

  const travada = v.status === 'concluida'
  const p = progresso(v)
  const unidade = rotuloUnidade(v.predio_nome, v.numero, v.tipo_unidade)

  function avaliar(item: string, avaliacao: Avaliacao) {
    mudar({ respostas: { ...v!.respostas, [item]: { ...v!.respostas[item], avaliacao } } })
  }
  function observar(item: string, obs: string) {
    mudar({ respostas: { ...v!.respostas, [item]: { ...v!.respostas[item], obs } } })
  }

  async function concluir() {
    setTentouConcluir(true)
    if (p.faltando.length) {
      document.querySelector('.vist-faltando')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!window.confirm('Concluir a vistoria? Depois de concluída ela não pode mais ser alterada.')) return
    setConcluindo(true)
    window.clearTimeout(timer.current)
    const campos = pendente.current
    pendente.current = {}
    try {
      setV(await concluirVistoria(v!.id, campos))
      setGravacao('salvo')
      window.scrollTo({ top: 0 })
    } catch {
      pendente.current = { ...campos, ...pendente.current }
      setErro(null)
      setGravacao('erro')
      window.alert('Não foi possível concluir. Confira a conexão e tente de novo.')
    } finally {
      setConcluindo(false)
    }
  }

  return (
    <section className={`vist ${travada ? 'vist--travada' : ''}`}>
      <Link to="/vistorias" className="vist__voltar">‹ Vistorias</Link>
      <p className="vist__marca">Checklist de vistoria de saída</p>
      <h2 className="vist__titulo">{unidade}</h2>
      <p className="sub">Registro das condições aparentes do imóvel na data da vistoria</p>

      {travada && (
        <div className="vist__concluida" role="status">
          ✓ Concluída em {dataBr(v.data_vistoria)}
          {v.vistoriador_nome ? ` por ${v.vistoriador_nome}` : ''}.
          <button type="button" className="btn btn--sec" onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
        </div>
      )}

      {!travada && (
        <div className="vist__barra" aria-live="polite">
          <span className="vist__progresso" aria-hidden="true">
            <i style={{ width: `${(p.avaliados / p.total) * 100}%` }} />
          </span>
          <span>
            {p.avaliados} de {p.total} itens
          </span>
          <span className={`vist__gravacao vist__gravacao--${gravacao}`}>
            {gravacao === 'salvo' ? 'Salvo' : gravacao === 'erro' ? 'Não salvou: confira a conexão' : 'Salvando…'}
          </span>
        </div>
      )}

      <div className="vist__cabecalho">
        <label>
          Locatário
          <input value={v.locatario ?? ''} disabled={travada} onChange={(e) => mudar({ locatario: e.target.value || null })} placeholder="Nome de quem saiu" />
        </label>
        <label>
          Data
          <input type="date" value={v.data_vistoria} disabled={travada} onChange={(e) => e.target.value && mudar({ data_vistoria: e.target.value })} />
        </label>
        <label>
          Cidade
          <input value={v.cidade} disabled={travada} onChange={(e) => mudar({ cidade: e.target.value })} />
        </label>
        <label>
          Locador
          <input value={v.locador} disabled={travada} onChange={(e) => mudar({ locador: e.target.value })} />
        </label>
        <p className="vist__tipo">
          Tipo de vistoria: <strong>Saída</strong>
        </p>
      </div>

      {!travada && (
        <p className="vist__como">
          Marque uma avaliação por item. Em caso de estado <strong>ruim</strong>, descreva a avaria e faça registro fotográfico.
          Use <strong>N/A</strong> quando o item não existir ou não puder ser verificado.
        </p>
      )}

      {SECOES.map((s) => (
        <fieldset key={s.id} className="vist__secao">
          <legend>
            {s.titulo} <small>— {s.subtitulo}</small>
          </legend>
          {s.itens.map((item) => {
            const r = v.respostas[item.id] ?? {}
            const ruim = r.avaliacao === 'ruim'
            const faltaNota = tentouConcluir && !r.avaliacao
            const faltaObs = tentouConcluir && ruim && !r.obs?.trim()
            return (
              <div key={item.id} className={`vist__item ${faltaNota || faltaObs ? 'vist__item--falta' : ''}`}>
                <span className="vist__rotulo" id={`r-${item.id}`}>
                  {item.rotulo}
                </span>
                <div className="vist__notas" role="radiogroup" aria-labelledby={`r-${item.id}`}>
                  {AVALIACOES.map(([a, rotulo]) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={r.avaliacao === a}
                      className={`vist__nota vist__nota--${a}`}
                      disabled={travada}
                      onClick={() => avaliar(item.id, a)}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
                {(ruim || r.obs) && (
                  <input
                    className="vist__obs"
                    value={r.obs ?? ''}
                    disabled={travada}
                    onChange={(e) => observar(item.id, e.target.value)}
                    placeholder={ruim ? 'Descreva a avaria (obrigatório)' : 'Observação'}
                    aria-label={`Observação: ${item.rotulo}`}
                  />
                )}
                {!ruim && !r.obs && !travada && (
                  <button type="button" className="vist__add-obs" onClick={() => observar(item.id, ' ')}>
                    + observação
                  </button>
                )}
              </div>
            )
          })}
        </fieldset>
      ))}

      <fieldset className="vist__secao">
        <legend>3 Checklist operacional de saída</legend>
        {OPERACIONAL.map((o) => {
          const r = v.operacional[o.id] ?? {}
          return (
            <div key={o.id} className="vist__oper">
              <label className="vist__check">
                <input
                  type="checkbox"
                  checked={!!r.ok}
                  disabled={travada}
                  onChange={(e) => mudar({ operacional: { ...v.operacional, [o.id]: { ...r, ok: e.target.checked } } })}
                />
                {o.rotulo}
              </label>
              <input
                className="vist__obs"
                value={r.obs ?? ''}
                disabled={travada}
                placeholder="Observação"
                aria-label={`Observação: ${o.rotulo}`}
                onChange={(e) => mudar({ operacional: { ...v.operacional, [o.id]: { ...r, obs: e.target.value } } })}
              />
            </div>
          )
        })}
      </fieldset>

      <fieldset className="vist__secao">
        <legend>4 Pendências e observações finais</legend>
        <textarea
          rows={4}
          value={v.pendencias ?? ''}
          disabled={travada}
          onChange={(e) => mudar({ pendencias: e.target.value || null })}
          placeholder="Ex.: Realizar pintura das paredes do apartamento."
        />
        {!travada && p.ruins.length > 0 && (
          <button
            type="button"
            className="btn btn--sec vist__sugerir"
            onClick={() => mudar({ pendencias: [v.pendencias?.trim(), sugerirPendencias(v)].filter(Boolean).join('\n') })}
          >
            {p.ruins.length === 1 ? 'Trazer o item ruim para cá' : `Trazer os ${p.ruins.length} itens ruins para cá`}
          </button>
        )}
      </fieldset>

      <fieldset className="vist__secao">
        <legend>5 Declaração</legend>
        <p className="vist__declaracao">{DECLARACAO}</p>
        <p className="sub">
          {v.cidade}, {dataBr(v.data_vistoria)}.{' '}
          {travada ? `Vistoriador: ${v.vistoriador_nome ?? '—'}.` : 'Ao concluir, seu nome fica registrado como vistoriador.'}
        </p>
      </fieldset>

      {!travada && (
        <div className="vist__fim">
          {tentouConcluir && p.faltando.length > 0 && (
            <p className="erro vist-faltando" role="alert">
              Falta: {p.faltando.join(' e ')}.
            </p>
          )}
          <button type="button" className="btn" disabled={concluindo} onClick={concluir}>
            {concluindo ? 'Concluindo…' : 'Concluir vistoria'}
          </button>
        </div>
      )}
    </section>
  )
}
