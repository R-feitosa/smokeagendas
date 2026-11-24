import assert from 'node:assert/strict'
import { RascunhoInvalido, validarRascunho } from './validar.ts'

const base = {
  titulo: 'Audiência TRT',
  descricao: null,
  inicio: '2026-11-27T15:00:00-03:00',
  fim: null,
  lembrar_min_antes: 30,
  recorrencia: null,
}

Deno.test('rascunho válido passa inalterado', () => {
  assert.deepEqual(validarRascunho(base), base)
})

Deno.test('recusa sem título, sem data ou data sem offset', () => {
  assert.throws(() => validarRascunho(null), RascunhoInvalido)
  assert.throws(() => validarRascunho({ ...base, titulo: '   ' }), RascunhoInvalido)
  assert.throws(() => validarRascunho({ ...base, inicio: 'amanhã' }), RascunhoInvalido)
  // sem offset seria interpretado no fuso do SERVIDOR (UTC) -> 3h de erro
  assert.throws(() => validarRascunho({ ...base, inicio: '2026-11-27T15:00:00' }), RascunhoInvalido)
})

Deno.test('normaliza campos fora da regra em vez de quebrar', () => {
  const r = validarRascunho({
    ...base,
    titulo: '  Reunião  ',
    descricao: '   ',
    fim: '2026-11-27T14:00:00-03:00', // antes do início -> descartado
    lembrar_min_antes: -5,
    recorrencia: 'anual',
  })
  assert.deepEqual(r.titulo, 'Reunião')
  assert.deepEqual(r.descricao, null)
  assert.deepEqual(r.fim, null)
  assert.deepEqual(r.lembrar_min_antes, 0)
  assert.deepEqual(r.recorrencia, null)
})

Deno.test('antecedência: limita a 7 dias e usa 30 se vier lixo', () => {
  assert.deepEqual(validarRascunho({ ...base, lembrar_min_antes: 99999 }).lembrar_min_antes, 10080)
  assert.deepEqual(validarRascunho({ ...base, lembrar_min_antes: 'x' }).lembrar_min_antes, 30)
  assert.deepEqual(validarRascunho({ ...base, lembrar_min_antes: 14.6 }).lembrar_min_antes, 15)
})

Deno.test('aceita Z e fim válido', () => {
  const r = validarRascunho({ ...base, inicio: '2026-11-27T18:00:00Z', fim: '2026-11-27T19:00:00Z' })
  assert.deepEqual(r.fim, '2026-11-27T19:00:00Z')
})
