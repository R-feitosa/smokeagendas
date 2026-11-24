export type Recorrencia = 'diaria' | 'semanal' | 'mensal' | null
export type StatusEvento = 'pendente' | 'concluido' | 'cancelado'

export type Evento = {
  id: string
  user_id: string
  titulo: string
  descricao: string | null
  inicio: string // ISO (timestamptz)
  fim: string | null
  lembrar_min_antes: number
  adiar_ate: string | null
  lembrete_enviado_em: string | null
  recorrencia: Recorrencia
  status: StatusEvento
  transcricao: string | null
}

/** O que a IA devolve e o usuário confere antes de salvar */
export type Rascunho = {
  titulo: string
  descricao: string | null
  inicio: string
  fim: string | null
  lembrar_min_antes: number
  recorrencia: Recorrencia
  transcricao: string | null
}
