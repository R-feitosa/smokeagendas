import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Fumaca } from './components/Fumaca'
import { Marca } from './components/Marca'
import { useSession } from './hooks/useSession'
import { Ajustes } from './pages/Ajustes'
import { Gravar } from './pages/Gravar'
import { Hoje } from './pages/Hoje'
import { Login } from './pages/Login'
import { Calendario } from './pages/Calendario'
import { configurado, servidor } from './lib/supabase'

export default function App() {
  const { session, carregando, erroEntrada } = useSession()

  if (!configurado)
    return (
      <div className="login">
        <div className="login__marca">
          <Fumaca className="marca__fumaca" />
          <Marca tamanho="g" />
        </div>
        <p className="aviso">
          Este endereço foi publicado sem a configuração correta do servidor (confira <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>). Cadastre as variáveis na Vercel e faça um novo deploy.
        </p>
        <p className="sub">
          Endereço recebido: <code>{servidor.slice(0, 120)}</code>
        </p>
      </div>
    )

  if (carregando)
    return (
      <div className="splash">
        <div className="login__marca">
          <Fumaca className="marca__fumaca" />
          <Marca tamanho="g" />
        </div>
      </div>
    )
  if (!session) return <Login erroInicial={erroEntrada} />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Hoje />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="semana" element={<Navigate to="/calendario" replace />} />
        <Route path="gravar" element={<Gravar />} />
        <Route path="novo" element={<Navigate to="/gravar" replace />} />
        <Route path="ajustes" element={<Ajustes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
