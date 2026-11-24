import { useCallback, useEffect, useMemo, useState } from 'react'
import { EventCard } from '../components/EventCard'
import { concluirEvento, excluirEvento, listarEventos } from '../lib/api'
import { inicioDoDia, rotuloDia, somarDias } from '../lib/datas'
import type { Evento } from '../lib/types'

export function Semana() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const hoje = inicioDoDia()
    setEventos(await listarEventos(hoje, somarDias(hoje, 7)))
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar().catch(() => setCarregando(false))
  }, [carregar])

  const dias = useMemo(() => {
    const hoje = inicioDoDia()
    return Array.from({ length: 7 }, (_, i) => {
      const dia = somarDias(hoje, i)
      const fim = somarDias(dia, 1)
      return {
        dia,
        eventos: eventos.filter((e) => new Date(e.inicio) >= dia && new Date(e.inicio) < fim),
      }
    })
  }, [eventos])

  return (
    <section>
      <h2>Próximos 7 dias</h2>
      {carregando && <p>Carregando…</p>}
      {dias.map(({ dia, eventos }) => (
        <div key={dia.toISOString()} className="dia">
          <h3>{rotuloDia(dia)}</h3>
          {eventos.length === 0 ? (
            <p className="vazio">—</p>
          ) : (
            <ul className="lista">
              {eventos.map((e) => (
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
          )}
        </div>
      ))}
    </section>
  )
}
