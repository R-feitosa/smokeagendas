import type { Predio, StatusUnidade, Unidade } from './types'

/**
 * Regras de exibição da aba Apartamentos — funções puras (sem rede), testadas em
 * tests/front/apartamentos.test.ts.
 */

export type FiltroStatus = 'todos' | StatusUnidade

export type Resumo = {
  total: number
  vagos: number
  ocupados: number
  /** ocupados ÷ total, de 0 a 1 (0 quando não há unidades) */
  ocupacao: number
}

export function resumir(unidades: Pick<Unidade, 'status'>[]): Resumo {
  const total = unidades.length
  const vagos = unidades.filter((u) => u.status === 'vago').length
  const ocupados = total - vagos
  return { total, vagos, ocupados, ocupacao: total ? ocupados / total : 0 }
}

/** Ordem da porta: "2" antes de "10", "104" antes de "201" */
export function ordenarUnidades<T extends Pick<Unidade, 'numero'>>(unidades: T[]): T[] {
  return [...unidades].sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }))
}

/**
 * Fileiras do prédio no quadro: quando a numeração é por centena (101–104, 201–204…),
 * cada centena fica na própria fileira; numeração corrida (1–34) vira uma fileira só,
 * que a grade quebra sozinha. Números que não são só dígitos vão para o fim.
 */
export function fileiras<T extends Pick<Unidade, 'numero'>>(unidades: T[]): T[][] {
  const grupos = new Map<number, T[]>()
  for (const u of ordenarUnidades(unidades)) {
    const n = /^\d+$/.test(u.numero) ? Math.floor(Number(u.numero) / 100) : Number.POSITIVE_INFINITY
    grupos.set(n, [...(grupos.get(n) ?? []), u])
  }
  return [...grupos.entries()].sort(([a], [b]) => a - b).map(([, us]) => us)
}

/** 0.88235 -> "88,2%" */
export function porcentagem(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** "8 vagos", "1 vago", "nenhum vago" */
export function contagemVagos(n: number): string {
  return n === 0 ? 'nenhum vago' : `${n} ${n === 1 ? 'vago' : 'vagos'}`
}

const ROTULO_STATUS: Record<StatusUnidade, string> = { vago: 'Vago', ocupado: 'Ocupado' }
export const rotuloStatus = (s: StatusUnidade): string => ROTULO_STATUS[s]

/** "Apto 304" | "Sala 102" | casa de temporada: o nome do imóvel */
export function nomeUnidade(predio: Pick<Predio, 'tipo_unidade' | 'nome'>, unidade: Pick<Unidade, 'numero'>): string {
  if (predio.tipo_unidade === 'imovel') return predio.nome
  return `${predio.tipo_unidade === 'sala' ? 'Sala' : 'Apto'} ${unidade.numero}`
}

/** "Feitosa 2 · Apto 304" | "Casa da Serra" */
export function rotuloCompleto(predio: Pick<Predio, 'tipo_unidade' | 'nome'>, unidade: Pick<Unidade, 'numero'>): string {
  return predio.tipo_unidade === 'imovel' ? predio.nome : `${predio.nome} · ${nomeUnidade(predio, unidade)}`
}

/** Por extenso, para leitores de tela: "Apartamento 304" | "Sala 102" */
export function nomeUnidadePorExtenso(predio: Pick<Predio, 'tipo_unidade' | 'nome'>, unidade: Pick<Unidade, 'numero'>): string {
  if (predio.tipo_unidade === 'imovel') return predio.nome
  return `${predio.tipo_unidade === 'sala' ? 'Sala' : 'Apartamento'} ${unidade.numero}`
}
