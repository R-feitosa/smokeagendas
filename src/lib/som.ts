/**
 * Alarme sonoro dentro do app (quando ele está aberto). O som da notificação do
 * sistema não é controlável pelo site: depende dos ajustes de notificação do aparelho.
 */
let ctx: AudioContext | null = null

function contexto(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    ctx ??= new Ctx()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Navegadores só liberam áudio depois de um toque: chamar num toque qualquer do usuário. */
export function liberarSom(): void {
  contexto()
}

/** "Dlim-dlom-dlim" + vibração. Silencioso se o navegador ainda não liberou o áudio. */
export function tocarAlerta(): void {
  navigator.vibrate?.([400, 150, 400, 150, 700])
  const c = contexto()
  if (!c) return
  const notas: [number, number][] = [
    [880, 0],
    [660, 0.22],
    [990, 0.44],
    [880, 0.9],
    [660, 1.12],
    [990, 1.34],
  ]
  for (const [freq, quando] of notas) {
    const osc = c.createOscillator()
    const vol = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = c.currentTime + quando
    vol.gain.setValueAtTime(0.0001, t)
    vol.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(vol).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.22)
  }
}
