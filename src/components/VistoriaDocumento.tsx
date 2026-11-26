import type { ReactNode } from 'react'
import type { VistoriaComUnidade } from '../lib/api'
import { AVALIACOES, modeloDe, type Secao } from '../lib/vistoria'

/**
 * A vistoria concluída no MESMO formato das fichas de papel da Feitosa, para imprimir
 * ou salvar em PDF (só aparece na impressão; estilos `.doc` em styles.css):
 *   - apartamento/sala (saida_v1): ficha do AP 304 · Feitosa II (18/11/2026)
 *     uma seção por página + página "Finalização da vistoria", logo e rodapé numerado em cada página;
 *   - casa de temporada (temporada_v1): ficha da Casa da Serra (22/11/2026)
 *     seções numeradas em quadrado azul; seção 4 + operacional + pendências + declaração na última página.
 * Assinaturas em branco, para assinar à mão depois de impresso.
 */

const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Como a ficha chama a unidade: "AP 304 - FEITOSA II", "SALA 102 - CONNECT OFFICE", "CASA DA SERRA" */
export function unidadeNoDocumento(predio: string, numero: string, tipo: VistoriaComUnidade['tipo_unidade']): string {
  const nome = predio.replace(/\s(\d{1,2})$/, (_, n: string) => ` ${ROMANOS[Number(n)] ?? n}`).toUpperCase()
  if (tipo === 'imovel') return nome
  return `${tipo === 'sala' ? 'SALA' : 'AP'} ${numero} - ${nome}`
}

/** "2026-11-18" -> "18 de novembro de 2026" (data de calendário, sem fuso) */
function porExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}
const dataBarra = (iso: string) => iso.split('-').reverse().join('/')
/** "Sobral - CE" -> "Sobral/CE" (como na linha de local e data da ficha) */
const cidadeBarra = (c: string) => c.replace(/\s*-\s*/, '/')

/** Logo da Feitosa colorido, como no topo das fichas */
function Logo() {
  return (
    <div className="doc__logo">
      <svg viewBox="0 0 265 235" aria-hidden="true">
        <polygon points="0,57 170,0 265,45 265,88 0,88" fill="#4fa3d9" />
        <rect x="0" y="100" width="235" height="35" fill="#c99aa4" />
        <rect x="0" y="147" width="265" height="38" fill="#3d8fc9" />
        <rect x="0" y="197" width="235" height="38" fill="#a9868d" />
      </svg>
      <span>
        <strong>FEITOSA</strong>
        <small>PARTICIPAÇÕES IMOBILIÁRIAS</small>
      </span>
    </div>
  )
}

function Caixa({ marcada }: { marcada: boolean }) {
  return <span className={`doc__caixa ${marcada ? 'doc__caixa--x' : ''}`} aria-hidden="true" />
}

function Pagina({ rodape, numero, children }: { rodape: ReactNode; numero?: number; children: ReactNode }) {
  return (
    <section className="doc__pagina">
      <div className="doc__miolo">{children}</div>
      <footer className="doc__rodape">
        <span>{rodape}</span>
        {numero !== undefined && <span>{numero}</span>}
      </footer>
    </section>
  )
}

