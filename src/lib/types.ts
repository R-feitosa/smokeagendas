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

// ---------------------------------------------------------------
// Ordens de Serviço (schema agenda, migration 0004)
// ---------------------------------------------------------------
export type StatusOS = 'aberta' | 'em_andamento' | 'aguardando_peca' | 'concluida' | 'cancelada'
export type TipoOS = 'corretiva' | 'preventiva' | 'instalacao' | 'garantia' | 'vistoria' | 'outro'
export type PrioridadeOS = 'baixa' | 'media' | 'alta' | 'urgente'
export type MomentoFoto = 'antes' | 'durante' | 'depois'

export type OrdemServico = {
  id: string
  user_id: string
  numero: string
  cliente: string
  unidade: string | null
  solicitante: string | null
  contato: string | null
  tecnico: string | null
  tipo: TipoOS
  prioridade: PrioridadeOS
  equipamento: string | null
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  patrimonio: string | null
  problema: string
  diagnostico: string | null
  servico_executado: string | null
  pecas: string | null
  observacoes: string | null
  valor: number | null
  status: StatusOS
  prazo: string | null
  aberta_em: string
  iniciada_em: string | null
  concluida_em: string | null
  cancelada_em: string | null
  motivo_cancelamento: string | null
  atualizada_em: string
}

/** Campos que a pessoa preenche (o resto o servidor carimba) */
export type DadosOS = Pick<
  OrdemServico,
  | 'cliente' | 'unidade' | 'solicitante' | 'contato' | 'tecnico' | 'tipo' | 'prioridade'
  | 'equipamento' | 'marca' | 'modelo' | 'numero_serie' | 'patrimonio' | 'problema'
  | 'diagnostico' | 'servico_executado' | 'pecas' | 'observacoes' | 'valor' | 'prazo'
>

export type FotoOS = {
  id: string
  os_id: string
  momento: MomentoFoto
  caminho: string
  legenda: string | null
  tamanho_bytes: number | null
  largura: number | null
  altura: number | null
  criado_em: string
  /** URL assinada temporária (preenchida no app) */
  url?: string
}

export type HistoricoOS = {
  id: number
  quando: string
  acao: 'abertura' | 'status' | 'foto_incluida' | 'foto_removida' | 'edicao'
  de: string | null
  para: string | null
  detalhe: string | null
}
