/** Escolhe um formato que o aparelho suporta (Chrome: webm/opus, Safari/iOS: mp4). */
function escolherMime(): string | undefined {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidatos.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
}

export type Gravacao = { parar: () => Promise<Blob>; cancelar: () => void }

export async function iniciarGravacao(): Promise<Gravacao> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mime = escolherMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const partes: Blob[] = []

  rec.ondataavailable = (e) => e.data.size > 0 && partes.push(e.data)
  const liberarMic = () => stream.getTracks().forEach((t) => t.stop())
  rec.start()

  return {
    parar: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          liberarMic()
          resolve(new Blob(partes, { type: rec.mimeType || mime || 'audio/webm' }))
        }
        rec.stop()
      }),
    cancelar: () => {
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
      liberarMic()
    },
  }
}
