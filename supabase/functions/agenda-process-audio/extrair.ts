// Passo 2: texto -> compromisso estruturado (JSON), na Groq ou na OpenAI (ver provedor.ts).
// O resultado SEMPRE passa por validarRascunho() — nenhum modelo é confiável sozinho.
import { comFallbackDeModelo, type Provedor } from './provedor.ts'

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

// No modo JSON simples (Groq) o formato vai descrito no próprio prompt
const FORMATO_EM_TEXTO = [
  'Responda SOMENTE com um objeto JSON, sem texto antes ou depois, exatamente com estas chaves:',
  '{"titulo": string curto, "descricao": string ou null, "inicio": string ISO 8601 com offset,',
  ' "fim": string ISO 8601 com offset ou null, "lembrar_min_antes": inteiro,',
  ' "recorrencia": "diaria" | "semanal" | "mensal" | null}',
].join('\n')

export function montarSistema(agora: string, tz: string, formato: Provedor['formato']): string {
  return [
    'Você transforma a fala de uma pessoa em UM compromisso de agenda, em português do Brasil.',
    `Agora é ${agora}, no fuso ${tz}. Resolva "hoje", "amanhã", "sexta que vem", "daqui a 2 horas" a partir disso.`,
    'Responda "inicio" (e "fim", se houver) sempre em ISO 8601 com o offset do fuso informado, ex.: 2026-11-27T15:00:00-03:00.',
    'Se a pessoa não disser hora, use 09:00. Se não disser antecedência do aviso, use 30 minutos.',
    'Use "recorrencia" só se a pessoa disser que repete (todo dia, toda semana, todo mês).',
    'Não invente informações que não foram ditas; deixe descricao null se não houver detalhe.',
    ...(formato === 'json_object' ? [FORMATO_EM_TEXTO] : []),
  ].join('\n')
}

/** Devolve o JSON do modelo SEM validar — quem chama passa por validarRascunho(). */
export async function extrair(texto: string, agora: string, tz: string, ia: Provedor): Promise<unknown> {
  const sistema = montarSistema(agora, tz, ia.formato)
  const response_format =
    ia.formato === 'json_schema'
      ? { type: 'json_schema', json_schema: { name: 'compromisso', strict: true, schema } }
      : { type: 'json_object' }

  const res = await comFallbackDeModelo(
    ia.modelosExtracao,
    (modelo) =>
      fetch(`${ia.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ia.chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          temperature: 0,
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: texto },
          ],
          response_format,
        }),
      }),
    `Extração (${ia.nome})`,
  )

  const data = await res.json()
  const conteudo = data?.choices?.[0]?.message?.content
  if (typeof conteudo !== 'string') return null // recusa/resposta vazia -> validarRascunho trata
  try {
    return JSON.parse(conteudo)
  } catch {
    return null
  }
}
