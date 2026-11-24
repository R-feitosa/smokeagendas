import assert from 'node:assert/strict'
import { descreverAgora, fusoOuPadrao, offsetDoFuso, textoQuando } from './datas.ts'

const FOR = 'America/Fortaleza' // UTC-3, sem horário de verão
const agora = new Date('2026-11-26T18:04:00Z') // quinta, 15:04 em Fortaleza

Deno.test('fusoOuPadrao aceita IANA válido e recusa lixo', () => {
  assert.deepEqual(fusoOuPadrao('America/Manaus'), 'America/Manaus')
  assert.deepEqual(fusoOuPadrao('Marte/Olimpo'), FOR)
  assert.deepEqual(fusoOuPadrao(null), FOR)
  assert.deepEqual(fusoOuPadrao(''), FOR)
})

Deno.test('offsetDoFuso', () => {
  assert.deepEqual(offsetDoFuso(agora, FOR), '-03:00')
  assert.deepEqual(offsetDoFuso(agora, 'America/Manaus'), '-04:00')
  assert.deepEqual(offsetDoFuso(agora, 'UTC'), '+00:00')
  assert.deepEqual(offsetDoFuso(agora, 'Asia/Kolkata'), '+05:30')
  // horário de verão: Nova York em janeiro (-05) e julho (-04)
  assert.deepEqual(offsetDoFuso(new Date('2026-01-15T12:00:00Z'), 'America/New_York'), '-05:00')
  assert.deepEqual(offsetDoFuso(new Date('2026-07-15T12:00:00Z'), 'America/New_York'), '-04:00')
})

Deno.test('descreverAgora traz dia da semana, data local e offset', () => {
  assert.deepEqual(descreverAgora(agora, FOR), 'quinta-feira, 2026-11-26 15:04 (UTC-03:00)')
})

Deno.test('textoQuando: hoje, amanhã e outros dias no fuso da pessoa', () => {
  assert.deepEqual(textoQuando(new Date('2026-11-26T20:30:00Z'), FOR, agora), 'Hoje às 17:30')
  assert.deepEqual(textoQuando(new Date('2026-11-27T12:00:00Z'), FOR, agora), 'Amanhã às 09:00')
  assert.deepEqual(textoQuando(new Date('2026-11-28T12:00:00Z'), FOR, agora), 'Sábado, 28/11 às 09:00')
  assert.deepEqual(textoQuando(new Date('2026-12-01T12:00:00Z'), FOR, agora), 'Terça, 01/12 às 09:00')
})

Deno.test('textoQuando: 01:00 UTC de sexta ainda é quinta em Fortaleza', () => {
  // o bug original usava "Hoje" sempre; aqui o dia muda conforme o fuso
  assert.deepEqual(textoQuando(new Date('2026-11-27T01:00:00Z'), FOR, agora), 'Hoje às 22:00')
  assert.deepEqual(textoQuando(new Date('2026-11-27T01:00:00Z'), 'UTC', agora), 'Amanhã às 01:00')
})
