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
  /** avisos já enviados no ciclo atual (1º + reenvios) */
  lembretes_enviados: number
  /** série recorrente: mesma para todas as ocorrências */
  serie_id: string | null
  ocorrencia_n: number | null
  /** repetição calculada (ainda não gravada no banco): só para exibir no calendário */
  prevista?: boolean
}

/** Preferências da pessoa (agenda.perfis) */
export type Perfil = {
  id: string
  nome: string | null
  fuso: string
  reenviar_a_cada_min: number
  max_reenvios: number
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
