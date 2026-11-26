/**
 * Vistoria de saída — dois modelos: 'saida_v1' (apartamento/sala) e 'temporada_v1'
 * (casa de temporada, ver SECOES_TEMPORADA). O 'saida_v1' foi copiado do "Checklist de vistoria de saída"
 * da Feitosa (PDF de 18/11/2026, AP 304 · Feitosa II). As respostas ficam em
 * agenda.vistorias (migration 0010) por chave de item: mudar o TEXTO de um item é
 * seguro; mudar a CHAVE perde a resposta antiga — para isso, crie um modelo novo.
 * Funções puras (sem rede), testadas em tests/front/vistoria.test.ts.
 */

export type Avaliacao = 'otimo' | 'bom' | 'ruim' | 'na'
export type RespostaItem = { avaliacao?: Avaliacao; obs?: string }
export type RespostaOperacional = { ok?: boolean; obs?: string }

export type Vistoria = {
  id: string
  unidade_id: string
  tipo: 'saida'
  modelo: string
  status: 'em_andamento' | 'concluida'
  locatario: string | null
  data_vistoria: string // AAAA-MM-DD
  cidade: string
  locador: string
  respostas: Record<string, RespostaItem>
  operacional: Record<string, RespostaOperacional>
  pendencias: string | null
  criada_em: string
  atualizada_em: string | null
  concluida_em: string | null
  vistoriador_nome: string | null
}

export const AVALIACOES: [Avaliacao, string][] = [
  ['otimo', 'Ótimo'],
  ['bom', 'Bom'],
  ['ruim', 'Ruim'],
  ['na', 'N/A'],
]

export type Secao = { id: string; titulo: string; subtitulo: string; itens: { id: string; rotulo: string }[] }

/** Apartamento/sala — seções 1 e 2 do PDF: cada item recebe Ótimo | Bom | Ruim | N/A + observação */
export const SECOES: Secao[] = [
  {
    id: 'quarto',
    titulo: '1 Quarto',
    subtitulo: 'Avaliação do ambiente interno',
    itens: [
      { id: 'quarto.pintura_paredes', rotulo: 'Pintura das paredes' },
      { id: 'quarto.pintura_forro', rotulo: 'Pintura do forro' },
      { id: 'quarto.piso', rotulo: 'Piso' },
      { id: 'quarto.revestimento', rotulo: 'Revestimento cerâmico' },
      { id: 'quarto.tomadas', rotulo: 'Tomadas' },
      { id: 'quarto.lampadas', rotulo: 'Lâmpadas / pontos de luz' },
      { id: 'quarto.interruptores', rotulo: 'Interruptores' },
    ],
  },
  {
    id: 'banheiro',
    titulo: '2 Banheiro',
    subtitulo: 'Louças, metais e acabamentos',
    itens: [
      { id: 'banheiro.revestimento', rotulo: 'Revestimento cerâmico' },
      { id: 'banheiro.pintura_paredes', rotulo: 'Pintura das paredes' },
      { id: 'banheiro.piso', rotulo: 'Piso' },
      { id: 'banheiro.pia', rotulo: 'Pia / lavatório' },
      { id: 'banheiro.lampadas', rotulo: 'Lâmpadas / pontos de luz' },
      { id: 'banheiro.tomadas', rotulo: 'Tomadas' },
      { id: 'banheiro.torneiras', rotulo: 'Torneiras' },
      { id: 'banheiro.vaso', rotulo: 'Vaso sanitário' },
      { id: 'banheiro.chuveiro', rotulo: 'Chuveiro' },
      { id: 'banheiro.fechadura', rotulo: 'Fechadura' },
      { id: 'banheiro.kit', rotulo: 'Kit de banheiro' },
    ],
  },
]

/** Apartamento/sala — seção 3 do PDF: checklist operacional de saída (feito + observação) */
export const OPERACIONAL: { id: string; rotulo: string }[] = [
  { id: 'desocupado', rotulo: 'Imóvel desocupado e liberado' },
  { id: 'limpeza', rotulo: 'Limpeza geral do imóvel verificada' },
  { id: 'portas', rotulo: 'Portas, fechaduras e acessos conferidos' },
  { id: 'chaves', rotulo: 'Chaves / controles recebidos e conferidos' },
  { id: 'fotos', rotulo: 'Registros fotográficos realizados e identificados' },
  { id: 'avarias', rotulo: 'Eventuais avarias ou divergências descritas neste documento' },
]

