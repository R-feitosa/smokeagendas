// Relatório da OS em PDF, gerado no próprio aparelho (nada sai para terceiros).
// Carregado sob demanda (import dinâmico) para não pesar a abertura do app.
import { jsPDF } from 'jspdf'
import { descreverHistorico, ROTULO_PRIORIDADE, ROTULO_STATUS, ROTULO_TIPO, urlAssinada } from './os'
import type { FotoOS, HistoricoOS, OrdemServico } from './types'

type Img = { dataUrl: string; w: number; h: number }

/** Baixa a foto (URL assinada) e reduz para caber no PDF sem pesar (lado maior 900px, JPEG). */
async function carregarImagem(url: string | undefined | null, max = 900, formato: 'jpeg' | 'png' = 'jpeg'): Promise<Img | null> {
  if (!url) return null
  try {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    const ctx = c.getContext('2d')!
    if (formato === 'jpeg') {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
    }
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    return { dataUrl: c.toDataURL(formato === 'jpeg' ? 'image/jpeg' : 'image/png', 0.8), w: c.width, h: c.height }
  } catch {
    return null
  }
}

const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const RESPOSTA = { ok: 'OK', nao_ok: 'NÃO OK', na: 'N/A' } as const

export async function gerarPdfOS(
  os: OrdemServico,
  fotos: FotoOS[],
  historico: HistoricoOS[],
  extras: { equipe?: string | null; tecnico?: string | null } = {},
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 15, R = 195, W = R - L, TOPO = 15, BASE = 282
  let y = TOPO

  const novaPagina = () => {
    doc.addPage()
    y = TOPO
  }
  const garantir = (h: number) => {
    if (y + h > BASE) novaPagina()
  }
  const titulo = (t: string) => {
    garantir(12)
    y += 3
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(79, 70, 229)
    doc.text(t.toUpperCase(), L, y)
    doc.setDrawColor(229, 231, 235).line(L, y + 1.5, R, y + 1.5)
    y += 7
    doc.setTextColor(17, 24, 39)
  }
  const texto = (t: string, tam = 9.5, estilo: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', estilo).setFontSize(tam)
    for (const linha of doc.splitTextToSize(t, W) as string[]) {
      garantir(5)
      doc.text(linha, L, y)
      y += tam * 0.45
    }
    y += 1
  }
  // pares rótulo: valor em 2 colunas
  const campos = (pares: [string, string | null | undefined][]) => {
    const col = W / 2
    const visiveis = pares.filter(([, v]) => v)
    for (let i = 0; i < visiveis.length; i += 2) {
      garantir(10)
      for (let j = 0; j < 2 && i + j < visiveis.length; j++) {
        const [r, v] = visiveis[i + j]
        const x = L + j * col
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(107, 114, 128).text(r, x, y)
        doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(17, 24, 39)
        doc.text((doc.splitTextToSize(String(v), col - 4) as string[])[0], x, y + 4.2)
      }
      y += 10
    }
  }
  const bloco = (rotulo: string, valor: string | null | undefined) => {
    if (!valor) return
    garantir(10)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(107, 114, 128).text(rotulo, L, y)
    y += 4
    doc.setTextColor(17, 24, 39)
    texto(valor)
  }

  // ---------- Cabeçalho ----------
  doc.setFillColor(79, 70, 229).rect(0, 0, 210, 26, 'F')
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(16)
  doc.text(`Ordem de Serviço ${os.numero}`, L, 12)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(`${os.cliente}${os.unidade ? ` · ${os.unidade}` : ''}`, L, 19)
  doc.setFont('helvetica', 'bold').text(ROTULO_STATUS[os.status].toUpperCase(), R, 12, { align: 'right' })
  y = 34
  doc.setTextColor(17, 24, 39)

  titulo('Chamado')
  campos([
    ['Tipo', ROTULO_TIPO[os.tipo]],
    ['Prioridade', ROTULO_PRIORIDADE[os.prioridade]],
    ['Aberta em', dt(os.aberta_em)],
    ['Prazo', os.prazo ? dt(os.prazo) : null],
    ['Iniciada em', os.iniciada_em ? dt(os.iniciada_em) : null],
    ['Concluída em', os.concluida_em ? dt(os.concluida_em) : null],
    ['Solicitante', os.solicitante],
    ['Contato', os.contato],
    ['Equipe', extras.equipe],
    ['Técnico', extras.tecnico ?? os.tecnico],
  ])

  titulo('Equipamento')
  campos([
    ['Equipamento', os.equipamento],
    ['Categoria', os.categoria],
    ['Marca', os.marca],
    ['Modelo', os.modelo],
    ['Nº de série', os.numero_serie],
    ['Patrimônio', os.patrimonio],
  ])

  titulo('Serviço')
  bloco('Problema relatado', os.problema)
  bloco('Diagnóstico', os.diagnostico)
  bloco('Serviço executado', os.servico_executado)
  bloco('Peças utilizadas', os.pecas)
  if (os.valor != null) bloco('Valor', os.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
  bloco('Observações', os.observacoes)
  if (os.status === 'cancelada') bloco('Motivo do cancelamento', os.motivo_cancelamento)

  // ---------- Checklist ----------
  if (os.checklist?.length) {
    titulo('Checklist')
    doc.setFontSize(9)
    for (const it of os.checklist) {
      const obs = it.obs ? ` — ${it.obs}` : ''
      const linhas = doc.splitTextToSize(`${it.item}${obs}`, W - 28) as string[]
      garantir(linhas.length * 4.3 + 1.5)
      const r = it.resposta ? RESPOSTA[it.resposta] : 'PENDENTE'
      const cor: [number, number, number] =
        it.resposta === 'ok' ? [4, 120, 87] : it.resposta === 'nao_ok' ? [185, 28, 28] : [107, 114, 128]
      doc.setFont('helvetica', 'bold').setTextColor(...cor).text(r, L, y)
      doc.setFont('helvetica', 'normal').setTextColor(17, 24, 39).text(linhas, L + 24, y)
      y += linhas.length * 4.3 + 1.5
    }
  }

  // ---------- Fotos: antes × depois lado a lado ----------
  const carregar = (lista: FotoOS[]) => Promise.all(lista.map((f) => carregarImagem(f.url)))
  const antes = fotos.filter((f) => f.momento === 'antes')
  const depois = fotos.filter((f) => f.momento === 'depois')
  const durante = fotos.filter((f) => f.momento === 'durante')
  const [imgAntes, imgDepois, imgDurante] = await Promise.all([carregar(antes), carregar(depois), carregar(durante)])

  const COL = (W - 6) / 2
  const desenhar = (img: Img | null, f: FotoOS | undefined, x: number, alturaMax: number): number => {
    if (!f) return 0
    if (!img) {
      doc.setFontSize(8).setTextColor(107, 114, 128).text('(foto indisponível)', x, y + 4)
      return 8
    }
    const k = Math.min(COL / img.w, alturaMax / img.h)
    const w = img.w * k, h = img.h * k
    doc.addImage(img.dataUrl, 'JPEG', x, y, w, h)
    doc.setFontSize(7.5).setTextColor(107, 114, 128)
    const leg = `${dt(f.criado_em)}${f.legenda ? ` · ${f.legenda}` : ''}`
    doc.text((doc.splitTextToSize(leg, COL) as string[]).slice(0, 2), x, y + h + 3.5)
    return h + 8
  }

  if (antes.length || depois.length) {
    titulo('Fotos — antes × depois')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(17, 24, 39)
    doc.text('ANTES', L, y)
    doc.text('DEPOIS', L + COL + 6, y)
    y += 3
    const linhas = Math.max(antes.length, depois.length)
    for (let i = 0; i < linhas; i++) {
      garantir(imgAntes[i] || imgDepois[i] ? 78 : 10)
      const h1 = desenhar(imgAntes[i], antes[i], L, 70)
      const h2 = desenhar(imgDepois[i], depois[i], L + COL + 6, 70)
      y += Math.max(h1, h2) + 2
    }
  }

  if (durante.length) {
    titulo('Fotos — durante o serviço')
    for (let i = 0; i < durante.length; i += 2) {
      garantir(imgDurante[i] || imgDurante[i + 1] ? 78 : 10)
      const h1 = desenhar(imgDurante[i], durante[i], L, 70)
      const h2 = desenhar(imgDurante[i + 1], durante[i + 1], L + COL + 6, 70)
      y += Math.max(h1, h2) + 2
    }
  }

  // ---------- Assinatura ----------
  titulo('Assinatura do cliente')
  if (os.assinatura_caminho) {
    const ass = await carregarImagem(await urlAssinada(os.assinatura_caminho), 600, 'png')
    garantir(40)
    if (ass) {
      const k = Math.min(80 / ass.w, 28 / ass.h)
      doc.addImage(ass.dataUrl, 'PNG', L, y, ass.w * k, ass.h * k)
      y += ass.h * k + 2
    }
    doc.setDrawColor(156, 163, 175).line(L, y, L + 90, y)
    y += 4.5
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(17, 24, 39).text(os.assinatura_nome ?? '', L, y)
    y += 4.5
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(107, 114, 128).text(`Assinado em ${dt(os.assinado_em)}`, L, y)
    y += 6
  } else {
    texto('Não colhida.')
  }

  // ---------- Histórico ----------
  if (historico.length) {
    titulo('Histórico')
    doc.setFontSize(8)
    for (const h of historico) {
      const linha = `${dt(h.quando)}  ${descreverHistorico(h)}${h.autor_nome ? ` (${h.autor_nome})` : ''}`
      for (const l of doc.splitTextToSize(linha, W) as string[]) {
        garantir(4)
        doc.setFont('helvetica', 'normal').setTextColor(55, 65, 81).text(l, L, y)
        y += 3.8
      }
    }
  }

  // ---------- Rodapé ----------
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(156, 163, 175)
    doc.text(`${os.numero} · gerado em ${dt(new Date().toISOString())}`, L, 290)
    doc.text(`Página ${p} de ${total}`, R, 290, { align: 'right' })
  }

  return doc.output('blob')
}

/** Compartilha (WhatsApp/e-mail no celular) ou baixa o PDF. */
export async function entregarPdf(blob: Blob, nomeArquivo: string): Promise<void> {
  const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nomeArquivo })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
