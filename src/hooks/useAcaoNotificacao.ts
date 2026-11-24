import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { adiarLembrete, concluirEvento } from '../lib/api'

/**
 * Os botões da notificação abrem o app em /?acao=concluir|adiar&id=...
 * Aqui a ação é executada e a URL é limpa.
 */
export function useAcaoNotificacao(onFeito: () => void) {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const acao = params.get('acao')
    const id = params.get('id')
    if (!acao || !id) return

    const rodar = acao === 'concluir' ? concluirEvento(id) : acao === 'adiar' ? adiarLembrete(id, 10) : null
    rodar?.finally(() => {
      navigate('/', { replace: true })
      onFeito()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
}