export const DECLARACAO =
  'As partes declaram que os itens assinalados e as observações registradas neste documento correspondem às condições aparentes constatadas na vistoria de saída. A assinatura confirma ciência do conteúdo, sem implicar quitação financeira ou aprovação automática de itens não verificados.'

// ---- casa de temporada: modelo 'temporada_v1', do PDF da Casa da Serra (Chalé da Serra da Meruoca, 22/11/2026) ----

export const SECOES_TEMPORADA: Secao[] = [
  {
    id: 'acessos',
    titulo: '1 Acessos e áreas externas',
    subtitulo: 'Portões, segurança e áreas de lazer',
    itens: [
      { id: 'acessos.portao_da_frente', rotulo: 'Portão da frente' },
      { id: 'acessos.interfone', rotulo: 'Interfone' },
      { id: 'acessos.cerca', rotulo: 'Cerca' },
      { id: 'acessos.cameras', rotulo: 'Câmeras' },
      { id: 'acessos.fechadura_eletronica', rotulo: 'Fechadura eletrônica' },
      { id: 'acessos.controles_e_chaves_das_portas_e_portoes', rotulo: 'Controles e chaves das portas e portões' },
      { id: 'acessos.area_de_servico_comum', rotulo: 'Área de serviço comum' },
      { id: 'acessos.mesas_e_cadeiras_da_varanda', rotulo: 'Mesas e cadeiras da varanda' },
      { id: 'acessos.cadeira_suspensa_da_varanda', rotulo: 'Cadeira suspensa da varanda' },
      { id: 'acessos.piscina', rotulo: 'Piscina' },
      { id: 'acessos.hidromassagem_cascata', rotulo: 'Hidromassagem / cascata' },
      { id: 'acessos.pula_pula_da_varanda', rotulo: 'Pula-pula da varanda' },
      { id: 'acessos.churrasqueira_e_grelha', rotulo: 'Churrasqueira e grelha' },
      { id: 'acessos.bomba_do_poco', rotulo: 'Bomba do poço' },
      { id: 'acessos.bomba_da_caixa_dagua', rotulo: 'Bomba da caixa d’água' },
    ],
  },
  {
    id: 'estrutura',
    titulo: '2 Estrutura e acabamentos',
    subtitulo: 'Instalações, revestimentos e banheiro',
    itens: [
      { id: 'estrutura.pintura', rotulo: 'Pintura' },
      { id: 'estrutura.piso', rotulo: 'Piso' },
      { id: 'estrutura.tomadas', rotulo: 'Tomadas' },
      { id: 'estrutura.interruptores', rotulo: 'Interruptores' },
      { id: 'estrutura.lampadas_e_trilhos', rotulo: 'Lâmpadas e trilhos' },
      { id: 'estrutura.janelas', rotulo: 'Janelas' },
      { id: 'estrutura.torneiras', rotulo: 'Torneiras' },
      { id: 'estrutura.portas_de_madeira', rotulo: 'Portas de madeira' },
      { id: 'estrutura.bancadas_de_granito_lavanderia_cozinha_e', rotulo: 'Bancadas de granito - lavanderia, cozinha e banheiro' },
      { id: 'estrutura.ceramica_e_revestimentos_cozinha_e_banhe', rotulo: 'Cerâmica e revestimentos - cozinha e banheiro' },
      { id: 'estrutura.chuveiros', rotulo: 'Chuveiros' },
      { id: 'estrutura.vaso_sanitario', rotulo: 'Vaso sanitário' },
      { id: 'estrutura.pias', rotulo: 'Pias' },
      { id: 'estrutura.espelhos', rotulo: 'Espelhos' },
      { id: 'estrutura.kit_de_banheiro', rotulo: 'Kit de banheiro' },
      { id: 'estrutura.blindex', rotulo: 'Blindex' },
      { id: 'estrutura.roteador_de_internet_wi_fi', rotulo: 'Roteador de internet / Wi-Fi' },
    ],
  },
  {
    id: 'cozinha',
    titulo: '3 Cozinha e eletrodomésticos',
    subtitulo: 'Utensílios, equipamentos e apoio',
    itens: [
      { id: 'cozinha.escorredor', rotulo: 'Escorredor' },
      { id: 'cozinha.pia_da_cozinha', rotulo: 'Pia da cozinha' },
      { id: 'cozinha.armarios_da_cozinha', rotulo: 'Armários da cozinha' },
      { id: 'cozinha.cadeiras_da_cozinha', rotulo: 'Cadeiras da cozinha' },
      { id: 'cozinha.lixeiros', rotulo: 'Lixeiros' },
      { id: 'cozinha.geladeira', rotulo: 'Geladeira' },
      { id: 'cozinha.gelagua', rotulo: 'Gelágua' },
      { id: 'cozinha.cooktop', rotulo: 'Cooktop' },
      { id: 'cozinha.micro_ondas', rotulo: 'Micro-ondas' },
      { id: 'cozinha.sanduicheira', rotulo: 'Sanduicheira' },
      { id: 'cozinha.liquidificador', rotulo: 'Liquidificador' },
      { id: 'cozinha.forno', rotulo: 'Forno' },
      { id: 'cozinha.garrafao_de_agua', rotulo: 'Garrafão de água' },
      { id: 'cozinha.xicaras', rotulo: 'Xícaras' },
      { id: 'cozinha.pratos', rotulo: 'Pratos' },
      { id: 'cozinha.talheres', rotulo: 'Talheres' },
      { id: 'cozinha.panos_de_prato', rotulo: 'Panos de prato (7)' },
      { id: 'cozinha.copos', rotulo: 'Copos' },
      { id: 'cozinha.panelas', rotulo: 'Panelas' },
      { id: 'cozinha.saca_rolha', rotulo: 'Saca-rolha' },
    ],
  },
  {
    id: 'mobiliario',
    titulo: '4 Mobiliário e enxoval',
    subtitulo: 'Sala, quartos e itens de hospedagem',
    itens: [
      { id: 'mobiliario.tv_led_40_polegadas', rotulo: 'TV LED 40 polegadas' },
      { id: 'mobiliario.tv_led_32_polegadas', rotulo: 'TV LED 32 polegadas' },
      { id: 'mobiliario.poltronas', rotulo: 'Poltronas' },
      { id: 'mobiliario.sofa', rotulo: 'Sofá' },
      { id: 'mobiliario.mesa_de_centro', rotulo: 'Mesa de centro' },
      { id: 'mobiliario.redes', rotulo: 'Redes' },
      { id: 'mobiliario.camas', rotulo: 'Camas' },
      { id: 'mobiliario.ventiladores', rotulo: 'Ventiladores' },
      { id: 'mobiliario.armarios_dos_quartos', rotulo: 'Armários dos quartos' },
      { id: 'mobiliario.bercarios', rotulo: 'Berçários' },
      { id: 'mobiliario.toalhas_de_corpo', rotulo: 'Toalhas de corpo (4)' },
      { id: 'mobiliario.toalhas_de_rosto', rotulo: 'Toalhas de rosto (4)' },
      { id: 'mobiliario.travesseiros_com_fronhas', rotulo: 'Travesseiros com fronhas (6)' },
      { id: 'mobiliario.mantas', rotulo: 'Mantas (5)' },
      { id: 'mobiliario.lencois_com_elastico', rotulo: 'Lençóis com elástico (4)' },
      { id: 'mobiliario.lencois_sem_elastico', rotulo: 'Lençóis sem elástico (12)' },
    ],
  },
]

