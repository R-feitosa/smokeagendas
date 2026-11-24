import assert from 'node:assert/strict'
import { montarNotificacao } from './notificacao.ts'

const agora = new Date('2026-11-26T18:04:00Z') // quinta 15:04 em Fortaleza
const base = {
  id: 'ev1',
  titulo: 'Audiência TRT',
  descricao: 'Sala 3',
  inicio: '2026-11-26T20:30:00Z',
  fuso: 'America/Fortaleza',
  envio: 1,
}

Deno.test('1º aviso: título do compromisso, quando e descrição', () => {
  assert.deepEqual(montarNotificacao(base, agora), {
    title: 'Audiência TRT',
    body: 'Hoje às 17:30 — Sala 3',
    tag: 'ev1:1',
    eventId: 'ev1',
    envio: 1,
    url: '/',
  })
})

Deno.test('reenvio: título sinaliza pendência e a tag muda (toca de novo)', () => {
  const n = montarNotificacao({ ...base, envio: 3, descricao: null }, agora)
  assert.equal(n.title, 'Ainda pendente: Audiência TRT')
  assert.equal(n.body, 'Hoje às 17:30')
  assert.equal(n.tag, 'ev1:3')
  assert.notEqual(n.tag, montarNotificacao(base, agora).tag)
})
