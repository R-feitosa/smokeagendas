// Modelo e regras da vistoria de saída. Rode com: npm run test:front
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MODELOS, OPERACIONAL, SECOES, dataBr, progresso, rotuloUnidade, sugerirPendencias, type RespostaItem } from '../../src/lib/vistoria.ts'

test('modelo igual ao PDF: Quarto 7 itens, Banheiro 11, operacional 6', () => {
  assert.deepEqual(SECOES.map((s) => [s.titulo, s.itens.length]), [['1 Quarto', 7], ['2 Banheiro', 11]])
  assert.equal(OPERACIONAL.length, 6)
  const ids = SECOES.flatMap((s) => s.itens.map((i) => i.id))
  assert.equal(new Set(ids).size, ids.length, 'chaves de item únicas')
})

test('vistoria em branco: 0 de 18 e não pode concluir', () => {
  const p = progresso({ respostas: {} })
  assert.equal(p.avaliados, 0)
  assert.equal(p.total, 18)
  assert.deepEqual(p.faltando, ['18 itens sem avaliação'])
})

test('a vistoria do PDF (paredes do quarto ruins, resto ótimo) só conclui com a descrição da avaria', () => {
  const respostas: Record<string, RespostaItem> = {}
  for (const s of SECOES) for (const i of s.itens) respostas[i.id] = { avaliacao: 'otimo' }
  respostas['quarto.pintura_paredes'] = { avaliacao: 'ruim' }
  assert.deepEqual(progresso({ respostas }).faltando, ['1 item ruim sem descrição da avaria'])
  respostas['quarto.pintura_paredes'].obs = 'Realizar pintura das paredes'
  const p = progresso({ respostas })
  assert.deepEqual(p.faltando, [])
  assert.equal(p.avaliados, 18)
  assert.equal(sugerirPendencias({ respostas }), 'Quarto: pintura das paredes (Realizar pintura das paredes).')
})

test('N/A conta como avaliado', () => {
  const respostas: Record<string, RespostaItem> = {}
  for (const s of SECOES) for (const i of s.itens) respostas[i.id] = { avaliacao: 'na' }
  assert.deepEqual(progresso({ respostas }).faltando, [])
})

test('textos: data e unidade', () => {
  assert.equal(dataBr('2026-11-18'), '18/11/2026')
  assert.equal(rotuloUnidade('Feitosa 2', '304', 'apartamento'), 'Feitosa 2 · Apto 304')
  assert.equal(rotuloUnidade('Connect Office', '102', 'sala'), 'Connect Office · Sala 102')
})

test('modelo da casa de temporada igual ao PDF da Casa da Serra: 15 + 17 + 20 + 16 itens, operacional 6', () => {
  const m = MODELOS.temporada_v1
  assert.deepEqual(m.secoes.map((s) => [s.titulo, s.itens.length]), [
    ['1 Acessos e áreas externas', 15],
    ['2 Estrutura e acabamentos', 17],
    ['3 Cozinha e eletrodomésticos', 20],
    ['4 Mobiliário e enxoval', 16],
  ])
  assert.equal(m.operacional.length, 6)
  const ids = m.secoes.flatMap((s) => s.itens.map((i) => i.id))
  assert.equal(new Set(ids).size, ids.length, 'chaves únicas')
  assert.equal(progresso({ modelo: 'temporada_v1', respostas: {} }).total, 68)
  assert.equal(progresso({ modelo: 'saida_v1', respostas: {} }).total, 18)
  assert.equal(progresso({ modelo: 'desconhecido', respostas: {} }).total, 18, 'modelo desconhecido cai no padrão')
})

test('casa: item ruim sugere pendência com o nome da seção', () => {
  const respostas: Record<string, RespostaItem> = { 'cozinha.liquidificador': { avaliacao: 'ruim', obs: 'não liga' } }
  assert.equal(sugerirPendencias({ modelo: 'temporada_v1', respostas }), 'Cozinha e eletrodomésticos: liquidificador (não liga).')
  assert.equal(rotuloUnidade('Casa da Serra', '1', 'imovel'), 'Casa da Serra')
})
