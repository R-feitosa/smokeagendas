/**
 * Vistoria de saída — modelo 'saida_v1', copiado do "Checklist de vistoria de saída"
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

/** Seções 1 e 2 do PDF: cada item recebe Ótimo | Bom | Ruim | N/A + observação */
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

/** Seção 3 do PDF: checklist operacional de saída (feito + observação) */
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

const TODOS_ITENS = SECOES.flatMap((s) => s.itens)

export type Progresso = {
  avaliados: number
  total: number
  ruins: { id: string; rotulo: string; secao: string }[]
  /** o que falta para concluir; vazio = pode concluir */
  faltando: string[]
}

/** Quanto falta: todo item avaliado; item "Ruim" exige observação (como pede o PDF) */
export function progresso(v: Pick<Vistoria, 'respostas'>): Progresso {
  const r = v.respostas ?? {}
  const avaliados = TODOS_ITENS.filter((i) => r[i.id]?.avaliacao).length
  const ruins = SECOES.flatMap((s) => s.itens.filter((i) => r[i.id]?.avaliacao === 'ruim').map((i) => ({ ...i, secao: s.titulo })))
  const faltando: string[] = []
  const semNota = TODOS_ITENS.length - avaliados
  if (semNota > 0) faltando.push(`${semNota} ${semNota === 1 ? 'item sem avaliação' : 'itens sem avaliação'}`)
  const ruimSemObs = ruins.filter((i) => !r[i.id]?.obs?.trim()).length
  if (ruimSemObs > 0) faltando.push(`${ruimSemObs} ${ruimSemObs === 1 ? 'item ruim sem descrição da avaria' : 'itens ruins sem descrição da avaria'}`)
  return { avaliados, total: TODOS_ITENS.length, ruins, faltando }
}

/** Texto sugerido para "Pendências" a partir dos itens ruins: "Quarto: pintura das paredes (manchas)." */
export function sugerirPendencias(v: Pick<Vistoria, 'respostas'>): string {
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
