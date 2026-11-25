/** ISO (UTC) -> valor para <input type="datetime-local"> no fuso do aparelho */
export function paraInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** valor do <input type="datetime-local"> -> ISO (UTC) */
export function deInput(valor: string): string {
  return new Date(valor).toISOString()
}

export function inicioDoDia(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function somarDias(d: Date, dias: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + dias)
  return x
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Só a primeira letra maiúscula: "terça-feira, 24 de novembro" -> "Terça-feira, 24 de novembro" */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)
}

/** Data por extenso no fuso do aparelho, ex.: "Terça-feira, 24 de novembro" */
export function dataPorExtenso(d: Date): string {
  return capitalizar(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))
}

/** Antecedência do aviso em linguagem natural: 0 -> "Na hora", 90 -> "1 h 30 min", 1440 -> "1 dia" */
export function rotuloAntecedencia(min: number): string {
  if (min <= 0) return 'Na hora'
  const dias = Math.floor(min / 1440)
  const horas = Math.floor((min % 1440) / 60)
  const resto = min % 60
  return [dias && `${dias} ${dias === 1 ? 'dia' : 'dias'}`, horas && `${horas} h`, resto && `${resto} min`]
    .filter(Boolean)
    .join(' ')
}

export function rotuloDia(d: Date): string {
  const hoje = inicioDoDia()
  const diff = Math.round((inicioDoDia(d).getTime() - hoje.getTime()) / 86_400_000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return dataPorExtenso(d)
}

// ---- calendário (sempre no fuso do aparelho; semana começa no domingo, como no calendário brasileiro) ----

export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Chave estável do dia local, ex.: "2026-11-25" (para agrupar compromissos por dia) */
export function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function inicioDaSemana(d: Date): Date {
  return somarDias(inicioDoDia(d), -inicioDoDia(d).getDay())
}

export function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** Soma meses mantendo o dia quando possível (31/01 + 1 mês = 28/02 ou 29/02) */
export function somarMeses(d: Date, meses: number): Date {
  const alvo = new Date(d.getFullYear(), d.getMonth() + meses, 1)
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(d.getDate(), ultimoDia))
  return alvo
}

/** Dias exibidos na grade do mês: semanas completas, do domingo antes do dia 1 ao sábado depois do último dia */
export function gradeDoMes(d: Date): Date[] {
  const inicio = inicioDaSemana(inicioDoMes(d))
  const fimDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const total = Math.round((somarDias(inicioDaSemana(fimDoMes), 7).getTime() - inicio.getTime()) / 86_400_000)
  return Array.from({ length: total }, (_, i) => somarDias(inicio, i))
}

/** "Novembro de 2026" */
export function rotuloMes(d: Date): string {
  return capitalizar(d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
}

/** "22 a 28 de novembro" ou, cruzando o mês, "29 de dezembro a 4 de janeiro" */
export function rotuloSemana(d: Date): string {
  const ini = inicioDaSemana(d)
  const fim = somarDias(ini, 6)
  const mes = (x: Date) => x.toLocaleDateString('pt-BR', { month: 'long' })
  return ini.getMonth() === fim.getMonth()
    ? `${ini.getDate()} a ${fim.getDate()} de ${mes(fim)}`
    : `${ini.getDate()} de ${mes(ini)} a ${fim.getDate()} de ${mes(fim)}`
}
