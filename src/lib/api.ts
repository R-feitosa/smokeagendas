import { supabase } from './supabase'
import type { Evento, Rascunho } from './types'

/** Envia o áudio para a Edge Function e recebe o rascunho (nada é salvo ainda). */
export async function processarAudio(blob: Blob): Promise<Rascunho> {
  const form = new FormData()
  form.append('audio', blob, blob.type.includes('mp4') ? 'audio.m4a' : 'audio.webm')
  // o servidor usa o próprio relógio; só o fuso vem do aparelho
  form.append('tz', Intl.DateTimeFormat().resolvedOptions().timeZone)

  const { data, error } = await supabase.functions.invoke('agenda-process-audio', { body: form })
  if (error) throw new Error('Não foi possível processar o áudio')
  if (data?.erro) throw new Error(data.erro)
  return data as Rascunho
}

export async function listarEventos(de: Date, ate: Date): Promise<Evento[]> {
  const { data, error } = await supabase
    .from('eventos')
    .select('*')
    .gte('inicio', de.toISOString())
    .lt('inicio', ate.toISOString())
    .neq('status', 'cancelado')
    .order('inicio')
  if (error) throw error
  return data as Evento[]
}

export async function criarEvento(r: Rascunho): Promise<void> {
  const { error } = await supabase.from('eventos').insert({
    titulo: r.titulo,
    descricao: r.descricao,
    inicio: r.inicio,
    fim: r.fim,
    lembrar_min_antes: r.lembrar_min_antes,
    recorrencia: r.recorrencia,
    transcricao: r.transcricao,
  })
  if (error) throw error
}

export async function concluirEvento(id: string): Promise<void> {
  const { error } = await supabase.from('eventos').update({ status: 'concluido' }).eq('id', id)
  if (error) throw error
}

export async function excluirEvento(id: string): Promise<void> {
  const { error } = await supabase.from('eventos').update({ status: 'cancelado' }).eq('id', id)
  if (error) throw error
}

/** Adiar: o lembrete volta a disparar daqui a `min` minutos */
export async function adiarLembrete(id: string, min = 10): Promise<void> {
  const { error } = await supabase
    .from('eventos')
    .update({
      adiar_ate: new Date(Date.now() + min * 60_000).toISOString(),
      lembrete_enviado_em: null,
    })
    .eq('id', id)
  if (error) throw error
}

/**
 * Encerra a série recorrente DEPOIS desta ocorrência: cancela as futuras
 * pendentes e para de gerar novas. Devolve quantas foram canceladas.
 * (Excluir uma ocorrência isolada não encerra a série — use excluirEvento.)
 */
export async function encerrarSerie(eventoId: string): Promise<number> {
  const { data, error } = await supabase.rpc('encerrar_serie', { p_evento_id: eventoId })
  if (error) throw error
  return data as number
}
