import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useSession } from './hooks/useSession'
import { Ajustes } from './pages/Ajustes'
import { Hoje } from './pages/Hoje'
import { Login } from './pages/Login'
import { Novo } from './pages/Novo'
import { Semana } from './pages/Semana'

export default function App() {
  const { session, carregando } = useSession()

  if (carregando) return <p className="splash">Carregando…</p>
  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Hoje />} />
        <Route path="semana" element={<Semana />} />
        <Route path="novo" element={<Novo />} />
        <Route path="ajustes" element={<Ajustes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
