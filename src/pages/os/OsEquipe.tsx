import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useOsContexto } from '../../hooks/useOsContexto'
import { definirMembro, removerMembro } from '../../lib/os'
import type { Equipe, PapelEquipe } from '../../lib/types'

/** Equipes de OS: todos veem os colegas; o gestor inclui, muda papel e remove. */
export function OsEquipe() {
  const ctx = useOsContexto()

  if (!ctx.pronto) return <p>Carregando…</p>
  return (
    <section>
      <Link to="/os" className="voltar">← Ordens de Serviço</Link>
      <h2>Equipe</h2>
      {ctx.equipes.length === 0 && (
        <p className="aviso">Você ainda não está em nenhuma equipe. O administrador cria a equipe e define o gestor.</p>
      )}
      {ctx.equipes.map((e) => (
        <CartaoEquipe key={e.id} equipe={e} meuId={ctx.meuId} onMudou={ctx.recarregarEquipes} />
      ))}
      <p className="sub os__datas">
        Gestor vê e edita todas as OS da equipe, atribui técnicos e cancela. Técnico vê as OS atribuídas a ele e as que abriu.
        Só entra na equipe quem já está habilitado no app.
      </p>
    </section>
  )
}

function CartaoEquipe({ equipe, meuId, onMudou }: { equipe: Equipe; meuId: string; onMudou: () => Promise<void> }) {
  const gestor = equipe.meu_papel === 'gestor'
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<PapelEquipe>('tecnico')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function executar(fn: () => Promise<void>, msg: string) {
    setOcupado(true)
    setErro(null)
    setOk(null)
    try {
      await fn()
      await onMudou()
      setOk(msg)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="fotos__grupo equipe">
      <header className="fotos__cab">
        <strong>{equipe.nome}</strong>
        <span className="status">{gestor ? 'Você é gestor' : 'Você é técnico'}</span>
      </header>
      <ul className="lista-membros">
        {equipe.membros.map((m) => (
          <li key={m.user_id}>
            <span>
              {m.nome ?? 'Sem nome'}{m.user_id === meuId ? ' (eu)' : ''} <small>· {m.papel === 'gestor' ? 'gestor' : 'técnico'}</small>
            </span>
            {gestor && m.user_id !== meuId && (
              <button
                className="btn btn--perigo btn--peq"
                disabled={ocupado}
                onClick={() =>
                  window.confirm(`Remover ${m.nome ?? 'esta pessoa'} da equipe? Ela perde acesso às OS atribuídas.`) &&
                  executar(() => removerMembro(equipe.id, m.user_id), 'Removido da equipe')
                }
              >
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>
      {gestor && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            if (email.trim()) executar(() => definirMembro(equipe.id, email, papel), 'Membro incluído/atualizado').then(() => setEmail(''))
          }}
        >
          <div className="form__linha">
            <label>
              E-mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tecnico@empresa.com.br" required />
            </label>
            <label>
              Papel
              <select value={papel} onChange={(e) => setPapel(e.target.value as PapelEquipe)}>
                <option value="tecnico">Técnico</option>
                <option value="gestor">Gestor</option>
              </select>
            </label>
          </div>
          <button className="btn" disabled={ocupado}>Incluir na equipe</button>
        </form>
      )}
      {erro && <p className="erro">{erro}</p>}
      {ok && <p className="ok">{ok}</p>}
    </div>
  )
}
