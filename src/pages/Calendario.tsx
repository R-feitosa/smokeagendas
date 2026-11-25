import { useCallback, useEffect, useMemo, useState } from 'react'
import { EventCard } from '../components/EventCard'
import { concluirEvento, excluirEvento, listarEventos, listarPrevistas } from '../lib/api'
import {
  chaveDia,
  dataPorExtenso,
  gradeDoMes,
  inicioDaSemana,
  inicioDoDia,
  mesmoDia,
  rotuloDia,
  rotuloMes,
  rotuloSemana,
  somarDias,
  somarMeses,
} from '../lib/datas'
import type { Evento } from '../lib/types'

type Modo = 'dia' | 'semana' | 'mes'
const MODOS: [Modo, string][] = [
  ['dia', 'Dia'],
  ['semana', 'Semana'],
  ['mes', 'Mês'],
]
const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const CHAVE_MODO = 'agenda.calendario.modo'

function modoSalvo(): Modo {
  try {
    const m = localStorage.getItem(CHAVE_MODO)
    return m === 'dia' || m === 'semana' || m === 'mes' ? m : 'mes'
  } catch {
    return 'mes'
  }
}

export function Calendario() {
  const [modo, setModoState] = useState<Modo>(modoSalvo)
  const [dia, setDia] = useState(() => inicioDoDia()) // dia selecionado; define o período visível
  const [eventos, setEventos] = useState<Evento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  function setModo(m: Modo) {
    setModoState(m)
    try {
      localStorage.setItem(CHAVE_MODO, m)
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  }

  const grade = useMemo(() => gradeDoMes(dia), [dia])

  // período carregado do servidor = o que está visível na tela
  const [de, ate] = useMemo((): [Date, Date] => {
    if (modo === 'dia') return [dia, somarDias(dia, 1)]
    if (modo === 'semana') {
      const ini = inicioDaSemana(dia)
      return [ini, somarDias(ini, 7)]
    }
    return [grade[0], somarDias(grade[grade.length - 1], 1)]
  }, [modo, dia, grade])

  const carregar = useCallback(async () => {
    try {
      const [gravados, previstos] = await Promise.all([listarEventos(de, ate), listarPrevistas(de, ate)])
      setEventos([...gravados, ...previstos].sort((a, b) => a.inicio.localeCompare(b.inicio)))
      setErro(null)
    } catch {
      setErro('Não foi possível carregar a agenda')
    } finally {
      setCarregando(false)
    }
  }, [de, ate])

  useEffect(() => {
    carregar()
  }, [carregar])

  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>()
    for (const e of eventos) {
      const k = chaveDia(new Date(e.inicio))
      mapa.set(k, [...(mapa.get(k) ?? []), e])
    }
    return mapa
  }, [eventos])
  const doDia = (d: Date) => porDia.get(chaveDia(d)) ?? []

  function navegar(sentido: 1 | -1) {
    if (modo === 'dia') setDia((d) => somarDias(d, sentido))
    else if (modo === 'semana') setDia((d) => somarDias(d, 7 * sentido))
    else setDia((d) => somarMeses(d, sentido))
  }

  const hoje = inicioDoDia()
  const noPeriodoAtual =
    modo === 'dia'
      ? mesmoDia(dia, hoje)
      : modo === 'semana'
        ? mesmoDia(inicioDaSemana(dia), inicioDaSemana(hoje))
        : dia.getMonth() === hoje.getMonth() && dia.getFullYear() === hoje.getFullYear()
  const titulo = modo === 'dia' ? dataPorExtenso(dia) : modo === 'semana' ? rotuloSemana(dia) : rotuloMes(dia)

  const lista = (evs: Evento[]) => (
    <ul className="lista">
      {evs.map((e) => (
        <EventCard
          key={e.id}
          evento={e}
          onConcluir={async (id) => {
            await concluirEvento(id)
            carregar()
          }}
          onExcluir={async (id) => {
            await excluirEvento(id)
            carregar()
          }}
        />
      ))}
    </ul>
  )

  // um ponto por compromisso (até 3); repetição prevista = ponto vazado
  const pontos = (evs: Evento[]) =>
    evs.length > 0 && (
      <span className="cal__pontos" aria-hidden="true">
        {evs.slice(0, 3).map((e) => (
          <i key={e.id} className={e.prevista ? 'prev' : undefined} />
        ))}
        {evs.length > 3 && <b>+</b>}
      </span>
    )

  return (
    <section>
      <h2>Calendário</h2>

      <div className="segmentado" role="group" aria-label="Período">
        {MODOS.map(([m, rotulo]) => (
          <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}>
            {rotulo}
          </button>
        ))}
      </div>

      <div className="cal__nav">
        <button type="button" className="cal__seta" onClick={() => navegar(-1)} aria-label="Período anterior">
          ‹
        </button>
        <strong className="cal__titulo">{titulo}</strong>
        <button type="button" className="cal__seta" onClick={() => navegar(1)} aria-label="Próximo período">
          ›
        </button>
        {!noPeriodoAtual && (
          <button type="button" className="btn btn--sec cal__hoje" onClick={() => setDia(inicioDoDia())}>
            Hoje
          </button>
        )}
      </div>

      {erro && <p className="erro">{erro}</p>}
      {carregando && <p className="vazio">Carregando…</p>}

      {modo === 'mes' && (
        <>
          <div className="cal__grade" role="grid" aria-label={titulo}>
            {DIAS_DA_SEMANA.map((l, i) => (
              <span key={i} className="cal__semana-rotulo" aria-hidden="true">
                {l}
              </span>
            ))}
            {grade.map((d) => {
              const n = doDia(d).length
              const classes = [
                'cal__dia',
                d.getMonth() !== dia.getMonth() && 'cal__dia--fora',
                mesmoDia(d, hoje) && 'cal__dia--hoje',
                mesmoDia(d, dia) && 'cal__dia--sel',
              ]
              return (
                <button
                  key={chaveDia(d)}
                  type="button"
                  className={classes.filter(Boolean).join(' ')}
                  aria-pressed={mesmoDia(d, dia)}
                  aria-label={`${dataPorExtenso(d)}${n ? `, ${n} compromisso${n > 1 ? 's' : ''}` : ''}`}
                  onClick={() => setDia(d)}
                >
                  <span>{d.getDate()}</span>
                  {pontos(doDia(d))}
                </button>
              )
            })}
          </div>
          <h3>{rotuloDia(dia)}</h3>
          {doDia(dia).length ? lista(doDia(dia)) : !carregando && <p className="vazio">Nada marcado neste dia.</p>}
        </>
      )}

      {modo === 'semana' && (
        <>
          <div className="cal__faixa">
            {Array.from({ length: 7 }, (_, i) => somarDias(inicioDaSemana(dia), i)).map((d) => (
              <button
                key={chaveDia(d)}
                type="button"
                className={`cal__dia ${mesmoDia(d, hoje) ? 'cal__dia--hoje' : ''}`}
                aria-label={`Abrir ${dataPorExtenso(d)}`}
                onClick={() => {
                  setDia(d)
                  setModo('dia')
                }}
              >
                <small>{DIAS_DA_SEMANA[d.getDay()]}</small>
                <span>{d.getDate()}</span>
                {pontos(doDia(d))}
              </button>
            ))}
          </div>
          {!carregando && eventos.length === 0 && <p className="vazio">Nada marcado nesta semana.</p>}
          {Array.from({ length: 7 }, (_, i) => somarDias(inicioDaSemana(dia), i))
            .filter((d) => doDia(d).length)
            .map((d) => (
              <div key={chaveDia(d)}>
                <h3>{rotuloDia(d)}</h3>
                {lista(doDia(d))}
              </div>
            ))}
        </>
      )}

      {modo === 'dia' && (
        <>
          {!carregando && eventos.length === 0 && <p className="vazio">Nada marcado neste dia.</p>}
          {lista(doDia(dia))}
        </>
      )}
    </section>
  )
}
