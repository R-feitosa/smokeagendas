/** Limites da gravação. O servidor aceita de 1 KB a 10 MB; 2 min de voz ficam bem abaixo disso. */
export const DURACAO_MIN_MS = 1_000
export const DURACAO_MAX_MS = 120_000

export type CodigoErroGravacao = 'sem-suporte' | 'permissao' | 'sem-microfone' | 'ocupado' | 'desconhecido'

export class ErroGravacao extends Error {
  constructor(
    public codigo: CodigoErroGravacao,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

/** Escolhe um formato que o aparelho suporta (Chrome: webm/opus, Safari/iOS: mp4). */
function escolherMime(): string | undefined {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidatos.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
}

function traduzirErro(e: unknown): ErroGravacao {
  const nome = e instanceof DOMException ? e.name : ''
  if (nome === 'NotAllowedError' || nome === 'SecurityError')
    return new ErroGravacao('permissao', 'O microfone está bloqueado. Libere a permissão nas configurações do navegador e tente de novo.')
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError')
    return new ErroGravacao('sem-microfone', 'Não encontrei nenhum microfone neste aparelho.')
  if (nome === 'NotReadableError' || nome === 'AbortError')
    return new ErroGravacao('ocupado', 'O microfone está em uso por outro aplicativo. Feche-o e tente de novo.')
  return new ErroGravacao('desconhecido', 'Não consegui iniciar a gravação. Tente de novo.')
}

export type Gravacao = {
  parar: () => Promise<Blob>
  /** descarta tudo e solta o microfone */
  cancelar: () => void
  /** volume instantâneo, de 0 a 1 (já suavizado), para o medidor da tela */
  nivel: () => number
}

/** Medidor de volume. Se o aparelho não suportar, a gravação segue sem ele. */
function criarMedidor(stream: MediaStream) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) throw new Error('sem AudioContext')
    const ctx = new Ctx()
    void ctx.resume()
    const analisador = ctx.createAnalyser()
    analisador.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analisador)
    const amostra = new Uint8Array(analisador.fftSize)
    let suave = 0
    return {
      nivel: () => {
        analisador.getByteTimeDomainData(amostra)
        let soma = 0
        for (const v of amostra) soma += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(soma / amostra.length) // voz normal fica entre 0,05 e 0,3
        suave = Math.max(Math.min(1, rms * 4), suave * 0.85) // sobe rápido, desce devagar
        return suave
      },
      fechar: () => void ctx.close().catch(() => {}),
    }
  } catch {
    return { nivel: () => 0, fechar: () => {} }
  }
}

export async function iniciarGravacao(): Promise<Gravacao> {
  // sem HTTPS o navegador nem expõe mediaDevices
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new ErroGravacao('sem-suporte', 'Este navegador não permite gravar áudio (é preciso HTTPS e um navegador atual).')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (e) {
    throw traduzirErro(e)
  }

  const mime = escolherMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const partes: Blob[] = []
  const medidor = criarMedidor(stream)

  rec.ondataavailable = (e) => e.data.size > 0 && partes.push(e.data)
  const liberar = () => {
    stream.getTracks().forEach((t) => t.stop())
    medidor.fechar()
  }
  rec.start()

  return {
    nivel: medidor.nivel,
    parar: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          liberar()
          resolve(new Blob(partes, { type: rec.mimeType || mime || 'audio/webm' }))
        }
        rec.stop()
      }),
    cancelar: () => {
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
      liberar()
    },
  }
}
