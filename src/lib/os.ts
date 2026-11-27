import { supabase } from './supabase'
import { prepararImagem } from './imagem'
import type {
  DadosOS, Equipe, FotoOS, HistoricoOS, ItemChecklist, ModeloChecklist, MomentoFoto, OrdemServico, PapelEquipe, StatusOS,
} from './types'

export const BUCKET_FOTOS = 'agenda-os-fotos'

export const ROTULO_STATUS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

export const ROTULO_TIPO = {
  corretiva: 'Corretiva',
  preventiva: 'Preventiva',
  instalacao: 'Instalação',
  garantia: 'Garantia',
  vistoria: 'Vistoria',
  outro: 'Outro',
} as const

export const ROTULO_PRIORIDADE = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' } as const

export const ROTULO_MOMENTO: Record<MomentoFoto, string> = { antes: 'Antes', durante: 'Durante', depois: 'Depois' }

/** O banco devolve a mensagem da regra (ex.: falta foto de DEPOIS); mostramos ela à pessoa. */
function erroLegivel(e: { message?: string } | null, padrao: string): Error {
  const msg = e?.message ?? ''
  if (/os_concluida_tem_servico/.test(msg)) return new Error('Descreva o serviço executado antes de concluir')
  if (/os_cancelada_tem_motivo/.test(msg)) return new Error('Informe o motivo do cancelamento')
  if (/os_checklist_valido/.test(msg)) return new Error('Checklist inválido')
  if (/os_assinatura_coerente/.test(msg)) return new Error('Informe o nome de quem assinou')
  if (/^(Para concluir|OS |Uma OS|Número|Só |A foto|A equipe|Você não|Sem equipe|O técnico|Pessoa não|Checklist)/.test(msg))
    return new Error(msg)
  return new Error(padrao)
}

export async function listarOS(): Promise<OrdemServico[]> {
  const { data, error } = await supabase
    .from('os_ordens')
    .select('*')
    .order('aberta_em', { ascending: false })
    .limit(500)
  if (error) throw erroLegivel(error, 'Não foi possível carregar as OS')
  return data as OrdemServico[]
}

export async function obterOS(id: string): Promise<OrdemServico> {
  const { data, error } = await supabase.from('os_ordens').select('*').eq('id', id).single()
  if (error) throw erroLegivel(error, 'OS não encontrada')
  return data as OrdemServico
}

export async function criarOS(dados: DadosOS & { checklist?: ItemChecklist[] }): Promise<OrdemServico> {
  const { data, error } = await supabase.from('os_ordens').insert(dados).select('*').single()
  if (error) throw erroLegivel(error, 'Não foi possível abrir a OS')
  return data as OrdemServico
}

export async function atualizarOS(id: string, dados: Partial<DadosOS>): Promise<OrdemServico> {
  const { data, error } = await supabase.from('os_ordens').update(dados).eq('id', id).select('*').single()
  if (error) throw erroLegivel(error, 'Não foi possível salvar a OS')
  return data as OrdemServico
}

export async function mudarStatus(
  id: string,
  status: StatusOS,
  extra: Partial<Pick<OrdemServico, 'servico_executado' | 'motivo_cancelamento'>> = {},
): Promise<OrdemServico> {
  const { data, error } = await supabase
    .from('os_ordens')
    .update({ status, ...extra })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw erroLegivel(error, 'Não foi possível mudar o status')
  return data as OrdemServico
}

// ---------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------

export async function listarFotos(osId: string): Promise<FotoOS[]> {
  const { data, error } = await supabase
    .from('os_fotos')
    .select('*')
    .eq('os_id', osId)
    .order('criado_em')
  if (error) throw erroLegivel(error, 'Não foi possível carregar as fotos')
  const fotos = data as FotoOS[]
  if (fotos.length === 0) return fotos

  // bucket privado: URL assinada válida por 1 hora
  const { data: urls } = await supabase.storage
    .from(BUCKET_FOTOS)
    .createSignedUrls(fotos.map((f) => f.caminho), 3600)
  const porCaminho = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  return fotos.map((f) => ({ ...f, url: porCaminho.get(f.caminho) ?? undefined }))
}

/**
 * Envia a foto: reduz → sobe para o Storage → grava o registro.
 * Se o registro falhar, apaga o arquivo para não deixar órfão.
 */
export async function enviarFoto(
  os: Pick<OrdemServico, 'id' | 'user_id'>,
  momento: MomentoFoto,
  arquivo: File,
  legenda?: string,
): Promise<void> {
  const img = await prepararImagem(arquivo)
  const caminho = `${os.user_id}/${os.id}/${momento}/${crypto.randomUUID()}.${img.ext}`

  const { error: errUp } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, img.blob, {
    contentType: img.blob.type || 'image/jpeg',
    upsert: false,
  })
  if (errUp) throw new Error('Falha ao enviar a foto. Verifique a conexão e tente de novo.')

  const { error } = await supabase.from('os_fotos').insert({
    os_id: os.id,
    momento,
    caminho,
    legenda: legenda?.trim() || null,
    tamanho_bytes: img.blob.size,
    largura: img.largura,
    altura: img.altura,
  })
  if (error) {
    await supabase.storage.from(BUCKET_FOTOS).remove([caminho])
    throw erroLegivel(error, 'Não foi possível registrar a foto')
  }
}

