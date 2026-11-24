// POST multipart/form-data: audio (arquivo), agora (ISO), tz (IANA)
// Devolve o rascunho do compromisso + a transcrição. NÃO grava nada: o app mostra
// o rascunho, a pessoa confere e só então salva.
import { corsHeaders, json } from '../_shared/cors.ts'
import { transcrever } from './transcrever.ts'
import { extrair } from './extrair.ts'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB (~ vários minutos de áudio)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  try {
    const form = await req.formData()
    const audio = form.get('audio')
    if (!(audio instanceof File)) return json({ erro: 'Envie o campo "audio"' }, 400)
    if (audio.size > MAX_BYTES) return json({ erro: 'Áudio muito grande' }, 413)

    const agora = String(form.get('agora') ?? new Date().toISOString())
    const tz = String(form.get('tz') ?? 'America/Fortaleza')

    const transcricao = await transcrever(audio)
    if (!transcricao) return json({ erro: 'Não consegui entender o áudio. Tente de novo.' }, 422)

    const rascunho = await extrair(transcricao, agora, tz)
    return json({ ...rascunho, transcricao })
  } catch (e) {
    console.error(e)
    return json({ erro: 'Falha ao processar o áudio' }, 500)
  }
})
