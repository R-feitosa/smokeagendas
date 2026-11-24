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
