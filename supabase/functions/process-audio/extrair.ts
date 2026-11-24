// Passo 2: texto -> compromisso estruturado (JSON).
// Troque por Claude/Gemini se preferir: só precisa devolver o tipo Rascunho.

export type Rascunho = {
  titulo: string
  descricao: string | null
  inicio: string            // ISO 8601 com offset, ex.: 2026-11-27T15:00:00-03:00
  fim: string | null
  lembrar_min_antes: number
  recorrencia: 'diaria' | 'semanal' | 'mensal' | null
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'descricao', 'inicio', 'fim', 'lembrar_min_antes', 'recorrencia'],
  properties: {
    titulo: { type: 'string', description: 'Título curto do compromisso' },
    descricao: { type: ['string', 'null'] },
    inicio: { type: 'string', description: 'ISO 8601 com offset do fuso informado' },
    fim: { type: ['string', 'null'] },
    lembrar_min_antes: { type: 'integer', description: 'Minutos de antecedência do aviso. Padrão 30.' },
    recorrencia: { type: ['string', 'null'], enum: ['diaria', 'semanal', 'mensal', null] },
  },
}

/** Devolve o JSON do modelo SEM validar — quem chama passa por validarRascunho(). */
export async function extrair(texto: string, agora: string, tz: string): Promise<unknown> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY não configurada')

  const sistema = [
    'Você transforma a fala de uma pessoa em UM compromisso de agenda, em português do Brasil.',
    `Agora é ${agora}, no fuso ${tz}. Resolva "hoje", "amanhã", "sexta que vem", "daqui a 2 horas" a partir disso.`,
    'Responda "inicio" (e "fim", se houver) sempre em ISO 8601 com o offset do fuso informado, ex.: 2026-11-27T15:00:00-03:00.',
    'Se a pessoa não disser hora, use 09:00. Se não disser antecedência do aviso, use 30 minutos.',
    'Não invente informações que não foram ditas; deixe descricao null se não houver detalhe.',
  ].join('\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_EXTRACT_MODEL') ?? 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: texto },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'compromisso', strict: true, schema },
      },
    }),
  })
  if (!res.ok) throw new Error(`Extração falhou (${res.status}): ${await res.text()}`)

  const data = await res.json()
  const conteudo = data?.choices?.[0]?.message?.content
  if (typeof conteudo !== 'string') return null // recusa/resposta vazia -> validarRascunho trata
  try {
    return JSON.parse(conteudo)
  } catch {
    return null
  }
}
