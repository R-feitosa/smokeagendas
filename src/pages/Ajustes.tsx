import { useEffect, useState } from 'react'
import { ativarPush, desativarPush, ehIOS, estaInstalado, statusPush } from '../lib/push'
import { entradaAutomatica, supabase } from '../lib/supabase'

type Status = Awaited<ReturnType<typeof statusPush>>

export function Ajustes() {
  const [status, setStatus] = useState<Status>('inativo')
  const [erro, setErro] = useState<string | null>(null)
  const precisaInstalar = ehIOS() && !estaInstalado()

  useEffect(() => {
    statusPush().then(setStatus)
  }, [])

  async function alternar() {
    setErro(null)
    try {
      if (status === 'ativo') await desativarPush()
      else await ativarPush()
      setStatus(await statusPush())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível alterar as notificações')
    }
  }

  return (
    <section>
      <h2>Ajustes</h2>

      <h3>Notificações</h3>
      {precisaInstalar ? (
        <p className="aviso">
          No iPhone, as notificações só funcionam com o app instalado. Toque em <strong>Compartilhar</strong> →{' '}
          <strong>Adicionar à Tela de Início</strong> e abra o app por lá.
        </p>
      ) : status === 'indisponivel' ? (
        <p className="aviso">Este navegador não suporta notificações push.</p>
      ) : status === 'negado' ? (
        <p className="aviso">Você bloqueou as notificações. Libere nas configurações do navegador/aparelho.</p>
      ) : (
        <button className="btn" onClick={alternar}>
          {status === 'ativo' ? 'Desativar neste aparelho' : 'Ativar lembretes neste aparelho'}
        </button>
      )}
      {status === 'ativo' && <p className="ok">✓ Lembretes ativos neste aparelho</p>}
      {erro && <p className="erro">{erro}</p>}

      {!entradaAutomatica && (
        <>
          <h3>Conta</h3>
          <button className="btn btn--sec" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        </>
      )}
    </section>
  )
}
