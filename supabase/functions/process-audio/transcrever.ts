// Passo 1: áudio -> texto.
// Whisper aceita webm (Chrome/Android) e mp4/m4a (Safari/iOS), por isso foi escolhido.
// Para trocar de provedor, mantenha a assinatura: (File) => Promise<string>.

export async function transcrever(audio: File): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY não configurada')

  const form = new FormData()
  form.append('file', audio, audio.name || 'audio.webm')
  form.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'whisper-1')
  form.append('language', 'pt')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Transcrição falhou (${res.status}): ${await res.text()}`)

  const data = await res.json()
  return String(data.text ?? '').trim()
}
