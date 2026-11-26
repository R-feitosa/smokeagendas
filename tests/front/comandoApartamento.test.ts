// Comando de voz da aba Apartamentos. Rode com: npm run test:front
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectarStatus, interpretarComando } from '../../src/lib/comandoApartamento.ts'
import type { Predio } from '../../src/lib/types.ts'

const NUMEROS: Record<string, number[]> = {
  'Feitosa 1': [1, 3, 4, 101, 102, 103, 104, 201, 202, 203, 204],
  'Feitosa 2': [101, 102, 103, 104, 201, 202, 203, 204, 301, 302, 303, 304, 401, 402, 403, 404],
  'Feitosa 3': Array.from({ length: 34 }, (_, i) => i + 1),
  'Connect Office': [101, 102, 103, 104, 201, 202, 203],
}
const CASAS = ['Escritório Moradas', 'Residência Roneely', 'Casa da Serra', 'Casa Camocim', 'Apartamento de Fortaleza']
for (const c of CASAS) NUMEROS[c] = [1]
const PREDIOS: Predio[] = Object.entries(NUMEROS).map(([nome, ns], i) => ({
  id: `p${i + 1}`,
  nome,
  categoria: CASAS.includes(nome) ? 'temporada' : 'locacao',
  tipo_unidade: CASAS.includes(nome) ? 'imovel' : nome === 'Connect Office' ? 'sala' : 'apartamento',
  ordem: i + 1,
  unidades: ns.map((n) => ({
    id: `p${i + 1}-${n}`, predio_id: `p${i + 1}`, numero: String(n), status: 'ocupado',
    status_desde: null, atualizado_em: null, atualizado_por_nome: null,
  })),
}))

/** resumo legível: status + "prédio:número" de cada item (ambíguo = "?:número") */
function ler(fala: string) {
  const c = interpretarComando(fala, PREDIOS)
  if (!c) return null
  return {
    status: c.status,
    alvos: c.itens.map((i) => (i.opcoes.length === 1 ? `${i.opcoes[0].predio.nome}:${i.numero}` : `${i.opcoes.length === 0 ? '∅' : '?'}:${i.numero}`)),
  }
}

test('frase do pedido: apartamento desocupado vira vago', () => {
  assert.deepEqual(ler('O apartamento 304 do Feitosa 2 está desocupado'), { status: 'vago', alvos: ['Feitosa 2:304'] })
})

test('sinônimos de vago e de ocupado', () => {
  assert.equal(ler('Apto 6 do Feitosa 3 ficou vago')?.status, 'vago')
  assert.equal(ler('O inquilino do apartamento 6 do Feitosa 3 entregou as chaves')?.status, 'vago')
  assert.equal(ler('Apartamento 6 do Feitosa 3 liberado')?.status, 'vago')
  assert.equal(ler('Apartamento 6 do Feitosa 3 foi alugado')?.status, 'ocupado')
  assert.equal(ler('Apartamento 6 do Feitosa 3 está ocupado de novo')?.status, 'ocupado')
  assert.equal(ler('Feitosa 3 apartamento 6 locado')?.status, 'ocupado')
})

test('"desocupado" não é lido como "ocupado"', () => {
  assert.equal(detectarStatus('está desocupado'), 'vago')
  assert.equal(detectarStatus('desocupada'), 'vago')
})

test('negação inverte: "não está mais vago" = ocupado', () => {
  assert.equal(ler('O apartamento 304 do Feitosa 2 não está mais vago')?.status, 'ocupado')
  assert.equal(ler('A sala 102 do Connect Office não está ocupada')?.status, 'vago')
})

test('número por extenso, "nº" e prédio por extenso', () => {
  assert.deepEqual(ler('Apartamento seis do Feitosa três está vago'), { status: 'vago', alvos: ['Feitosa 3:6'] })
  assert.deepEqual(ler('Apto nº 18, Feitosa 3, desocupado'), { status: 'vago', alvos: ['Feitosa 3:18'] })
})

test('o "1" de "Feitosa 1" não vira unidade', () => {
  assert.deepEqual(ler('Feitosa 1, apartamento 203, ficou vago'), { status: 'vago', alvos: ['Feitosa 1:203'] })
})

