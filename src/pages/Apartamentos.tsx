import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Fumaca, type FumacaHandle } from '../components/Fumaca'
import { UnidadeFolha } from '../components/UnidadeFolha'
import { listarPredios, mudarStatusUnidade, semTabelasDeApartamentos } from '../lib/api'
import {
  contagemVagos,
  fileiras,
  nomeUnidadePorExtenso,
  porcentagem,
  resumir,
  rotuloCompleto,
  rotuloStatus,
  type FiltroStatus,
} from '../lib/apartamentos'
import type { Predio, StatusUnidade, Unidade } from '../lib/types'

const FILTROS: [FiltroStatus, string][] = [
  ['todos', 'Todos'],
  ['vago', 'Vagos'],
  ['ocupado', 'Ocupados'],
]
const TEMPO_AVISO = 7000 // ms com o "Desfazer" na tela
const TEMPO_FUMACA = 4200 // ms até a baforada sumir (a partícula mais longa vive ~3,6 s)
const TEMPO_ENTRADA = 1400 // ms da entrada em cascata das placas (só na primeira carga)
const TEMPO_TROCA = 700 // ms da animação da placa que mudou

type Aviso = { texto: string; desfazer?: () => void }

/** variável CSS --i: posição do item, para a entrada em cascata */
const posicao = (i: number) => ({ '--i': i }) as CSSProperties

/** rola até o prédio (sem animação se o aparelho pede menos movimento) */
function irPara(id: string) {
  const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
}

/**
 * Aba Apartamentos — controle de vago | ocupado dos imóveis do escritório.
 * Resumo (quantos vagos, ocupação por prédio) + quadro com uma placa por unidade;
 * tocar na placa abre a folha para marcar Vago ou Ocupado (components/UnidadeFolha).
 * Dados em agenda.predios / agenda.unidades (migration 0007), iguais para todos os habilitados.
 */
