import { useState } from 'react'
import { Fumaca } from '../components/Fumaca'
import { Marca } from '../components/Marca'
import { mensagemErroLogin, supabase } from '../lib/supabase'

export function Login({ erroInicial = null }: { erroInicial?: string | null }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(erroInicial)
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setCarregando(false)
    if (error) setErro(mensagemErroLogin(error))
  }

  return (
    <div className="login">
      <div className="login__marca">
        <Fumaca className="marca__fumaca" />
        <Marca tamanho="g" />
      </div>
      <form className="form login__cartao" onSubmit={entrar}>
        <h1>Agenda por Voz</h1>
        <p className="sub">Entre com a conta do escritório.</p>
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