test('vários de uma vez: "6, 18 e 24"', () => {
  assert.deepEqual(ler('Os apartamentos 6, 18 e 24 do Feitosa 3 foram alugados'), {
    status: 'ocupado',
    alvos: ['Feitosa 3:6', 'Feitosa 3:18', 'Feitosa 3:24'],
  })
})

test('Connect Office: nome inteiro, só "Connect" ou com grafia diferente', () => {
  assert.deepEqual(ler('A sala 201 do Connect Office está vaga'), { status: 'vago', alvos: ['Connect Office:201'] })
  assert.deepEqual(ler('Sala 201 do Connect desocupada'), { status: 'vago', alvos: ['Connect Office:201'] })
  assert.deepEqual(ler('Sala 201 do Conect vaga'), { status: 'vago', alvos: ['Connect Office:201'] })
})

test('sem prédio: número que só existe num prédio é certeza; repetido fica ambíguo', () => {
  assert.deepEqual(ler('Apartamento 404 desocupado'), { status: 'vago', alvos: ['Feitosa 2:404'] })
  assert.deepEqual(ler('Apartamento 101 desocupado'), { status: 'vago', alvos: ['?:101'] })
  assert.equal(interpretarComando('Apartamento 101 desocupado', PREDIOS)?.itens[0].opcoes.length, 3)
})

test('unidade que não existe no prédio citado vem sem opção', () => {
  assert.deepEqual(ler('Apartamento 999 do Feitosa 2 está vago'), { status: 'vago', alvos: ['∅:999'] })
})

test('sem a palavra "apartamento": "o 304 do Feitosa 2 vagou" funciona; números soltos não', () => {
  assert.deepEqual(ler('O 304 do Feitosa 2 está vago'), { status: 'vago', alvos: ['Feitosa 2:304'] })
  assert.deepEqual(ler('Feitosa 2 ficou com o 304 vago desde o dia 10'), { status: 'vago', alvos: ['Feitosa 2:304'] })
})

test('fala de compromisso não vira comando', () => {
  assert.equal(ler('Reunião com o cliente sexta às 15h, me avisa 30 minutos antes'), null)
  assert.equal(ler('Vistoria no apartamento 304 do Feitosa 2 amanhã às 9h'), null)
  assert.equal(ler('Pagar o boleto do condomínio amanhã às 9h'), null)
  assert.equal(ler('Estou livre amanhã'), null) // status sem unidade
  assert.equal(interpretarComando('', PREDIOS), null)
  assert.equal(interpretarComando('Apartamento 304 vago', []), null)
})

test('casas de temporada: pelo nome, sem número', () => {
  assert.deepEqual(ler('A Casa da Serra está ocupada'), { status: 'ocupado', alvos: ['Casa da Serra:Casa da Serra'] })
  assert.deepEqual(ler('Camocim ficou livre'), { status: 'vago', alvos: ['Casa Camocim:Casa Camocim'] })
  assert.deepEqual(ler('A casa de Camocim está alugada no fim de semana'), { status: 'ocupado', alvos: ['Casa Camocim:Casa Camocim'] })
  assert.deepEqual(ler('Escritório Moradas desocupado'), { status: 'vago', alvos: ['Escritório Moradas:Escritório Moradas'] })
  assert.deepEqual(ler('Residência Roneely ocupada'), { status: 'ocupado', alvos: ['Residência Roneely:Residência Roneely'] })
  assert.deepEqual(ler('O apartamento de Fortaleza está vago'), { status: 'vago', alvos: ['Apartamento de Fortaleza:Apartamento de Fortaleza'] })
})

test('casas de temporada não confundem os prédios', () => {
  // "apartamento" sozinho não aponta para o Apartamento de Fortaleza
  assert.deepEqual(ler('Apartamento 404 desocupado'), { status: 'vago', alvos: ['Feitosa 2:404'] })
  // casa citada + número solto de data: o número não vira unidade de prédio
  assert.deepEqual(ler('A Casa da Serra fica ocupada até o dia 10'), { status: 'ocupado', alvos: ['Casa da Serra:Casa da Serra'] })
  // "casa" sozinha não é nenhuma das casas
  assert.equal(ler('A casa está vazia'), null)
})
