// Datas e fusos — funções puras (sem I/O), cobertas por datas_test.ts.

export const FUSO_PADRAO = 'America/Fortaleza'

/** Devolve o fuso se for um nome IANA válido; senão, o padrão. */
export function fusoOuPadrao(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return FUSO_PADRAO
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return FUSO_PADRAO
  }
}

type Partes = { ano: number; mes: number; dia: number; hora: number; min: number; diaSemana: string }

function partes(d: Date, tz: string): Partes {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    min: Number(p.minute),
    diaSemana: p.weekday,
  }
}

/** Offset do fuso naquele instante, no formato ISO: "-03:00". */
export function offsetDoFuso(d: Date, tz: string): string {
  const p = partes(d, tz)
  const comoUTC = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.min)
  const minutos = Math.round((comoUTC - Math.floor(d.getTime() / 60_000) * 60_000) / 60_000)
  const sinal = minutos < 0 ? '-' : '+'
  const abs = Math.abs(minutos)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${sinal}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * "Agora" por extenso no fuso da pessoa, para o modelo resolver "sexta que vem":
 * "quinta-feira, 2026-11-26 15:04 (UTC-03:00)".
 */
export function descreverAgora(d: Date, tz: string): string {
  const p = partes(d, tz)
  return `${p.diaSemana}, ${p.ano}-${pad2(p.mes)}-${pad2(p.dia)} ${pad2(p.hora)}:${pad2(p.min)} (UTC${offsetDoFuso(d, tz)})`
}

/** Dias de calendário entre `agora` e `alvo`, no fuso informado (0 = hoje). */
function diasEntre(agora: Date, alvo: Date, tz: string): number {
  const a = partes(agora, tz)
  const b = partes(alvo, tz)
  return Math.round((Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86_400_000)
}

/** Texto do lembrete: "Hoje às 15:00", "Amanhã às 09:00", "Sexta, 28/11 às 09:00". */
export function textoQuando(inicio: Date, tz: string, agora = new Date()): string {
  const p = partes(inicio, tz)
  const hora = `${pad2(p.hora)}:${pad2(p.min)}`
  const dias = diasEntre(agora, inicio, tz)
  if (dias === 0) return `Hoje às ${hora}`
  if (dias === 1) return `Amanhã às ${hora}`
  if (dias === -1) return `Ontem às ${hora}`
  const semana = p.diaSemana.replace('-feira', '')
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${pad2(p.dia)}/${pad2(p.mes)} às ${hora}`
}
