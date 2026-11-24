// POST multipart/form-data: audio (arquivo), tz (IANA, opcional)
// Exige usuário logado E habilitado em agenda.perfis (ver _shared/auth.ts).
// Devolve o rascunho do compromisso + a transcrição. NÃO grava nada: o app mostra
// o rascunho, a pessoa confere e só então salva.
//
// O "agora" é o relógio do servidor (não o do aparelho, que pode estar errado);
// o fuso vem do aparelho porque é ele que define o que "amanhã às 9" significa.
import { exigirUsuarioDaAgenda } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { descreverAgora, fusoOuPadrao } from '../_shared/datas.ts'
import { transcrever } from './transcrever.ts'
import { extrair } from './extrair.ts'
import { RascunhoInvalido, validarRascunho } from './validar.ts'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB (~ vários minutos de áudio)
const MIN_BYTES = 1024 // menos que isso é toque acidental no botão

// Chrome/Android: audio/webm; Safari/iOS: audio/mp4 (às vezes rotulado video/mp4)
function tipoAceito(tipo: string): boolean {
  const base = tipo.split(';')[0].trim().toLowerCase()
  return base.startsWith('audio/') || base === 'video/mp4' || base === 'video/webm'
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405, cors)

  // antes de ler o áudio ou gastar OpenAI: só usuário logado e habilitado na agenda
  const acesso = await exigirUsuarioDaAgenda(req)
  if (!acesso.ok) return json({ erro: acesso.erro }, acesso.status, cors)

  try {
    const form = await req.formData()
    const audio = form.get('audio')
    if (!(audio instanceof File)) return json({ erro: 'Envie o campo "audio"' }, 400, cors)
    if (audio.size > MAX_BYTES) return json({ erro: 'Áudio muito grande' }, 413, cors)
    if (audio.size < MIN_BYTES) return json({ erro: 'Áudio muito curto. Segure e fale de novo.' }, 422, cors)
    if (audio.type && !tipoAceito(audio.type)) return json({ erro: 'Formato de áudio não suportado' }, 415, cors)

    const tz = fusoOuPadrao(form.get('tz'))
    const agora = descreverAgora(new Date(), tz)

    const transcricao = await transcrever(audio)
    if (!transcricao) return json({ erro: 'Não consegui entender o áudio. Tente de novo.' }, 422, cors)

    const rascunho = validarRascunho(await extrair(transcricao, agora, tz))
    return json({ ...rascunho, transcricao }, 200, cors)
  } catch (e) {
    if (e instanceof RascunhoInvalido) {
      console.warn('rascunho inválido:', e.message)
      return json({ erro: 'Não entendi a data ou o assunto. Tente falar de novo.' }, 422, cors)
    }
    console.error(e)
    return json({ erro: 'Falha ao processar o áudio' }, 500, cors)
  }
})
