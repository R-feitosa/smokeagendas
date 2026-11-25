// Regras de exibição da aba Apartamentos. Rode com: npm run test:front
// (Node 22.18+ executa TypeScript direto; não precisa de nenhuma dependência.)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  contagemVagos,
  fileiras,
  nomeUnidade,
  nomeUnidadePorExtenso,
  ordenarUnidades,
  porcentagem,
  resumir,
} from '../../src/lib/apartamentos.ts'
import { dataCurta, tempoDesde } from '../../src/lib/datas.ts'

type Status = 'vago' | 'ocupado'
const unidade = (numero: string | number, status: Status = 'ocupado') => ({ numero: String(numero), status })
const numeros = (us: { numero: string }[]) => us.map((u) => u.numero)

// a planilha de 25/11/2026, como está na migration 0007
const VAGOS: Record<string, number[]> = { 'Feitosa 2': [304], 'Feitosa 3': [6, 18, 24], 'Connect Office': [102, 104, 201, 202] }
const PLANILHA: Record<string, number[]> = {
  'Feitosa 1': [1, 3, 4, 101, 102, 103, 104, 201, 202, 203, 204],
  'Feitosa 2': [101, 102, 103, 104, 201, 202, 203, 204, 301, 302, 303, 304, 401, 402, 403, 404],
  'Feitosa 3': Array.from({ length: 34 }, (_, i) => i + 1),
  'Connect Office': [101, 102, 103, 104, 201, 202, 203],
}
const doPredio = (nome: string) => PLANILHA[nome].map((n) => unidade(n, VAGOS[nome]?.includes(n) ? 'vago' : 'ocupado'))
const todas = Object.keys(PLANILHA).flatMap(doPredio)

test('resumo geral da planilha: 68 unidades, 8 vagas, 60 ocupadas, 88,2% de ocupação', () => {
  const r = resumir(todas)
  assert.deepEqual({ total: r.total, vagos: r.vagos, ocupados: r.ocupados }, { total: 68, vagos: 8, ocupados: 60 })
  assert.equal(r.ocupacao, 60 / 68)
  assert.equal(porcentagem(r.ocupacao), '88,2%')
})

test('resumo por prédio confere com a planilha', () => {
  const porPredio = Object.fromEntries(Object.keys(PLANILHA).map((nome) => [nome, resumir(doPredio(nome))]))
  assert.deepEqual(
    Object.entries(porPredio).map(([nome, r]) => `${nome}: ${r.ocupados}/${r.total}`),
    ['Feitosa 1: 11/11', 'Feitosa 2: 15/16', 'Feitosa 3: 31/34', 'Connect Office: 3/7'],
  )
})

test('resumo sem unidades não divide por zero', () => {
  assert.deepEqual(resumir([]), { total: 0, vagos: 0, ocupados: 0, ocupacao: 0 })
})

test('porcentagem usa vírgula e uma casa decimal', () => {
  assert.equal(porcentagem(1), '100,0%')
  assert.equal(porcentagem(0), '0,0%')
  assert.equal(porcentagem(3 / 7), '42,9%')
})

test('unidades em ordem de porta (numérica, não alfabética)', () => {
  assert.deepEqual(numeros(ordenarUnidades(['10', '2', '201', '1', '104', '3'].map((n) => unidade(n)))), ['1', '2', '3', '10', '104', '201'])
})

test('ordenar não altera a lista recebida', () => {
  const original = [unidade(2), unidade(1)]
  ordenarUnidades(original)
  assert.deepEqual(numeros(original), ['2', '1'])
})

test('fileiras: numeração por centena vira uma fileira por centena', () => {
  assert.deepEqual(fileiras(doPredio('Feitosa 1')).map(numeros), [
    ['1', '3', '4'],
    ['101', '102', '103', '104'],
    ['201', '202', '203', '204'],
  ])
  assert.deepEqual(
    fileiras(doPredio('Feitosa 2')).map((f) => f.length),
    [4, 4, 4, 4],
  )
})

test('fileiras: numeração corrida (1 a 34) fica numa fileira só, em ordem', () => {
  const f = fileiras(doPredio('Feitosa 3'))
  assert.equal(f.length, 1)
  assert.deepEqual(numeros(f[0]), Array.from({ length: 34 }, (_, i) => String(i + 1)))
})

test('fileiras: com filtro, cada centena continua na sua fileira', () => {
  const vagas = doPredio('Connect Office').filter((u) => u.status === 'vago')
  assert.deepEqual(fileiras(vagas).map(numeros), [
    ['102', '104'],
    ['201', '202'],
  ])
  assert.deepEqual(fileiras([]), [])
})

test('fileiras: número que não é só dígito vai para o fim', () => {
  assert.deepEqual(fileiras([unidade('Loja A'), unidade(101), unidade(2)]).map(numeros), [['2'], ['101'], ['Loja A']])
})

test('textos: contagem de vagos e nome da unidade', () => {
  assert.equal(contagemVagos(0), 'nenhum vago')
  assert.equal(contagemVagos(1), '1 vago')
  assert.equal(contagemVagos(8), '8 vagos')
  assert.equal(nomeUnidade({ tipo_unidade: 'apartamento' }, { numero: '304' }), 'Apto 304')
  assert.equal(nomeUnidade({ tipo_unidade: 'sala' }, { numero: '102' }), 'Sala 102')
  assert.equal(nomeUnidadePorExtenso({ tipo_unidade: 'apartamento' }, { numero: '304' }), 'Apartamento 304')
  assert.equal(nomeUnidadePorExtenso({ tipo_unidade: 'sala' }, { numero: '102' }), 'Sala 102')
})

test('datas da folha: "desde" e há quanto tempo, em dias de calendário', () => {
  const agora = new Date(2026, 10, 25, 9, 0) // 25/11/2026 09:00 (hora local)
  assert.equal(dataCurta(agora), '25/11/2026')
  assert.equal(tempoDesde(new Date(2026, 10, 25, 0, 5), agora), 'hoje')
  assert.equal(tempoDesde(new Date(2026, 10, 24, 23, 59), agora), 'ontem')
  assert.equal(tempoDesde(new Date(2026, 10, 13, 15, 0), agora), 'há 12 dias')
  assert.equal(tempoDesde(new Date(2026, 10, 26, 8, 0), agora), 'hoje') // relógio do aparelho atrasado: não fica negativo
})