export const OPERACIONAL_TEMPORADA: { id: string; rotulo: string }[] = [
  { id: 'desocupado', rotulo: 'Imóvel desocupado e disponível para conferência' },
  { id: 'limpeza', rotulo: 'Limpeza geral do imóvel verificada' },
  { id: 'portas', rotulo: 'Portas, fechaduras e acessos conferidos' },
  { id: 'chaves', rotulo: 'Chaves e controles devolvidos e conferidos' },
  { id: 'fotos', rotulo: 'Registros fotográficos de saída realizados e identificados' },
  { id: 'avarias', rotulo: 'Eventuais avarias ou divergências descritas neste documento' },
]

export const DECLARACAO_TEMPORADA =
  'Declaro que a presente ficha registra as condições aparentes verificadas no imóvel na data da vistoria de saída, conforme os itens acima avaliados e as observações eventualmente consignadas. Este registro servirá como referência do estado de conservação do imóvel na devolução da locação. As assinaturas abaixo confirmam a realização da vistoria e o conhecimento do conteúdo deste documento.'

export type Modelo = {
  id: string
  subtitulo: string
  secoes: Secao[]
  operacional: { id: string; rotulo: string }[]
  declaracao: string
}

export const MODELOS: Record<string, Modelo> = {
  saida_v1: {
    id: 'saida_v1',
    subtitulo: 'Registro das condições aparentes do imóvel na data da vistoria',
    secoes: SECOES,
    operacional: OPERACIONAL,
    declaracao: DECLARACAO,
  },
  temporada_v1: {
    id: 'temporada_v1',
    subtitulo: 'Registro do estado de conservação do imóvel na devolução da locação',
    secoes: SECOES_TEMPORADA,
    operacional: OPERACIONAL_TEMPORADA,
    declaracao: DECLARACAO_TEMPORADA,
  },
}

