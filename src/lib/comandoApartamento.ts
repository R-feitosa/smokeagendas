import type { Predio, StatusUnidade, Unidade } from './types'

/**
 * Comando de voz para a aba Apartamentos: "o apartamento 304 do Feitosa 2 está desocupado".
 *
 * Funciona sobre a TRANSCRIÇÃO que a função de áudio já devolve (nada muda no servidor) e é
 * determinístico: só vira comando se houver (1) uma palavra de status e (2) um número de
 * unidade dito junto de "apartamento/apto/sala/unidade" ou do nome de um prédio. Quando não
 * dá para saber o prédio com certeza, a unidade vem como ambígua e a tela pergunta.
 * Sem rede; testado em tests/front/comandoApartamento.test.ts.
 */

export type Alvo = { predio: Predio; unidade: Unidade }
export type ItemComando = {
  /** número como foi dito ("304") */
  numero: string
  /** unidades possíveis: 1 = certeza; >1 = ambíguo (perguntar); 0 = não existe */
  opcoes: Alvo[]
}
export type ComandoApartamento = { status: StatusUnidade; itens: ItemComando[] }

const NUMEROS_POR_EXTENSO: Record<string, string> = {
  zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6',
  sete: '7', oito: '8', nove: '9', dez: '10', onze: '11', doze: '12', treze: '13', quatorze: '14',
  catorze: '14', quinze: '15', dezesseis: '16', dezessete: '17', dezoito: '18', dezenove: '19', vinte: '20',
}

/** minúsculas, sem acento, sem pontuação, números por extenso viram dígitos, "nº" some */
export function normalizar(texto: string): string {
  return ` ${texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/n[º°o]\s*(?=\d)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((p) => NUMEROS_POR_EXTENSO[p] ?? p)
    .join(' ')} `
}

/** letras repetidas contam uma vez: "connect" e "conect" batem */
const colapsar = (s: string) => s.replace(/([a-z])\1+/g, '$1')

// status: a ordem importa (as expressões de "vago" vêm antes para "desocupado" não virar "ocupado")
const VAGO = /\b(desocupad[oa]s?|vag[oa]s?|vazi[oa]s?|livres?|liberad[oa]s?|disponive(?:l|is)|entregou a chave|entregaram a chave|entrega da chave|entregou as chaves|entregaram as chaves|entrega das chaves|saiu|sairam|mudou se|mudaram se)\b/
const OCUPADO = /\b(ocupad[oa]s?|alugad[oa]s?|locad[oa]s?|novo inquilino|nova inquilina|entrou|entraram|alugou|alugaram)\b/
const NEGACAO = /\b(nao|nem)\s+(?:(?:esta|estao|ta|tao|fica|ficou|mais|e|sao)\s+){0,3}$/

/** "vago" | "ocupado" | null, com "não está mais vago" = ocupado e "não está ocupado" = vago */
export function detectarStatus(texto: string): StatusUnidade | null {
  const n = normalizar(texto)
  const achado = (re: RegExp): number => {
    const m = re.exec(n)
    return m ? m.index : -1
  }
  const iVago = achado(VAGO)
  const iOcupado = achado(OCUPADO)
  if (iVago < 0 && iOcupado < 0) return null
  // vale a primeira palavra de status dita
  const [status, i] = iVago >= 0 && (iOcupado < 0 || iVago <= iOcupado) ? (['vago', iVago] as const) : (['ocupado', iOcupado] as const)
  const negado = NEGACAO.test(n.slice(0, i))
  return negado ? (status === 'vago' ? 'ocupado' : 'vago') : status
}

// palavras que não identificam um imóvel sozinhas
const GENERICAS = new Set(['casa', 'apartamento', 'apto', 'sala', 'predio', 'edificio', 'escritorio', 'residencia', 'de', 'da', 'do', 'em'])

/**
 * Trechos do texto que nomeiam cada prédio/casa. Vale o nome inteiro e, como apelido:
 * prédio de locação → a 1ª palavra, se só ele a usa ("Connect");
 * casa de temporada → a última palavra, se não for genérica e só ela a usa ("Camocim", "Serra").
 */
