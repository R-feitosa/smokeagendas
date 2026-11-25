import { useCallback, useEffect, useState } from 'react'
import { EventCard } from '../components/EventCard'
import { FiltroDono } from '../components/FiltroDono'
import { useEquipe, useFiltroDono } from '../lib/equipe'
import { useAcaoNotificacao } from '../hooks/useAcaoNotificacao'
import { concluirEvento, excluirEvento, listarEventos } from '../lib/api'
import { dataPorExtenso, inicioDoDia, somarDias } from '../lib/datas'
import type { Evento } from '../lib/types'

export function Hoje() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const equipe = useEquipe()
  const { filtro, setFiltro, aplicar } = useFiltroDono()
  const visiveis = aplicar(eventos)

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
      <p className="sub">{dataPorExtenso(new Date())}</p>
      <FiltroDono filtro={filtro} onMudar={setFiltro} equipe={equipe} />

      {carregando && <p>Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}
      {!carregando && !erro && visiveis.length === 0 && (
        <p className="vazio">
          {eventos.length === 0
            ? 'Nada marcado para hoje. Toque em Gravar.'
            : filtro === 'minha'
              ? 'Nada seu para hoje.'
              : 'Nada da equipe para hoje.'}
        </p>
      )}

      <ul className="lista">
        {visiveis.map((e) => (
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
