import { useEffect, useState } from 'react'
import { ativarPush, desativarPush, ehIOS, estaInstalado, statusPush, testarNotificacao } from '../lib/push'
import { tocarAlerta } from '../lib/som'
import { salvarEquipe, useEquipe } from '../lib/equipe'
import { entradaAutomatica, supabase } from '../lib/supabase'

type Status = Awaited<ReturnType<typeof statusPush>>

export function Ajustes() {
  const [status, setStatus] = useState<Status>('inativo')
  const [erro, setErro] = useState<string | null>(null)
  const precisaInstalar = ehIOS() && !estaInstalado()
  const equipe = useEquipe()
  const [textoEquipe, setTextoEquipe] = useState<string | null>(null)
  const [msgEquipe, setMsgEquipe] = useState<string | null>(null)
  const [msgVersao, setMsgVersao] = useState<string | null>(null)

  async function procurarAtualizacao() {
    setMsgVersao('Procurando…')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
      if (reg?.installing || reg?.waiting) {
        setMsgVersao('Versão nova encontrada. Recarregando…')
        // normalmente recarrega sozinho ao assumir; garante caso demore
        setTimeout(() => window.location.reload(), 4000)
      } else {
        setMsgVersao('Você já está na versão mais recente.')
      }
    } catch {
      setMsgVersao('Sem conexão para procurar atualização.')
    }
  }

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

      {status === 'ativo' && (
        <>
          <h3>Som do lembrete</h3>
          <div className="ajustes__acoes">
            <button
              className="btn"
              onClick={() => testarNotificacao().catch(() => setErro('Não foi possível mostrar a notificação de teste'))}
            >
              Testar notificação
            </button>
            <button className="btn btn--sec" onClick={tocarAlerta}>
              Ouvir alarme do app
            </button>
          </div>
          <p className="sub">
            Com o app aberto, o lembrete toca o alarme acima. Com o app fechado, quem decide o som é o celular:
          </p>
          <details className="ajuda">
            <summary>Notificação chegou sem som no Android</summary>
            <ol>
              <li>
                Toque e segure o ícone do app na tela inicial → <strong>Informações do app</strong> →{' '}
                <strong>Notificações</strong>. Se usa pelo navegador, vá em <strong>Configurações do Android → Apps → Chrome →
                Notificações</strong> e procure <strong>somkeagendas.vercel.app</strong> (em "Sites").
              </li>
              <li>
                Na categoria do site, troque de <strong>Silenciosa</strong> para <strong>Alertar</strong> (ou "Padrão") e ligue
                <strong> Som</strong> e <strong>Vibração</strong>. Em Xiaomi/Samsung, ative também "Pop-up"/"Mostrar na tela de bloqueio".
              </li>
              <li>Confira se o modo <strong>Não perturbe</strong> está desligado e toque em <strong>Testar notificação</strong>.</li>
            </ol>
          </details>
          <details className="ajuda">
            <summary>Notificação chegou sem som no iPhone</summary>
            <ol>
              <li>
                <strong>Ajustes → Notificações → Agenda</strong> (o app instalado na tela de início) → ligue <strong>Sons</strong> e
                <strong> Alertas</strong>.
              </li>
              <li>Confira o modo <strong>Foco/Não perturbe</strong> e a chave lateral de silencioso.</li>
            </ol>
          </details>
        </>
      )}

      <h3>Minha equipe</h3>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            const salvos = await salvarEquipe((textoEquipe ?? equipe.join(', ')).split(','))
            setTextoEquipe(null)
            setMsgEquipe(salvos.length ? `Equipe salva: ${salvos.join(', ')}` : 'Equipe removida')
          } catch {
            setMsgEquipe('Não foi possível salvar a equipe')
          }
        }}
      >
        <label>
          Nomes separados por vírgula (aparecem no filtro Minha | Equipe e em "De quem é")
          <input
            id="equipe"
            value={textoEquipe ?? equipe.join(', ')}
            onChange={(e) => setTextoEquipe(e.target.value)}
            placeholder="Ex.: Toyota, Aristides"
          />
        </label>
        <button className="btn btn--sec" disabled={textoEquipe === null}>
          Salvar equipe
        </button>
        {msgEquipe && <p className="ok">{msgEquipe}</p>}
      </form>

      {!entradaAutomatica && (
        <>
          <h3>Conta</h3>
          <button className="btn btn--sec" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        </>
      )}

      <h3>Versão</h3>
      <p className="sub">Versão {__VERSAO__}</p>
      <button className="btn btn--sec" onClick={procurarAtualizacao}>
        Procurar atualização
      </button>
      {msgVersao && <p className="sub">{msgVersao}</p>}
    </section>
  )
}