export function VistoriaDocumento({ v }: { v: VistoriaComUnidade }) {
  const modelo = modeloDe(v)
  const casa = modelo.id === 'temporada_v1'
  const unidade = unidadeNoDocumento(v.predio_nome, v.numero, v.tipo_unidade)
  const locatario = v.locatario?.trim() ?? ''

  const tabela = (s: Secao) => (
    <table className="doc__tabela">
      <thead>
        <tr>
          <th>ITEM</th>
          {AVALIACOES.map(([a, rotulo]) => (
            <th key={a} className="doc__col">
              {rotulo.toUpperCase()}
            </th>
          ))}
          <th>OBSERVAÇÕES / AVARIAS</th>
        </tr>
      </thead>
      <tbody>
        {s.itens.map((item) => {
          const r = v.respostas[item.id] ?? {}
          return (
            <tr key={item.id}>
              <td>{item.rotulo}</td>
              {AVALIACOES.map(([a]) => (
                <td key={a} className="doc__col">
                  <Caixa marcada={r.avaliacao === a} />
                </td>
              ))}
              <td className="doc__obs">{r.obs?.trim()}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  const cabecalho = (
    <>
      <Logo />
      <h1 className="doc__titulo">CHECKLIST DE VISTORIA DE SAÍDA</h1>
      <p className="doc__subtitulo">{modelo.subtitulo}</p>
      <table className="doc__cab">
        <tbody>
          <tr>
            <th>LOCATÁRIO</th>
            <td>{locatario}</td>
            <th>UNIDADE</th>
            <td>{unidade}</td>
          </tr>
          <tr>
            <th>TIPO DE VISTORIA</th>
            <td>{casa ? 'SAIDA' : 'SAÍDA'}</td>
            <th>DATA</th>
            <td>{dataBarra(v.data_vistoria)}</td>
          </tr>
          <tr>
            <th>CIDADE</th>
            <td>{v.cidade}</td>
            <th>LOCADOR</th>
            <td>{v.locador}</td>
          </tr>
        </tbody>
      </table>
    </>
  )

  const operacional = modelo.operacional.map((o) => {
    const r = v.operacional[o.id] ?? {}
    return (
      <li key={o.id}>
        <Caixa marcada={!!r.ok} />
        <span className="doc__oper-rotulo">{o.rotulo}</span>
        <span className="doc__oper-obs">
          Observação: <span className="doc__escrito">{r.obs?.trim()}</span>
        </span>
      </li>
    )
  })

  const linhasPendencia = (() => {
    const linhas = (v.pendencias ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    while (linhas.length < 5) linhas.push('')
    return linhas.map((l, i) => (
      <p key={i} className="doc__linha-escrita">
        {l}
      </p>
    ))
  })()

  const assinaturas = (
    <>
      <div className="doc__assinaturas">
        <div>
          <span className="doc__traco" />
          LOCADOR / VISTORIADOR
        </div>
        <div>
          <span className="doc__traco" />
          {locatario.toUpperCase() || 'LOCATÁRIO'}
        </div>
      </div>
      <p className="doc__local">
        {cidadeBarra(v.cidade)}, {porExtenso(v.data_vistoria)}.
      </p>
    </>
  )

  if (!casa) {
    // ---- ficha do apartamento (AP 304 · Feitosa II) ----
    const rodape = `FEITOSA PARTICIPAÇÕES IMOBILIÁRIAS  |  VISTORIA DE SAÍDA  |  ${unidade}`
    const n = modelo.secoes.length
    return (
      <article className="doc doc--apto" aria-hidden="true">
        {modelo.secoes.map((s, i) => (
          <Pagina key={s.id} rodape={rodape} numero={i + 1}>
            {i === 0 ? (
              <>
                {cabecalho}
                <p className="doc__como">
                  COMO PREENCHER: Marque uma avaliação por item. Em caso de estado ruim, descreva a avaria e faça registro
                  fotográfico. Utilize N/A quando o item não existir ou não puder ser verificado.
                </p>
              </>
            ) : (
              <Logo />
            )}
            <h2 className="doc__secao">
              {s.titulo.toUpperCase()} — {s.subtitulo}
            </h2>
            {tabela(s)}
          </Pagina>
        ))}
        <Pagina rodape={rodape} numero={n + 1}>
          <Logo />
          <h1 className="doc__titulo">FINALIZAÇÃO DA VISTORIA</h1>
          <h2 className="doc__secao">{n + 1} CHECKLIST OPERACIONAL DE SAÍDA</h2>
          <ul className="doc__oper">{operacional}</ul>
          <h2 className="doc__secao">{n + 2} PENDÊNCIAS E OBSERVAÇÕES FINAIS</h2>
          <div className="doc__pendencias">{linhasPendencia}</div>
          <h2 className="doc__secao">{n + 3} DECLARAÇÃO E ASSINATURAS</h2>
          <p className="doc__declaracao">{modelo.declaracao}</p>
          {assinaturas}
        </Pagina>
      </article>
    )
  }

  // ---- ficha da casa de temporada (Casa da Serra) ----
  const rodape = `FEITOSA ADMINISTRADORA DE IMÓVEIS LTDA  •  Vistoria de Saída  •  ${v.predio_nome}`
  const n = modelo.secoes.length
  const titulo = (num: number, texto: string, sub?: string) => (
    <h2 className="doc__secao">
      <span className="doc__num">{num}</span>
      {texto.toUpperCase()}
      {sub && <small>{sub}</small>}
    </h2>
  )
  const secao = (s: Secao, i: number) => (
    <div key={s.id}>
      {titulo(i + 1, s.titulo.replace(/^\d+\s*/, ''), s.subtitulo)}
      {tabela(s)}
    </div>
  )
  return (
    <article className="doc doc--casa" aria-hidden="true">
      <Pagina rodape={rodape}>
        {cabecalho}
        <div className="doc__como">
          <span className="doc__i">i</span>
          <p>
            <strong>COMO PREENCHER</strong> Marque apenas uma avaliação por item. Em “Ruim”, descreva a avaria em Observações
            e faça registro fotográfico. Use N/A quando o item não existir ou não puder ser verificado.
          </p>
        </div>
        {secao(modelo.secoes[0], 0)}
      </Pagina>
      {modelo.secoes.slice(1, -1).map((s, i) => (
        <Pagina key={s.id} rodape={rodape}>
          {secao(s, i + 1)}
        </Pagina>
      ))}
      <Pagina rodape={rodape}>
        {secao(modelo.secoes[n - 1], n - 1)}
        {titulo(n + 1, 'Checklist operacional de saida', 'Conferências complementares')}
        <ul className="doc__oper">{operacional}</ul>
        {titulo(n + 2, 'Pendências e observações finais', 'Use este campo para detalhar danos, reparos ou ressalvas')}
        <div className="doc__pendencias">{linhasPendencia}</div>
        {titulo(n + 3, 'Declaração e assinaturas')}
        <p className="doc__declaracao">{modelo.declaracao}</p>
        {assinaturas}
      </Pagina>
    </article>
  )
}
