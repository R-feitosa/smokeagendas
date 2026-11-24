import { NavLink, Outlet } from 'react-router-dom'
import { IconeMic } from './Recorder'

export function Layout() {
  return (
    <div className="app">
      <main className="app__conteudo">
        <Outlet />
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>
          <span>📅</span>Hoje
        </NavLink>
        <NavLink to="/semana">
          <span>🗓</span>Semana
        </NavLink>
        <NavLink to="/gravar" className="tabbar__gravar">
          <span>
            <IconeMic tamanho={22} />
          </span>
          Gravar
        </NavLink>
        <NavLink to="/ajustes">
          <span>⚙️</span>Ajustes
        </NavLink>
      </nav>
    </div>
  )
}
