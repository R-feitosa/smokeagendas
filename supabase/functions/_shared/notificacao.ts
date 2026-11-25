// Monta o payload do push — função pura, coberta por notificacao_test.ts.
import { textoQuando } from './datas.ts'

export type LembreteParaPush = {
  id: string
  titulo: string
  descricao: string | null
  inicio: string
  fuso: string
  envio: number // 1 = primeiro aviso; 2+ = reenvio
  /** membro da equipe dono do compromisso (null/ausente = do dono da conta) */
  responsavel?: string | null
}

export type PayloadPush = {
  title: string
  body: string
  tag: string
  eventId: string
  envio: number
  url: string
}

export function montarNotificacao(l: LembreteParaPush, agora = new Date()): PayloadPush {
  const quando = textoQuando(new Date(l.inicio), l.fuso, agora)
  const reenvio = l.envio > 1
  // compromisso da equipe: o nome vem na frente ("Toyota: Visita ao cliente")
  const responsavel = l.responsavel?.trim()
  const assunto = responsavel ? `${responsavel}: ${l.titulo}` : l.titulo
  return {
    // no reenvio o título deixa claro que é insistência, não um compromisso novo
    title: reenvio ? `Ainda pendente — ${assunto}` : assunto,
    body: `${quando}${l.descricao ? ` — ${l.descricao}` : ''}`,
    // tag diferente a cada envio: garante som/vibração de novo em todo navegador.
    // O service worker fecha os avisos anteriores do mesmo evento (eventId).
    tag: `${l.id}:${l.envio}`,
    eventId: l.id,
    envio: l.envio,
    url: '/',
  }
}
