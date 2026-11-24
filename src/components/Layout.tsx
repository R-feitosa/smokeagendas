import { NavLink, Outlet } from 'react-router-dom'

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
        <NavLink to="/novo" className="tabbar__novo">
          <span>🎙</span>Novo
        </NavLink>
        <NavLink to="/ajustes">
          <span>⚙️</span>Ajustes
        </NavLink>
      </nav>
    </div>
  )
}
