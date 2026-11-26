import { useEffect, useRef, useState } from 'react'
import type { VistoriaComUnidade } from '../lib/api'
import { baixar, enviar, gerarArquivoPdf, podeEnviarArquivo, type ArquivoVistoria } from '../lib/pdfVistoria'
import { dataBr } from '../lib/vistoria'
import { VistoriaDocumento, unidadeNoDocumento } from './VistoriaDocumento'

type Estado = { fase: 'gerando' } | { fase: 'pronto'; pdf: ArquivoVistoria } | { fase: 'erro' }

/**
 * Aparece SÓ com a vistoria concluída: gera o PDF (no modelo da ficha de papel) e
 * oferece baixar, enviar ao cliente pelo "Compartilhar" do aparelho ou imprimir.
 */
export function DocumentoPronto({ v }: { v: VistoriaComUnidade }) {
  const ficha = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<Estado>({ fase: 'gerando' })
  const [aviso, setAviso] = useState<string | null>(null)
  const nome = `Vistoria de saída - ${unidadeNoDocumento(v.predio_nome, v.numero, v.tipo_unidade)} - ${dataBr(v.data_vistoria).replace(/\//g, '-')}`

  useEffect(() => {
    let vivo = true
    // espera a ficha ser desenhada (fora da tela) antes de fotografar as páginas
    const t = window.setTimeout(() => {
      if (!ficha.current) return
      gerarArquivoPdf(ficha.current, nome)
        .then((pdf) => vivo && setEstado({ fase: 'pronto', pdf }))
        .catch((e) => {
          console.error('PDF da vistoria:', e)
          if (vivo) setEstado({ fase: 'erro' })
        })
    }, 60)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [v.id, nome])

  async function aoEnviar(pdf: ArquivoVistoria) {
    setAviso(null)
    try {
      const foi = await enviar(pdf.arquivo, nome)
      if (foi) setAviso('Documento enviado.')
    } catch {
      baixar(pdf.arquivo)
      setAviso('Este aparelho não abriu o compartilhamento: o PDF foi baixado para você anexar.')
    }
  }

  return (
    <div className="pronto" role="status">
      <p className="pronto__titulo">
        ✓ Vistoria concluída em {dataBr(v.data_vistoria)}
        {v.vistoriador_nome ? ` por ${v.vistoriador_nome}` : ''}
      </p>
      <p className="pronto__sub">Documento pronto, no modelo da ficha da Feitosa. Baixe ou envie para o cliente.</p>

      {estado.fase === 'gerando' && (
        <p className="pronto__gerando">
          <span className="spinner" aria-hidden="true" /> Gerando o documento…
        </p>
      )}
      {estado.fase === 'erro' && (
        <p className="erro">Não foi possível gerar o PDF neste aparelho. Use “Imprimir” e escolha “Salvar como PDF”.</p>
      )}

      {estado.fase === 'pronto' && (
        <>
          <ol className="pronto__paginas" aria-label={`${estado.pdf.paginas.length} páginas`}>
            {estado.pdf.paginas.map((src, i) => (
              <li key={i}>
                <img src={src} alt={`Página ${i + 1} do documento`} />
              </li>
            ))}
          </ol>
          <div className="pronto__acoes">
            <button type="button" className="btn" onClick={() => baixar(estado.pdf.arquivo)}>
              Baixar PDF
            </button>
            {podeEnviarArquivo(estado.pdf.arquivo) && (
              <button type="button" className="btn pronto__enviar" onClick={() => aoEnviar(estado.pdf)}>
                Enviar para o cliente
              </button>
            )}
            <button type="button" className="btn btn--sec" onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
          <small className="pronto__arquivo">
            {estado.pdf.arquivo.name} · {estado.pdf.paginas.length} páginas · {Math.round(estado.pdf.arquivo.size / 1024)} KB
          </small>
          {aviso && <p className="ok">{aviso}</p>}
        </>
      )}

      <div ref={ficha} className="doc-fora" aria-hidden="true">
        <VistoriaDocumento v={v} />
      </div>
    </div>
  )
}