export async function legendarFoto(id: string, legenda: string): Promise<void> {
  const { error } = await supabase.from('os_fotos').update({ legenda: legenda.trim() || null }).eq('id', id)
  if (error) throw erroLegivel(error, 'Não foi possível salvar a legenda')
}

/** Apaga o registro primeiro (o banco recusa se a OS estiver concluída); depois o arquivo. */
export async function excluirFoto(foto: FotoOS): Promise<void> {
  const { error } = await supabase.from('os_fotos').delete().eq('id', foto.id)
  if (error) throw erroLegivel(error, 'Não foi possível remover a foto')
  await supabase.storage.from(BUCKET_FOTOS).remove([foto.caminho])
}

export async function listarHistorico(osId: string): Promise<HistoricoOS[]> {
  const { data, error } = await supabase
    .from('os_historico')
    .select('id, quando, acao, de, para, detalhe, autor_nome')
    .eq('os_id', osId)
    .order('quando')
  if (error) throw erroLegivel(error, 'Não foi possível carregar o histórico')
  return data as HistoricoOS[]
}

// ---------------------------------------------------------------
// Equipes
// ---------------------------------------------------------------

/** Equipes de quem está logado, com membros e nomes (vazio = uso individual). */
export async function minhasEquipes(): Promise<Equipe[]> {
  const { data, error } = await supabase.rpc('os_minhas_equipes')
  if (error) throw erroLegivel(error, 'Não foi possível carregar as equipes')
  const porId = new Map<string, Equipe>()
  for (const l of (data ?? []) as {
    equipe_id: string; equipe_nome: string; meu_papel: PapelEquipe; user_id: string; nome: string | null; papel: PapelEquipe
  }[]) {
    const e = porId.get(l.equipe_id) ?? { id: l.equipe_id, nome: l.equipe_nome, meu_papel: l.meu_papel, membros: [] }
    e.membros.push({ user_id: l.user_id, nome: l.nome, papel: l.papel })
    porId.set(l.equipe_id, e)
  }
  return [...porId.values()]
}

export async function definirMembro(equipeId: string, email: string, papel: PapelEquipe): Promise<void> {
  const { error } = await supabase.rpc('os_definir_membro', { p_equipe: equipeId, p_email: email.trim(), p_papel: papel })
  if (error) throw erroLegivel(error, 'Não foi possível incluir na equipe')
}

export async function removerMembro(equipeId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('os_remover_membro', { p_equipe: equipeId, p_user: userId })
  if (error) throw erroLegivel(error, 'Não foi possível remover da equipe')
}

/** Nome de qualquer pessoa das minhas equipes (para mostrar o técnico). */
export function nomeMembro(equipes: Equipe[], userId: string | null): string | null {
  if (!userId) return null
  for (const e of equipes) for (const m of e.membros) if (m.user_id === userId) return m.nome
  return null
}

// ---------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------

export async function modelosChecklist(): Promise<ModeloChecklist[]> {
  const { data, error } = await supabase.from('os_checklist_modelos').select('*').order('ordem')
  if (error) throw erroLegivel(error, 'Não foi possível carregar os checklists')
  return data as ModeloChecklist[]
}

export function checklistDoModelo(m: ModeloChecklist | undefined): ItemChecklist[] {
  return (m?.itens ?? []).map((item) => ({ item, resposta: null }))
}

export async function salvarChecklist(osId: string, checklist: ItemChecklist[]): Promise<OrdemServico> {
  const { data, error } = await supabase.from('os_ordens').update({ checklist }).eq('id', osId).select('*').single()
  if (error) throw erroLegivel(error, 'Não foi possível salvar o checklist')
  return data as OrdemServico
}

export const checklistPendentes = (c: ItemChecklist[]) => c.filter((i) => !i.resposta).length

// ---------------------------------------------------------------
// Assinatura do cliente (PNG no mesmo bucket, pasta "assinatura")
// ---------------------------------------------------------------

export async function salvarAssinatura(os: OrdemServico, png: Blob, nome: string): Promise<OrdemServico> {
  const caminho = `${os.user_id}/${os.id}/assinatura/${crypto.randomUUID()}.png`
  const { error: errUp } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, png, { contentType: 'image/png' })
  if (errUp) throw new Error('Falha ao enviar a assinatura. Verifique a conexão.')
  const { data, error } = await supabase
    .from('os_ordens')
    .update({ assinatura_caminho: caminho, assinatura_nome: nome.trim() })
    .eq('id', os.id)
    .select('*')
    .single()
  if (error) {
    await supabase.storage.from(BUCKET_FOTOS).remove([caminho])
    throw erroLegivel(error, 'Não foi possível registrar a assinatura')
  }
  if (os.assinatura_caminho) await supabase.storage.from(BUCKET_FOTOS).remove([os.assinatura_caminho])
  return data as OrdemServico
}

