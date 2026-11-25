import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { liberarSom, tocarAlerta } from '../lib/som'
import { Fumaca, type FumacaHandle } from './Fumaca'
import { CHAMINE, Marca } from './Marca'
import { IconeMic } from './Recorder'

// ícones de traço, na cor do texto da aba (combinam com a marca, ao contrário dos emojis)
const tracos = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const IconeHoje = () => (
  <svg {...tracos}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)
const IconeCalendario = () => (
  <svg {...tracos}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
  </svg>
)
const IconeApartamentos = () => (
  <svg {...tracos}>
    <path d="M4.5 20.5V6l7.5-2.5L19.5 6v14.5M3 20.5h18M10 20.5v-3.5h4v3.5" />
    <path d="M8.5 9h.01M12 9h.01M15.5 9h.01M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" strokeWidth={2.4} />
  </svg>
)
const IconeAjustes = () => (
  <svg {...tracos}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
)

export function Layout() {
  const icone = useRef<SVGSVGElement>(null)
  const fumaca = useRef<FumacaHandle>(null)

  useEffect(() => {
    const aoMensagem = (e: MessageEvent) => {
      if ((e.data as { tipo?: string })?.tipo === 'lembrete') tocarAlerta()
    }
    navigator.serviceWorker?.addEventListener('message', aoMensagem)
    window.addEventListener('pointerdown', liberarSom, { once: true })
    return () => {
      navigator.serviceWorker?.removeEventListener('message', aoMensagem)
      window.removeEventListener('pointerdown', liberarSom)
    }
  }, [])

  return (
    <div className="app">
      <header className="topo" onClick={() => fumaca.current?.rajada(10)}>
        <Fumaca ref={fumaca} fonte={icone} ponto={CHAMINE} taxa={4.5} aneis={0.35} vento={46} escala={0.75} subida={0.22} />
        <Marca refIcone={icone} />
      </header>
      <main className="app__conteudo">
        <Outlet />
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>
          <span>
            <IconeHoje />
          </span>
          Hoje
        </NavLink>
        <NavLink to="/calendario">
          <span>
            <IconeCalendario />
          </span>
          Calendário
        </NavLink>
        <NavLink to="/gravar" className="tabbar__gravar">
          <span>
            <IconeMic tamanho={22} />
          </span>
          Gravar
        </NavLink>
        <NavLink to="/apartamentos">
          <span>
            <IconeApartamentos />
          </span>
          Apartamentos
        </NavLink>
        <NavLink to="/ajustes">
          <span>
            <IconeAjustes />
          </span>
          Ajustes
        </NavLink>
      </nav>
    </div>
  )
}