/** Modelo da vistoria (o banco escolhe: casa de temporada → temporada_v1; resto → saida_v1) */
export function modeloDe(v: Pick<Vistoria, 'modelo'>): Modelo {
  return MODELOS[v.modelo] ?? MODELOS.saida_v1
}

export type Progresso = {
  avaliados: number
  total: number
  ruins: { id: string; rotulo: string; secao: string }[]
  /** o que falta para concluir; vazio = pode concluir */
  faltando: string[]
}

/** Quanto falta: todo item avaliado; item "Ruim" exige observação (como pede o PDF) */
/**
 * Só conclui (e só então gera o documento) com TUDO conferido:
 *   - todos os itens avaliados, e todo item "Ruim" com a avaria descrita;
 *   - quando a vistoria completa é passada (operacional/locatário presentes): cada item do
 *     checklist operacional marcado OU com observação (ex.: "Não consta"), e o nome do locatário.
 */
export function progresso(
  v: Pick<Vistoria, 'respostas'> & Partial<Pick<Vistoria, 'modelo' | 'operacional' | 'locatario'>>,
): Progresso {
  const r = v.respostas ?? {}
  const modelo = modeloDe({ modelo: v.modelo ?? 'saida_v1' })
  const secoes = modelo.secoes
  const TODOS_ITENS = secoes.flatMap((s) => s.itens)
  const avaliados = TODOS_ITENS.filter((i) => r[i.id]?.avaliacao).length
  const ruins = secoes.flatMap((s) => s.itens.filter((i) => r[i.id]?.avaliacao === 'ruim').map((i) => ({ ...i, secao: s.titulo })))
  const faltando: string[] = []
  const semNota = TODOS_ITENS.length - avaliados
  if (semNota > 0) faltando.push(`${semNota} ${semNota === 1 ? 'item sem avaliação' : 'itens sem avaliação'}`)
  const ruimSemObs = ruins.filter((i) => !r[i.id]?.obs?.trim()).length
  if (ruimSemObs > 0) faltando.push(`${ruimSemObs} ${ruimSemObs === 1 ? 'item ruim sem descrição da avaria' : 'itens ruins sem descrição da avaria'}`)
  if (v.operacional !== undefined) {
    const o = v.operacional ?? {}
    const operSemResposta = modelo.operacional.filter((i) => !o[i.id]?.ok && !o[i.id]?.obs?.trim()).length
    if (operSemResposta > 0)
      faltando.push(`${operSemResposta} ${operSemResposta === 1 ? 'item do checklist operacional sem marcar' : 'itens do checklist operacional sem marcar'} (marque ou escreva a observação)`)
  }
  if (v.locatario !== undefined && !v.locatario?.trim()) faltando.push('o nome do locatário')
  return { avaliados, total: TODOS_ITENS.length, ruins, faltando }
}

/** Texto sugerido para "Pendências" a partir dos itens ruins: "Quarto: pintura das paredes (manchas)." */
export function sugerirPendencias(v: Pick<Vistoria, 'respostas'> & Partial<Pick<Vistoria, 'modelo'>>): string {
  return progresso(v)
    .ruins.map((i) => {
      const obs = v.respostas[i.id]?.obs?.trim()
      return `${i.secao.replace(/^\d+\s*/, '')}: ${i.rotulo.toLowerCase()}${obs ? ` (${obs})` : ''}.`
    })
    .join('\n')
}

/** "2026-11-18" -> "18/11/2026" (sem passar por fuso: é uma data de calendário) */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** Mesmo nome do quadro: "Feitosa 2 · Apto 304" | "Connect Office · Sala 102" */
export function rotuloUnidade(predio: string, numero: string, tipo: 'apartamento' | 'sala' | 'imovel'): string {
  if (tipo === 'imovel') return predio
  return `${predio} · ${tipo === 'sala' ? 'Sala' : 'Apto'} ${numero}`
}