export function Apartamentos() {
  const [predios, setPredios] = useState<Predio[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  const [aberta, setAberta] = useState<string | null>(null) // id da unidade com a folha aberta
  const [mudou, setMudou] = useState<string | null>(null) // última unidade alterada (anima a placa)
  const [fumaca, setFumaca] = useState<string | null>(null) // unidade que acabou de vagar: "puf"
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [entrando, setEntrando] = useState(true) // primeira carga: placas entram em cascata
  // cada carga e cada gravação avançam a versão: resposta de uma carga mais antiga é descartada,
  // para uma lista pedida antes de salvar não devolver o status velho à tela
  const versao = useRef(0)
  const carregou = useRef(false)

  const carregar = useCallback(async () => {
    const pedido = ++versao.current
    try {
      const lista = await listarPredios()
      if (pedido !== versao.current) return
      carregou.current = true
      setPredios(lista)
      setErro(null)
    } catch (e) {
      if (pedido !== versao.current) return
      setErro(
        semTabelasDeApartamentos(e)
          ? 'A lista de apartamentos ainda não existe no servidor (falta aplicar a migration 0007_apartamentos).'
          : carregou.current
            ? 'Não foi possível atualizar a lista. O que aparece abaixo é a última carregada.'
            : 'Não foi possível carregar os apartamentos.',
      )
    }
  }, [])

  // outra pessoa pode ter mudado um status: recarrega ao voltar para a tela
  useEffect(() => {
    carregar()
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') carregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [carregar])

  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), TEMPO_AVISO)
    return () => window.clearTimeout(t)
  }, [aviso])

  useEffect(() => {
    if (!fumaca) return
    const t = window.setTimeout(() => setFumaca(null), TEMPO_FUMACA)
    return () => window.clearTimeout(t)
  }, [fumaca])

  useEffect(() => {
    if (!mudou) return
    const t = window.setTimeout(() => setMudou(null), TEMPO_TROCA)
    return () => window.clearTimeout(t)
  }, [mudou])

  const temLista = !!predios?.length
  useEffect(() => {
    if (!temLista) return
    const t = window.setTimeout(() => setEntrando(false), TEMPO_ENTRADA)
    return () => window.clearTimeout(t)
  }, [temLista])

  /** Grava e atualiza a tela com a linha que o banco devolveu (já com desde/por quem). */
  async function mudar(predio: Predio, unidade: Unidade, status: StatusUnidade, desfazendo = false) {
    const nova = await mudarStatusUnidade(unidade.id, status)
    versao.current++
    setPredios((ps) => ps && ps.map((p) => (p.id !== predio.id ? p : { ...p, unidades: p.unidades.map((u) => (u.id === nova.id ? nova : u)) })))
    setMudou(nova.id)
    setFumaca(nova.status === 'vago' ? nova.id : null)
    const onde = rotuloCompleto(predio, unidade)
    setAviso(
      desfazendo
        ? { texto: `${onde} voltou para ${rotuloStatus(nova.status).toLowerCase()}` }
        : {
            texto: `${onde} agora está ${rotuloStatus(nova.status).toLowerCase()}`,
            desfazer: () => {
              mudar(predio, nova, unidade.status, true).catch(() => setAviso({ texto: 'Não foi possível desfazer. Toque na unidade e tente de novo.' }))
            },
          },
    )
  }

  // prédios de locação no resumo e no quadro; casas de temporada numa seção à parte
  const locacao = useMemo(() => (predios ?? []).filter((p) => p.categoria !== 'temporada'), [predios])
  const temporada = useMemo(() => (predios ?? []).filter((p) => p.categoria === 'temporada'), [predios])
  const geral = useMemo(() => resumir(locacao.flatMap((p) => p.unidades)), [locacao])
  const todas = useMemo(() => resumir((predios ?? []).flatMap((p) => p.unidades)), [predios])
  const contagem: Record<FiltroStatus, number> = { todos: todas.total, vago: todas.vagos, ocupado: todas.ocupados }
  const casasVisiveis = temporada.filter((p) => filtro === 'todos' || p.unidades.some((u) => u.status === filtro))

  const selecionada = useMemo(() => {
    for (const predio of predios ?? []) {
      const unidade = predio.unidades.find((u) => u.id === aberta)
      if (unidade) return { predio, unidade }
    }
    return null
  }, [predios, aberta])

  return (
    <section className="aptos">
      <h2>Apartamentos</h2>
      <p className="sub">
        {predios?.length
          ? `${geral.total} unidades em ${locacao.length} ${locacao.length === 1 ? 'prédio' : 'prédios'}${temporada.length ? ` · ${temporada.length} ${temporada.length === 1 ? 'casa' : 'casas'} de temporada` : ''}`
          : 'Controle de vago e ocupado'}
      </p>

      {erro && (
        <div className="erro-box" role="alert">
          <p>{erro}</p>
          <button type="button" className="btn btn--sec" onClick={carregar}>
            Tentar de novo
          </button>
        </div>
      )}
      {!predios && !erro && <p className="vazio">Carregando…</p>}
      {predios?.length === 0 && <p className="vazio">Nenhum prédio cadastrado ainda.</p>}

      {temLista && predios && (
        <>
          <div className="aptos__resumo">
            <div className="aptos__kpis">
              <p className="aptos__heroi">
                <span className="aptos__rotulo">
                  <i className="aptos__marca aptos__marca--vago" aria-hidden="true" />
                  Vagos agora
                </span>
                <strong className="aptos__numero">{geral.vagos}</strong>
                <span className="aptos__de">de {geral.total} unidades</span>
              </p>
              <dl className="aptos__lado">
                <div>
                  <dt>
                    <i className="aptos__marca aptos__marca--ocupado" aria-hidden="true" />
                    Ocupados
                  </dt>
                  <dd>{geral.ocupados}</dd>
                </div>
                <div>
                  <dt>Ocupação</dt>
                  <dd title={`${geral.ocupados} ocupados ÷ ${geral.total} unidades`}>{porcentagem(geral.ocupacao)}</dd>
                </div>
              </dl>
            </div>

            <ul className="aptos__medidores" aria-label="Ocupação por prédio">
              {locacao.map((p, i) => {
                const r = resumir(p.unidades)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="aptos__medidor"
                      aria-label={`${p.nome}: ${r.ocupados} de ${r.total} ocupados, ${contagemVagos(r.vagos)}. Ir para o prédio.`}
                      onClick={() => irPara(`predio-${p.id}`)}
                    >
                      <span className="aptos__medidor-nome">{p.nome}</span>
                      <span className="aptos__trilho" aria-hidden="true" style={posicao(i)}>
                        {r.ocupados > 0 && <i className="aptos__parte aptos__parte--ocupado" style={{ flexGrow: r.ocupados }} />}
                        {r.vagos > 0 && <i className="aptos__parte aptos__parte--vago" style={{ flexGrow: r.vagos }} />}
                      </span>
                      <span className="aptos__medidor-valor" aria-hidden="true">
                        {r.ocupados}
                        <small>/{r.total}</small>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="segmentado aptos__filtro" role="group" aria-label="Mostrar">
            {FILTROS.map(([f, rotulo]) => (
              <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                {rotulo} <small>{contagem[f]}</small>
              </button>
            ))}
          </div>

          <div className={`aptos__quadro ${entrando ? 'aptos__quadro--entrando' : ''}`}>
            {locacao.map((p, i) => {
              const r = resumir(p.unidades)
              const linhas = fileiras(filtro === 'todos' ? p.unidades : p.unidades.filter((u) => u.status === filtro))
              let n = 0
              return (
                <article
                  key={p.id}
                  id={`predio-${p.id}`}
                  className={`aptos__predio ${p.unidades.some((u) => u.id === fumaca) ? 'aptos__predio--fumaca' : ''}`}
                  style={posicao(i)}
                  aria-label={`${p.nome}: ${r.ocupados} de ${r.total} ocupados, ${contagemVagos(r.vagos)}`}
                >
                  <header className="aptos__telhado">
                    <div>
                      <h3 className="aptos__nome">{p.nome}</h3>
                      <p className="aptos__conta">
                        {r.ocupados} de {r.total} {r.ocupados === 1 ? 'ocupado' : 'ocupados'}
                      </p>
                    </div>
                    <span className={`aptos__selo ${r.vagos ? 'aptos__selo--vago' : ''}`}>{contagemVagos(r.vagos)}</span>
                  </header>
                  <div className="aptos__andares">
                    {linhas.map((linha) => (
                      <div key={linha[0].id} className="aptos__fileira">
                        {linha.map((u) => (
                          <Placa
                            key={u.id}
                            predio={p}
                            unidade={u}
                            indice={n++}
                            mudou={mudou === u.id}
                            fumaca={fumaca === u.id}
                            onAbrir={setAberta}
                          />
                        ))}
                      </div>
                    ))}
                    {linhas.length === 0 && (
                      <p className="aptos__nada">{filtro === 'vago' ? 'Nenhuma unidade vaga aqui.' : 'Nenhuma unidade ocupada aqui.'}</p>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          {temporada.length > 0 && (
            <section className="temporada" aria-labelledby="temporada-titulo">
              <header className="temporada__topo">
                <h3 className="temporada__titulo" id="temporada-titulo">
                  Casas de temporada
                </h3>
                <span className="temporada__conta">
                  {resumir(temporada.flatMap((p) => p.unidades)).ocupados} de {temporada.length} ocupadas
                </span>
              </header>
              <ul className="temporada__lista">
                {casasVisiveis.map((p) =>
                  p.unidades.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className={`temporada__casa temporada__casa--${u.status} ${mudou === u.id ? 'temporada__casa--mudou' : ''}`}
                        aria-haspopup="dialog"
                        aria-label={`${p.nome}, casa de temporada: ${rotuloStatus(u.status).toLowerCase()}. Toque para alterar.`}
                        onClick={() => setAberta(u.id)}
                      >
                        <span className="temporada__nome">{p.nome}</span>
                        <span className="temporada__status">
                          <i className={`aptos__marca aptos__marca--${u.status}`} aria-hidden="true" />
                          {rotuloStatus(u.status)}
                        </span>
                      </button>
                    </li>
                  )),
                )}
                {casasVisiveis.length === 0 && (
                  <li className="aptos__nada">{filtro === 'vago' ? 'Nenhuma casa vaga agora.' : 'Nenhuma casa ocupada agora.'}</li>
                )}
              </ul>
            </section>
          )}
        </>
      )}

      {selecionada && (
        <UnidadeFolha
          key={selecionada.unidade.id}
          predio={selecionada.predio}
          unidade={selecionada.unidade}
          onMudar={(status) => mudar(selecionada.predio, selecionada.unidade, status)}
          onFechar={() => setAberta(null)}
        />
      )}

      {aviso && (
        <div className="aptos__aviso" role="status">
          <span>{aviso.texto}</span>
          {aviso.desfazer && (
            <button
              type="button"
              onClick={() => {
                aviso.desfazer?.()
                setAviso(null)
              }}
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </section>
  )
}

type PlacaProps = {
  predio: Predio
  unidade: Unidade
  indice: number
  mudou: boolean
  fumaca: boolean
  onAbrir: (id: string) => void
}

/** Uma unidade no quadro: o número da porta; vaga = em destaque, com a etiqueta "Vago". */
function Placa({ predio, unidade, indice, mudou, fumaca, onAbrir }: PlacaProps) {
  const botao = useRef<HTMLButtonElement>(null)
  return (
    <button
      ref={botao}
      type="button"
      className={`aptos__placa aptos__placa--${unidade.status} ${fumaca ? 'aptos__placa--fumaca' : ''}`}
      style={posicao(indice)}
      aria-haspopup="dialog"
      aria-label={`${nomeUnidadePorExtenso(predio, unidade)}, ${predio.nome}: ${rotuloStatus(unidade.status).toLowerCase()}. Toque para alterar.`}
      onClick={() => onAbrir(unidade.id)}
    >
      {/* a face é recriada quando o status muda: é ela que anima a troca (o botão, e o foco, ficam) */}
      <span key={unidade.status} className={`aptos__face ${mudou ? 'aptos__face--mudou' : ''}`}>
        <span className="aptos__porta">{unidade.numero}</span>
        {unidade.status === 'vago' && <span className="aptos__etiqueta">Vago</span>}
      </span>
      {fumaca && <Puf fonte={botao} />}
    </button>
  )
}

/** Baforada única saindo da placa que acabou de vagar (mesma fumaça do resto do app). */
function Puf({ fonte }: { fonte: RefObject<Element | null> }) {
  const fumaca = useRef<FumacaHandle>(null)
  useEffect(() => {
    fumaca.current?.rajada(8)
  }, [])
  return <Fumaca ref={fumaca} className="aptos__fumaca" tom="escuro" fonte={fonte} ponto={{ x: 0.5, y: 0.35 }} taxa={0} aneis={0} escala={0.8} />
}
