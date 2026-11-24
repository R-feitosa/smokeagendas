// Passo 1: áudio -> texto (Whisper, na Groq ou na OpenAI — ver provedor.ts).
// Whisper aceita webm (Chrome/Android) e mp4/m4a (Safari/iOS).
// Para trocar de provedor, mantenha a assinatura: (File) => Promise<string>.
import { comFallbackDeModelo, type Provedor } from '../_shared/provedor.ts'

export async function transcrever(audio: File, ia: Provedor): Promise<string> {
  const res = await comFallbackDeModelo(
    ia.modelosTranscricao,
    (modelo) => {
      const form = new FormData()
      form.append('file', audio, audio.name || 'audio.webm')
      form.append('model', modelo)
      form.append('language', 'pt')
      form.append('response_format', 'json')
      return fetch(`${ia.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ia.chave}` },
        body: form,
      })
    },
    `Transcrição (${ia.nome})`,
  )
  const data = await res.json()
  return String(data.text ?? '').trim()
}
