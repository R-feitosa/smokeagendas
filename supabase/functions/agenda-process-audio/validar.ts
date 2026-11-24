// Confere e normaliza o que o modelo devolveu. O modelo pode errar formato
// mesmo com JSON schema "strict" (ex.: data sem offset, minutos negativos),
// e o banco recusaria — melhor corrigir aqui ou falhar com mensagem clara.
import type { Rascunho } from './extrair.ts'

export class RascunhoInvalido extends Error {}

// ISO 8601 com data, hora e offset explícito (Z ou ±HH:MM)
const ISO_COM_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const RECORRENCIAS = new Set(['diaria', 'semanal', 'mensal'])
const MAX_ANTECEDENCIA = 7 * 24 * 60 // igual ao check do banco

function data(v: unknown): Date | null {
  if (typeof v !== 'string' || !ISO_COM_OFFSET.test(v)) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function validarRascunho(bruto: unknown): Rascunho {
  if (!bruto || typeof bruto !== 'object') throw new RascunhoInvalido('resposta vazia')
  const r = bruto as Record<string, unknown>

  const titulo = typeof r.titulo === 'string' ? r.titulo.trim().slice(0, 200) : ''
  if (!titulo) throw new RascunhoInvalido('sem título')

  const inicio = data(r.inicio)
  if (!inicio) throw new RascunhoInvalido(`início inválido: ${String(r.inicio)}`)

  // fim inválido ou antes do início não derruba o rascunho: só é descartado
  const fimData = data(r.fim)
  const fim = fimData && fimData >= inicio ? (r.fim as string) : null

  const descricao =
    typeof r.descricao === 'string' && r.descricao.trim() ? r.descricao.trim().slice(0, 2000) : null

  const min = Number(r.lembrar_min_antes)
  const lembrar_min_antes = Number.isFinite(min)
    ? Math.min(MAX_ANTECEDENCIA, Math.max(0, Math.round(min)))
    : 30

  const recorrencia =
    typeof r.recorrencia === 'string' && RECORRENCIAS.has(r.recorrencia)
      ? (r.recorrencia as Rascunho['recorrencia'])
      : null

  return { titulo, descricao, inicio: r.inicio as string, fim, lembrar_min_antes, recorrencia }
}
