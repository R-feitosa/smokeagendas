/**
 * Gera o ARQUIVO PDF da vistoria a partir da ficha desenhada (componente VistoriaDocumento
 * dentro de `.doc-fora`): cada `.doc__pagina` vira uma folha A4. As bibliotecas são
 * carregadas só quando o documento é gerado, para não pesar no resto do app.
 */
export type ArquivoVistoria = { arquivo: File; paginas: string[] }

export async function gerarArquivoPdf(ficha: HTMLElement, nome: string): Promise<ArquivoVistoria> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  await document.fonts?.ready // logo em Cinzel: espera a fonte para não sair com a fonte padrão

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const paginas: string[] = []
  const folhas = Array.from(ficha.querySelectorAll<HTMLElement>('.doc__pagina'))
  for (const [i, folha] of folhas.entries()) {
    const canvas = await html2canvas(folha, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
    const imagem = canvas.toDataURL('image/jpeg', 0.9)
    paginas.push(imagem)
    if (i > 0) pdf.addPage()
    // a folha tem 210 mm de largura; a altura segue a proporção (normalmente 297 mm)
    const altura = Math.min(297, (canvas.height / canvas.width) * 210)
    pdf.addImage(imagem, 'JPEG', 0, 0, 210, altura, undefined, 'FAST')
  }
  pdf.setProperties({ title: nome, author: 'Feitosa Participações Imobiliárias', subject: 'Checklist de vistoria de saída' })
  // nome do arquivo sem acento: com acento alguns navegadores trocam o nome por "download"
  const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const arquivo = new File([pdf.output('blob')], `${semAcento}.pdf`, { type: 'application/pdf' })
  return { arquivo, paginas }
}

/** Baixa o arquivo no aparelho */
export function baixar(arquivo: File): void {
  const url = URL.createObjectURL(arquivo)
  const a = document.createElement('a')
  a.href = url
  a.download = arquivo.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** O aparelho sabe compartilhar arquivo (WhatsApp, e-mail…)? Celulares, em geral, sim. */
export function podeEnviarArquivo(arquivo: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] })
}

/** Abre o "Compartilhar" do aparelho com o PDF. Devolve false se a pessoa cancelou. */
export async function enviar(arquivo: File, titulo: string): Promise<boolean> {
  try {
    await navigator.share({ files: [arquivo], title: titulo, text: titulo })
    return true
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return false
    throw e
  }
}
