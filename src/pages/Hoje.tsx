import { useCallback, useEffect, useState } from 'react'
import { EventCard } from '../components/EventCard'
import { useAcaoNotificacao } from '../hooks/useAcaoNotificacao'
import { concluirEvento, excluirEvento, listarEventos } from '../lib/api'
import { inicioDoDia, somarDias } from '../lib/datas'
import type { Evento } from '../lib/types'

export function Hoje() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const hoje = inicioDoDia()
      setEventos(await listarEventos(hoje, somarDias(hoje, 1)))
      setErro(null)
    } catch {
      setErro('Não foi possível carregar a agenda')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  useAcaoNotificacao(carregar)

  return (
    <section>
      <h2>Hoje</h2>
      <p className="sub">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>

      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}
      {!carregando && !erro && eventos.length === 0 && <p className="vazio">Nada marcado para hoje. Toque em 🎙 Gravar.</p>}

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
    </section>
  )
}
