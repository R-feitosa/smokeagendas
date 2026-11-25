import { ordenarUnidades } from './apartamentos'
import { supabase } from './supabase'
import type { Evento, Predio, Rascunho, StatusUnidade, Unidade } from './types'

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

type Projecao = Pick<Evento, 'serie_id' | 'ocorrencia_n' | 'inicio' | 'fim' | 'titulo' | 'descricao' | 'lembrar_min_antes' | 'recorrencia' | 'responsavel'>

/**
 * Repetições futuras ainda não gravadas (o servidor grava só 7 dias à frente).
 * Calculadas no banco com a mesma regra do gerador (agenda.projetar_ocorrencias).
 * Se falhar, o calendário segue só com o que está gravado.
 */
export async function listarPrevistas(de: Date, ate: Date): Promise<Evento[]> {
  const { data, error } = await supabase.rpc('projetar_ocorrencias', { p_de: de.toISOString(), p_ate: ate.toISOString() })
  if (error) {
    console.warn('projeção de repetições indisponível:', error.message)
    return []
  }
  return (data as Projecao[]).map((p) => ({
    ...p,
    responsavel: p.responsavel ?? null,
    id: `prevista-${p.serie_id}-${p.ocorrencia_n}`,
    user_id: '',
    adiar_ate: null,
    lembrete_enviado_em: null,
    status: 'pendente',
    transcricao: null,
    lembretes_enviados: 0,
    prevista: true,
  }))
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
    responsavel: r.responsavel ?? null,
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

// ---- aba Apartamentos ----

const COLUNAS_UNIDADE = 'id, predio_id, numero, status, status_desde, atualizado_em, atualizado_por_nome'

/** Prédios (na ordem cadastrada) com as unidades em ordem de porta. Dados do escritório: todos os habilitados veem o mesmo. */
export async function listarPredios(): Promise<Predio[]> {
  const [predios, unidades] = await Promise.all([
    supabase.from('predios').select('id, nome, tipo_unidade, ordem').order('ordem').order('nome'),
    supabase.from('unidades').select(COLUNAS_UNIDADE),
  ])
  if (predios.error) throw predios.error
  if (unidades.error) throw unidades.error

  const porPredio = new Map<string, Unidade[]>()
  for (const u of unidades.data as Unidade[]) porPredio.set(u.predio_id, [...(porPredio.get(u.predio_id) ?? []), u])
  return (predios.data as Omit<Predio, 'unidades'>[]).map((p) => ({ ...p, unidades: ordenarUnidades(porPredio.get(p.id) ?? []) }))
}

/**
 * Marca a unidade como vaga ou ocupada e devolve a linha já carimbada pelo banco
 * (desde quando / por quem). Falha se a unidade não existir ou o usuário não for habilitado.
 */
export async function mudarStatusUnidade(id: string, status: StatusUnidade): Promise<Unidade> {
  const { data, error } = await supabase.from('unidades').update({ status }).eq('id', id).select(COLUNAS_UNIDADE).single()
  if (error) throw error
  return data as Unidade
}

/** true quando o servidor ainda não tem as tabelas da aba (migration 0007 não aplicada) */
export function semTabelasDeApartamentos(erro: unknown): boolean {
  const codigo = (erro as { code?: string } | null)?.code
  return codigo === 'PGRST205' || codigo === '42P01'
}
