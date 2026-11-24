import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useSession } from './hooks/useSession'
import { Ajustes } from './pages/Ajustes'
import { Gravar } from './pages/Gravar'
import { Hoje } from './pages/Hoje'
import { Login } from './pages/Login'
import { Semana } from './pages/Semana'
import { configurado, servidor } from './lib/supabase'

export default function App() {
  const { session, carregando } = useSession()

  if (!configurado)
    return (
      <div className="login">
        <h1>Agenda por Voz</h1>
        <p className="aviso">
          Este endereço foi publicado sem a configuração correta do servidor (confira <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>). Cadastre as variáveis na Vercel e faça um novo deploy.
        </p>
        <p className="sub">
          Endereço recebido: <code>{servidor.slice(0, 120)}</code>
        </p>
      </div>
    )

  if (carregando) return <p className="splash">Carregando…</p>
  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Hoje />} />
        <Route path="semana" element={<Semana />} />
        <Route path="gravar" element={<Gravar />} />
        <Route path="novo" element={<Navigate to="/gravar" replace />} />
        <Route path="ajustes" element={<Ajustes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
