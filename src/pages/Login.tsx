import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setCarregando(false)
    if (!error) return
    // só credencial errada vira "senha inválida"; falha de rede ou de servidor precisa aparecer como tal
    if (error.status === 400 && /invalid login credentials/i.test(error.message)) setErro('E-mail ou senha inválidos')
    else if (/email not confirmed/i.test(error.message)) setErro('Este e-mail ainda não foi confirmado.')
    else if (!error.status) setErro('Sem conexão com o servidor. Verifique a internet e tente de novo.')
    else setErro(`Não foi possível entrar (${error.status}): ${error.message}`)
  }

  return (
    <div className="login">
      <h1>Agenda por Voz</h1>
      <p>Entre com a conta do escritório.</p>
      <form className="form" onSubmit={entrar}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="btn" disabled={carregando}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
