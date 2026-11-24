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

export function rotuloDia(d: Date): string {
  const hoje = inicioDoDia()
  const diff = Math.round((inicioDoDia(d).getTime() - hoje.getTime()) / 86_400_000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
