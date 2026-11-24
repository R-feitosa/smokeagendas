// Qual IA usar para transcrever e extrair o compromisso — função pura (testada).
//
// Groq e OpenAI falam o mesmo protocolo (/audio/transcriptions e /chat/completions);
// muda a URL base, a chave e os modelos. A escolha é pelo secret configurado:
//   AGENDA_GROQ_API_KEY   -> Groq   (tem prioridade)
//   AGENDA_OPENAI_API_KEY -> OpenAI
//
// Modelos: listas em ordem de preferência. Se o provedor responder que um modelo não
// existe/foi descontinuado, o próximo é tentado. Dá para fixar outros via secrets:
//   AGENDA_IA_MODELO_TRANSCRICAO, AGENDA_IA_MODELO_EXTRACAO (aceitam lista separada por vírgula)

export type Provedor = {
  nome: 'groq' | 'openai'
  baseUrl: string
  chave: string
  modelosTranscricao: string[]
  modelosExtracao: string[]
  /** json_schema estrito (OpenAI) ou modo JSON simples (Groq: suporte a schema varia por modelo) */
  formato: 'json_schema' | 'json_object'
}

type Env = (nome: string) => string | undefined

const PADROES = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    transcricao: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    // conferido via diagnóstico em 24/11/2026 (GET /models da conta): os Llama saíram do catálogo
    extracao: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
    formato: 'json_object' as const,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    transcricao: ['whisper-1'],
    extracao: ['gpt-4o-mini'],
    formato: 'json_schema' as const,
  },
}

function lista(valor: string | undefined): string[] | null {
  const itens = (valor ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return itens.length ? itens : null
}

export function escolherProvedor(env: Env): Provedor {
  const groq = env('AGENDA_GROQ_API_KEY')?.trim()
  const openai = env('AGENDA_OPENAI_API_KEY')?.trim()
  const nome = groq ? 'groq' : openai ? 'openai' : null
  if (!nome) throw new Error('Nenhuma chave de IA configurada (AGENDA_GROQ_API_KEY ou AGENDA_OPENAI_API_KEY)')

  const p = PADROES[nome]
  return {
    nome,
    baseUrl: p.baseUrl,
    chave: (groq || openai)!,
    // compatibilidade: os nomes antigos AGENDA_OPENAI_*_MODEL continuam valendo para a OpenAI
    modelosTranscricao:
      lista(env('AGENDA_IA_MODELO_TRANSCRICAO')) ??
      (nome === 'openai' ? lista(env('AGENDA_OPENAI_TRANSCRIBE_MODEL')) : null) ??
      p.transcricao,
    modelosExtracao:
      lista(env('AGENDA_IA_MODELO_EXTRACAO')) ??
      (nome === 'openai' ? lista(env('AGENDA_OPENAI_EXTRACT_MODEL')) : null) ??
      p.extracao,
    formato: p.formato,
  }
}

/** O erro indica modelo inexistente/descontinuado? Então vale tentar o próximo da lista. */
export function erroDeModelo(status: number, corpo: string): boolean {
  if (status === 404) return true
  if (status !== 400) return false
  return /model_(not_found|decommissioned)|does not exist|decommissioned|not supported|unknown model/i.test(corpo)
}

/** Chama o provedor tentando cada modelo da lista; devolve a resposta do primeiro que servir. */
export async function comFallbackDeModelo(
  modelos: string[],
  chamar: (modelo: string) => Promise<Response>,
  etapa: string,
): Promise<Response> {
  let ultimo = ''
  for (const modelo of modelos) {
    const res = await chamar(modelo)
    if (res.ok) return res
    const corpo = await res.text()
    if (!erroDeModelo(res.status, corpo)) {
      throw new Error(`${etapa} falhou (${res.status}, modelo ${modelo}): ${corpo.slice(0, 500)}`)
    }
    console.warn(`${etapa}: modelo ${modelo} indisponível (${res.status}); tentando o próximo`)
    ultimo = `${res.status} ${corpo.slice(0, 300)}`
  }
  throw new Error(`${etapa}: nenhum modelo disponível (${modelos.join(', ')}). Último erro: ${ultimo}`)
}

export type Diagnostico = {
  provedor: Provedor['nome']
  chave_valida: boolean
  status_http: number
  transcricao: { modelo: string; disponivel: boolean }[]
  extracao: { modelo: string; disponivel: boolean }[]
  modelos_do_provedor?: string[]
  erro?: string
}

/** Confere a chave e quais modelos configurados existem — GET /models, sem custo, sem expor a chave. */
export async function diagnosticarIA(ia: Provedor, buscar: typeof fetch = fetch): Promise<Diagnostico> {
  const res = await buscar(`${ia.baseUrl}/models`, { headers: { Authorization: `Bearer ${ia.chave}` } })
  if (!res.ok) {
    const corpo = await res.text()
    return {
      provedor: ia.nome, chave_valida: false, status_http: res.status,
      transcricao: [], extracao: [], erro: corpo.slice(0, 300),
    }
  }
  const ids: string[] = ((await res.json())?.data ?? []).map((m: { id: string }) => m.id)
  const marcar = (lista: string[]) => lista.map((modelo) => ({ modelo, disponivel: ids.includes(modelo) }))
  return {
    provedor: ia.nome, chave_valida: true, status_http: res.status,
    transcricao: marcar(ia.modelosTranscricao), extracao: marcar(ia.modelosExtracao),
    modelos_do_provedor: ids.sort(),
  }
}