export async function urlAssinada(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

// ---------------------------------------------------------------
// Indicadores e exportação
// ---------------------------------------------------------------

export function estaAtrasada(os: OrdemServico, agora = Date.now()): boolean {
  if (!os.prazo || os.status === 'concluida' || os.status === 'cancelada') return false
  return new Date(os.prazo).getTime() < agora
}

export type IndicadoresOS = {
  abertas: number           // aberta + em andamento + aguardando peça
  atrasadas: number
  concluidasMes: number
  noPrazoPct: number | null // % concluídas (no mês) dentro do prazo, entre as que tinham prazo
  tempoMedioH: number | null // abertura → conclusão (mês), em horas
}

export function calcularIndicadores(lista: OrdemServico[], agora = new Date()): IndicadoresOS {
  const iniMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime()
  const ativas = lista.filter((o) => ['aberta', 'em_andamento', 'aguardando_peca'].includes(o.status))
  const concl = lista.filter((o) => o.status === 'concluida' && o.concluida_em && new Date(o.concluida_em).getTime() >= iniMes)
  const comPrazo = concl.filter((o) => o.prazo)
  const noPrazo = comPrazo.filter((o) => new Date(o.concluida_em!).getTime() <= new Date(o.prazo!).getTime())
  const horas = concl.map((o) => (new Date(o.concluida_em!).getTime() - new Date(o.aberta_em).getTime()) / 3_600_000)
  return {
    abertas: ativas.length,
    atrasadas: ativas.filter((o) => estaAtrasada(o, agora.getTime())).length,
    concluidasMes: concl.length,
    noPrazoPct: comPrazo.length ? Math.round((noPrazo.length / comPrazo.length) * 100) : null,
    tempoMedioH: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : null,
  }
}

/** CSV com ";" e BOM (abre certo no Excel em PT-BR). */
export function exportarCsv(lista: OrdemServico[], equipes: Equipe[] = []): void {
  const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '')
  const cab = [
    'Número', 'Status', 'Cliente', 'Unidade', 'Tipo', 'Prioridade', 'Equipamento', 'Marca', 'Modelo',
    'Nº série', 'Patrimônio', 'Solicitante', 'Técnico', 'Problema', 'Serviço executado', 'Peças',
    'Valor', 'Aberta em', 'Prazo', 'Iniciada em', 'Concluída em', 'Atrasada',
    'Equipe', 'Categoria', 'Checklist (itens não OK)', 'Assinado por', 'Assinado em',
  ]
  const linhas = lista.map((o) => [
    o.numero, ROTULO_STATUS[o.status], o.cliente, o.unidade, ROTULO_TIPO[o.tipo], ROTULO_PRIORIDADE[o.prioridade],
    o.equipamento, o.marca, o.modelo, o.numero_serie, o.patrimonio, o.solicitante,
    (o.equipe_id ? nomeMembro(equipes, o.tecnico_id) ?? (o.tecnico_id ? o.tecnico : null) : o.tecnico), o.problema,
    o.servico_executado, o.pecas, o.valor != null ? String(o.valor).replace('.', ',') : '',
    dt(o.aberta_em), dt(o.prazo), dt(o.iniciada_em), dt(o.concluida_em), estaAtrasada(o) ? 'Sim' : 'Não',
    equipes.find((e) => e.id === o.equipe_id)?.nome ?? '', o.categoria,
    (o.checklist ?? []).filter((i) => i.resposta === 'nao_ok').map((i) => i.item).join(' | '),
    o.assinatura_nome, dt(o.assinado_em),
  ])
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
  const csv = '﻿' + [cab, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `ordens-de-servico-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function descreverHistorico(h: HistoricoOS): string {
  const st = (s: string | null) => (s && s in ROTULO_STATUS ? ROTULO_STATUS[s as keyof typeof ROTULO_STATUS] : s ?? '')
  const mo = (s: string | null) => ({ antes: 'antes', durante: 'durante', depois: 'depois' } as Record<string, string>)[s ?? ''] ?? s ?? ''
  switch (h.acao) {
    case 'abertura': return `OS aberta (${h.detalhe})`
    case 'status': return `Status: ${st(h.de)} → ${st(h.para)}${h.detalhe ? ` — ${h.detalhe}` : ''}`
    case 'foto_incluida': return `Foto de ${mo(h.para)} incluída${h.detalhe ? ` — ${h.detalhe}` : ''}`
    case 'foto_removida': return `Foto de ${mo(h.de)} removida${h.detalhe ? ` — ${h.detalhe}` : ''}`
    case 'atribuicao': return h.para ? `Atribuída a ${h.para}${h.de ? ` (antes: ${h.de})` : ''}` : 'Técnico removido'
    case 'assinatura': return `Assinatura do cliente colhida — ${h.detalhe ?? ''}`
    case 'assinatura_removida': return 'Assinatura do cliente removida'
    case 'edicao': return 'Dados editados'
  }
}
