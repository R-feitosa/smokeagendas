import type { VistoriaComUnidade } from '../lib/api'
import { AVALIACOES, dataBr, modeloDe, rotuloUnidade } from '../lib/vistoria'

/** Logo da Feitosa em azul, para papel (a marca do app é branca, para fundo escuro) */
function LogoPapel() {
  return (
    <svg viewBox="0 0 265 235" width="52" height="46" aria-hidden="true">
      <g fill="#2c4296">
        <polygon points="0,57 170,0 265,45 265,88 0,88" />
        <rect x="0" y="100" width="235" height="35" />
        <rect x="0" y="147" width="265" height="38" />
        <rect x="0" y="197" width="235" height="38" />
      </g>
    </svg>
  )
}

/** "2026-11-18" -> "18 de novembro de 2026" (data de calendário, sem fuso) */
function dataPorExtensoDoc(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * A vistoria no formato da ficha de papel da Feitosa, para imprimir ou salvar em PDF
 * (aparece só na impressão; ver `.doc` em styles.css). Linhas de assinatura em branco
 * para assinar à mão depois de impresso.
 */
export function VistoriaDocumento({ v }: { v: VistoriaComUnidade }) {
  const modelo = modeloDe(v)
  const unidade = rotuloUnidade(v.predio_nome, v.numero, v.tipo_unidade)
  const n = modelo.secoes.length
  const rodape = `Feitosa Administradora de Imóveis Ltda. · Vistoria de saída · ${unidade}`

  return (
    <article className="doc" aria-hidden="true">
      <header className="doc__marca">
        <LogoPapel />
        <span>
          <strong>FEITOSA</strong>
          <small>Participações Imobiliárias</small>
        </span>
      </header>
      <h1 className="doc__titulo">Checklist de vistoria de saída</h1>
      <p className="doc__subtitulo">{modelo.subtitulo}</p>

      <table className="doc__cab">
        <tbody>
          <tr>
            <th>Locatário</th>
            <td>{v.locatario?.trim() || '—'}</td>
            <th>Unidade</th>
            <td>{unidade}</td>
          </tr>
          <tr>
            <th>Tipo de vistoria</th>
            <td>Saída</td>
            <th>Data</th>
            <td>{dataBr(v.data_vistoria)}</td>
          </tr>
          <tr>
            <th>Cidade</th>
            <td>{v.cidade}</td>
            <th>Locador</th>
            <td>{v.locador}</td>
          </tr>
        </tbody>
      </table>

      {modelo.secoes.map((s) => (
        <section key={s.id} className="doc__secao">
          <h2>
            {s.titulo} <small>— {s.subtitulo}</small>
          </h2>
          <table className="doc__tabela">
            <thead>
              <tr>
                <th>Item</th>
                {AVALIACOES.map(([a, rotulo]) => (
                  <th key={a} className="doc__nota">
                    {rotulo}
                  </th>
                ))}
                <th>Observações / avarias</th>
              </tr>
            </thead>
            <tbody>
              {s.itens.map((item) => {
                const r = v.respostas[item.id] ?? {}
                return (
                  <tr key={item.id} className={r.avaliacao === 'ruim' ? 'doc__ruim' : undefined}>
                    <td>{item.rotulo}</td>
                    {AVALIACOES.map(([a]) => (
                      <td key={a} className="doc__nota">
                        {r.avaliacao === a ? '✕' : ''}
                      </td>
                    ))}
                    <td>{r.obs?.trim()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}

      <section className="doc__secao">
        <h2>{n + 1} Checklist operacional de saída</h2>
        <table className="doc__tabela doc__oper">
          <tbody>
            {modelo.operacional.map((o) => {
              const r = v.operacional[o.id] ?? {}
              return (
                <tr key={o.id}>
                  <td className="doc__nota">{r.ok ? '☒' : '☐'}</td>
                  <td>{o.rotulo}</td>
                  <td>
                    <span className="doc__rotulo-obs">Observação:</span> {r.obs?.trim()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="doc__secao">
        <h2>{n + 2} Pendências e observações finais</h2>
        <p className="doc__pendencias">{v.pendencias?.trim() || 'Sem pendências registradas.'}</p>
      </section>

      <section className="doc__secao doc__fim">
        <h2>{n + 3} Declaração e assinaturas</h2>
        <p className="doc__declaracao">{modelo.declaracao}</p>
        <div className="doc__assinaturas">
          <div>
            <span className="doc__linha" />
            <strong>Locador / vistoriador</strong>
            <small>{v.vistoriador_nome ?? ''}</small>
          </div>
          <div>
            <span className="doc__linha" />
            <strong>{v.locatario?.trim() || 'Locatário'}</strong>
            <small>Locatário</small>
          </div>
        </div>
        <p className="doc__local">
          {v.cidade}, {dataPorExtensoDoc(v.data_vistoria)}.
        </p>
      </section>

      <footer className="doc__rodape">{rodape}</footer>
    </article>
  )
}