function mencoesDePredios(n: string, predios: Predio[]): { predio: Predio; ini: number; fim: number }[] {
  const nc = colapsar(n)
  const palavras = predios.map((p) => colapsar(normalizar(p.nome).trim()).split(' '))
  const primeiras = palavras.map((w) => w[0])
  const ultimas = palavras.map((w) => w[w.length - 1])
  const achados: { predio: Predio; ini: number; fim: number }[] = []
  predios.forEach((p, i) => {
    const formas = [palavras[i].join(' ')]
    const apelido = p.categoria === 'temporada' ? ultimas[i] : primeiras[i]
    const lista = p.categoria === 'temporada' ? ultimas : primeiras
    if (!GENERICAS.has(apelido) && !/^\d+$/.test(apelido) && lista.filter((x) => x === apelido).length === 1) formas.push(apelido)
    for (const f of formas) {
      const re = new RegExp(`\\b${f}e?\\b`, 'g')
      for (const m of nc.matchAll(re)) achados.push({ predio: p, ini: m.index!, fim: m.index! + m[0].length })
    }
  })
  // nome inteiro ganha da 1ª palavra no mesmo trecho
  return achados.filter((a) => !achados.some((b) => b !== a && b.ini <= a.ini && b.fim >= a.fim && b.fim - b.ini > a.fim - a.ini))
}

const GATILHO_UNIDADE = /\b(apartamentos?|aptos?|aps?|salas?|unidades?|kitnets?|kits?|quitinetes?)\b/g
const LISTA_NUMEROS = /^\s*((?:\d+)(?:\s+(?:e\s+)?\d+)*)/

/**
 * Lê a transcrição e devolve o comando, ou null se a fala não for sobre status de unidade.
 * @param predios lista carregada da aba (com as unidades)
 */
export function interpretarComando(transcricao: string | null | undefined, predios: Predio[]): ComandoApartamento | null {
  if (!transcricao || predios.length === 0) return null
  const status = detectarStatus(transcricao)
  if (!status) return null

  const n = colapsar(normalizar(transcricao))
  const todasMencoes = mencoesDePredios(n, predios)
  // casas de temporada não têm número: citou a casa, é ela
  const casas = [...new Map(todasMencoes.filter((m) => m.predio.categoria === 'temporada').map((m) => [m.predio.id, m.predio])).values()]
  const mencoes = todasMencoes.filter((m) => m.predio.categoria !== 'temporada')
  // tira os nomes dos prédios do texto para o "1" de "Feitosa 1" não virar unidade
  let semNomes = n
  for (const m of [...todasMencoes].sort((a, b) => b.ini - a.ini)) semNomes = semNomes.slice(0, m.ini) + ' '.repeat(m.fim - m.ini) + semNomes.slice(m.fim)

  // números ditos logo depois de "apartamento/sala/…" (aceita lista: "6, 18 e 24")
  const numeros: { numero: string; pos: number }[] = []
  for (const g of semNomes.matchAll(GATILHO_UNIDADE)) {
    const resto = semNomes.slice(g.index! + g[0].length)
    const lista = LISTA_NUMEROS.exec(resto)
    if (!lista) continue
    for (const num of lista[1].matchAll(/\d+/g)) numeros.push({ numero: String(Number(num[0])), pos: g.index! })
  }
  // sem a palavra "apartamento": aceita "o 304 do Feitosa 2" quando um prédio foi citado
  const semGatilho = numeros.length === 0
  if (semGatilho && mencoes.length > 0) {
    for (const num of semNomes.matchAll(/\b\d+\b/g)) numeros.push({ numero: String(Number(num[0])), pos: num.index! })
  }
  const unicos = numeros.filter((x, i) => numeros.findIndex((y) => y.numero === x.numero) === i)
  const itensCasas: ItemComando[] = casas.map((c) => ({ numero: c.nome, opcoes: c.unidades.slice(0, 1).map((u) => ({ predio: c, unidade: u })) }))
  if (unicos.length === 0) return itensCasas.length ? { status, itens: itensCasas } : null

  const itens: ItemComando[] = unicos.map(({ numero, pos }) => {
    const todos: Alvo[] = predios.filter((p) => p.categoria !== 'temporada').flatMap((p) => p.unidades.filter((u) => u.numero === numero).map((u) => ({ predio: p, unidade: u })))
    const citados = [...new Set(mencoes.map((m) => m.predio.id))]
    let opcoes = todos
    if (citados.length === 1) opcoes = todos.filter((a) => a.predio.id === citados[0])
    else if (citados.length > 1) {
      // vários prédios na fala: vale o citado mais perto do número
      const perto = [...mencoes].sort((a, b) => Math.abs(a.ini - pos) - Math.abs(b.ini - pos))[0]
      const doPerto = todos.filter((a) => a.predio.id === perto.predio.id)
      opcoes = doPerto.length ? doPerto : todos.filter((a) => citados.includes(a.predio.id))
    }
    return { numero, opcoes }
  })
  // sem "apartamento/sala" na fala, número que não é unidade (dia, hora…) não conta
  const validos = [...(semGatilho ? itens.filter((i) => i.opcoes.length > 0) : itens), ...itensCasas]
  return validos.length ? { status, itens: validos } : null
}
