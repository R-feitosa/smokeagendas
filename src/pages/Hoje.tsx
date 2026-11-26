import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EventCard } from '../components/EventCard'
import { FiltroDono } from '../components/FiltroDono'
import { IconeMic } from '../components/Recorder'
import { useEquipe, useFiltroDono } from '../lib/equipe'
import { useAcaoNotificacao } from '../hooks/useAcaoNotificacao'
import { concluirEvento, excluirEvento, listarEventos, listarPredios, meuNome } from '../lib/api'
import { resumir } from '../lib/apartamentos'
import { dataPorExtenso, hora, inicioDoDia, somarDias } from '../lib/datas'
import type { Evento, Predio } from '../lib/types'

const tracos = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const Icone = {
  agenda: (
    <svg {...tracos}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M8.5 14.5l2.2 2.2 4.8-4.8" />
    </svg>
  ),
  relogio: (
    <svg {...tracos}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  chave: (
    <svg {...tracos}>
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="M10.4 12.6 20 3M16.5 6.5l3 3M13.5 9.5l2.2 2.2" />
    </svg>
  ),
  casa: (
    <svg {...tracos}>
      <path d="M4 11.5 12 5l8 6.5M6 10v9.5h12V10M10 19.5v-5h4v5" />
    </svg>
  ),
  calendario: (
    <svg {...tracos}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
    </svg>
  ),
  predio: (
    <svg {...tracos}>
      <path d="M4.5 20.5V6l7.5-2.5L19.5 6v14.5M3 20.5h18M10 20.5v-3.5h4v3.5" />
      <path d="M8.5 9h.01M12 9h.01M15.5 9h.01M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" strokeWidth={2.4} />
    </svg>
  ),
  ajustes: (
    <svg {...tracos}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
}

/** "Bom dia" até 12h, "Boa tarde" até 18h, depois "Boa noite" */
function saudacao(d = new Date()): string {
  const h = d.getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

function Indicador({ icone, rotulo, valor, detalhe, tom, para }: { icone: ReactNode; rotulo: string; valor: string; detalhe?: string; tom: 'azul' | 'ouro'; para?: string }) {
  const corpo = (
    <>
      <span className={`painel__icone painel__icone--${tom}`}>{icone}</span>
      <span className="painel__texto">
        <span className="painel__rotulo">{rotulo}</span>
        <strong className="painel__valor">{valor}</strong>
        {detalhe && <span className="painel__detalhe">{detalhe}</span>}
      </span>
    </>
  )
  return para ? (
    <Link to={para} className="painel__card">
      {corpo}
    </Link>
  ) : (
    <div className="painel__card">{corpo}</div>
  )
}

/**
 * Aba Hoje — painel do dia: atalho para gravar, indicadores (compromissos de hoje,
 * próximo, vagos, casas ocupadas), acesso rápido e a lista de hoje.
 */
export function Hoje() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [predios, setPredios] = useState<Predio[] | null>(null)
  const [nome, setNome] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => new Date())
  const equipe = useEquipe()
  const { filtro, setFiltro, aplicar } = useFiltroDono()
  const visiveis = aplicar(eventos)

  const carregar = useCallback(async () => {
    // imóveis e nome são extras do painel: se falharem, a agenda continua
    listarPredios().then(setPredios).catch(() => setPredios(null))
    meuNome().then(setNome).catch(() => {})
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
    // "próximo compromisso" e saudação andam com o relógio; ao voltar para a tela, recarrega
    const t = window.setInterval(() => setAgora(new Date()), 60_000)
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') {
        setAgora(new Date())
        carregar()
      }
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [carregar])

  useAcaoNotificacao(carregar)

  const pendentes = visiveis.filter((e) => e.status === 'pendente')
  const feitos = visiveis.filter((e) => e.status === 'concluido').length
  const proximo = pendentes.find((e) => new Date(e.inicio) >= agora)
  const atrasados = pendentes.filter((e) => new Date(e.inicio) < agora).length

  const imoveis = useMemo(() => {
    if (!predios) return null
    const locacao = resumir(predios.filter((p) => p.categoria !== 'temporada').flatMap((p) => p.unidades))
    const casas = resumir(predios.filter((p) => p.categoria === 'temporada').flatMap((p) => p.unidades))
    return { locacao, casas }
  }, [predios])

  return (
    <section className="painel">
      <header className="painel__ola">
        <h2>
          {saudacao(agora)}
          {nome ? `, ${nome}` : ''} <span aria-hidden="true">👋</span>
        </h2>
        <p className="sub">{dataPorExtenso(agora)}</p>
      </header>

      <Link to="/gravar" className="painel__cta">
        <span>
          <strong>Gravar agora</strong>
          <small>Um compromisso ou o status de um imóvel</small>
        </span>
        <span className="painel__cta-icone" aria-hidden="true">
          <IconeMic tamanho={24} />
        </span>
      </Link>

      <h3 className="painel__secao">Seu dia</h3>
      <div className="painel__grade">
        <Indicador
          tom="azul"
          icone={Icone.agenda}
          rotulo="Compromissos hoje"
          valor={carregando ? '…' : String(visiveis.length)}
          detalhe={carregando ? undefined : `${feitos} ${feitos === 1 ? 'concluído' : 'concluídos'}${atrasados ? ` · ${atrasados} ${atrasados === 1 ? 'atrasado' : 'atrasados'}` : ''}`}
        />
        <Indicador
          tom="azul"
          icone={Icone.relogio}
          rotulo="Próximo"
          valor={carregando ? '…' : proximo ? hora(proximo.inicio) : '—'}
          detalhe={carregando ? undefined : proximo ? proximo.titulo : 'nada mais hoje'}
        />
        <Indicador
          tom="ouro"
          icone={Icone.chave}
          rotulo="Vagos agora"
          valor={imoveis ? String(imoveis.locacao.vagos) : '—'}
          detalhe={imoveis ? `de ${imoveis.locacao.total} unidades` : undefined}
          para="/apartamentos"
        />
        <Indicador
          tom="ouro"
          icone={Icone.casa}
          rotulo="Casas ocupadas"
          valor={imoveis ? String(imoveis.casas.ocupados) : '—'}
          detalhe={imoveis ? `de ${imoveis.casas.total} de temporada` : undefined}
          para="/apartamentos#temporada"
        />
      </div>

      <h3 className="painel__secao">Acesso rápido</h3>
      <div className="painel__atalhos">
        <Link to="/calendario" className="painel__atalho">
          <span className="painel__icone painel__icone--azul">{Icone.calendario}</span>
          Calendário
        </Link>
        <Link to="/apartamentos" className="painel__atalho">
          <span className="painel__icone painel__icone--azul">{Icone.predio}</span>
          Apartamentos
        </Link>
        <Link to="/apartamentos#temporada" className="painel__atalho">
          <span className="painel__icone painel__icone--azul">{Icone.casa}</span>
          Casas de temporada
        </Link>
        <Link to="/ajustes" className="painel__atalho">
          <span className="painel__icone painel__icone--azul">{Icone.ajustes}</span>
          Ajustes
        </Link>
      </div>

      <h3 className="painel__secao">Agenda de hoje</h3>
      <FiltroDono filtro={filtro} onMudar={setFiltro} equipe={equipe} />
      {carregando && <p className="vazio">Carregando…</p>}
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
