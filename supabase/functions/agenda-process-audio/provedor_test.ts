import assert from 'node:assert/strict'
import { comFallbackDeModelo, erroDeModelo, escolherProvedor } from './provedor.ts'
import { montarSistema } from './extrair.ts'

const env = (vars: Record<string, string>) => (n: string) => vars[n]

Deno.test('Groq tem prioridade e usa modo JSON simples', () => {
  const p = escolherProvedor(env({ AGENDA_GROQ_API_KEY: 'gsk_x', AGENDA_OPENAI_API_KEY: 'sk_y' }))
  assert.equal(p.nome, 'groq')
  assert.equal(p.baseUrl, 'https://api.groq.com/openai/v1')
  assert.equal(p.chave, 'gsk_x')
  assert.equal(p.formato, 'json_object')
  assert.equal(p.modelosTranscricao[0], 'whisper-large-v3-turbo')
})

Deno.test('só OpenAI: mantém json_schema e os nomes antigos de modelo', () => {
  const p = escolherProvedor(env({ AGENDA_OPENAI_API_KEY: 'sk_y', AGENDA_OPENAI_EXTRACT_MODEL: 'gpt-x' }))
  assert.equal(p.nome, 'openai')
  assert.equal(p.formato, 'json_schema')
  assert.deepEqual(p.modelosExtracao, ['gpt-x'])
})

Deno.test('modelos podem ser fixados por secret (lista)', () => {
  const p = escolherProvedor(env({ AGENDA_GROQ_API_KEY: 'g', AGENDA_IA_MODELO_EXTRACAO: 'a, b' }))
  assert.deepEqual(p.modelosExtracao, ['a', 'b'])
})

Deno.test('sem chave: erro claro', () => {
  assert.throws(() => escolherProvedor(env({})), /Nenhuma chave de IA/)
  assert.throws(() => escolherProvedor(env({ AGENDA_GROQ_API_KEY: '  ' })), /Nenhuma chave de IA/)
})

Deno.test('erroDeModelo reconhece modelo inexistente/descontinuado, não outros erros', () => {
  assert.equal(erroDeModelo(404, ''), true)
  assert.equal(erroDeModelo(400, '{"error":{"code":"model_decommissioned"}}'), true)
  assert.equal(erroDeModelo(400, 'The model `x` does not exist'), true)
  assert.equal(erroDeModelo(400, 'invalid file format'), false)
  assert.equal(erroDeModelo(401, 'invalid api key'), false)
  assert.equal(erroDeModelo(429, 'rate limit'), false)
})

Deno.test('fallback: pula modelo descontinuado e usa o próximo', async () => {
  const chamados: string[] = []
  const res = await comFallbackDeModelo(['velho', 'novo'], (m) => {
    chamados.push(m)
    return Promise.resolve(m === 'velho'
      ? new Response('{"error":{"code":"model_decommissioned"}}', { status: 400 })
      : new Response('{"ok":true}', { status: 200 }))
  }, 'teste')
  assert.deepEqual(chamados, ['velho', 'novo'])
  assert.equal(res.status, 200)
})

Deno.test('fallback: chave inválida NÃO tenta outros modelos', async () => {
  const chamados: string[] = []
  await assert.rejects(
    comFallbackDeModelo(['a', 'b'], (m) => {
      chamados.push(m)
      return Promise.resolve(new Response('invalid api key', { status: 401 }))
    }, 'teste'),
    /teste falhou \(401, modelo a\)/,
  )
  assert.deepEqual(chamados, ['a'])
})

Deno.test('prompt no modo JSON simples descreve as chaves e cita JSON', () => {
  const s = montarSistema('quinta-feira, 2026-11-26 15:04 (UTC-03:00)', 'America/Fortaleza', 'json_object')
  assert.match(s, /JSON/)
  for (const k of ['titulo', 'descricao', 'inicio', 'fim', 'lembrar_min_antes', 'recorrencia']) assert.match(s, new RegExp(k))
  assert.doesNotMatch(montarSistema('x', 'y', 'json_schema'), /SOMENTE com um objeto JSON/)
})
