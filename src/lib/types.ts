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
  /** null = do dono da conta; nome = membro da equipe */
  responsavel: string | null
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
  equipe: string[]
}

// ---- aba Apartamentos (dados do escritório, compartilhados entre os usuários habilitados) ----

export type StatusUnidade = 'vago' | 'ocupado'

/** Apartamento ou sala (agenda.unidades) */
export type Unidade = {
  id: string
  predio_id: string
  /** como está na porta: "304", "12" */
  numero: string
  status: StatusUnidade
  /** início do status atual; null = não se sabe (veio da carga inicial) */
  status_desde: string | null
  atualizado_em: string | null
  atualizado_por_nome: string | null
}

/** Prédio com as suas unidades (agenda.predios) */
export type Predio = {
  id: string
  nome: string
  /** 'imovel' = casa de temporada: uma unidade só, chamada pelo nome do imóvel */
  tipo_unidade: 'apartamento' | 'sala' | 'imovel'
  /** locacao = prédio de apartamentos/salas; temporada = casa de temporada */
  categoria: 'locacao' | 'temporada'
  /** quem pode mudar o status (null = qualquer habilitado); nome para a tela */
  editavel_por_nome: string | null
  /** calculado no app: a pessoa logada pode mudar o status das unidades deste prédio */
  pode_alterar: boolean
  ordem: number
  unidades: Unidade[]
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
  /** de quem é (equipe); null = do dono da conta */
  responsavel?: string | null
}
