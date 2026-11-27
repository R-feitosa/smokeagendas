/**
 * Reduz a foto antes de enviar (câmera de celular gera 3–8 MB).
 * Lado maior até `max` px, JPEG qualidade 0.82 → tipicamente 250–600 KB.
 * Se o navegador não conseguir decodificar (ex.: HEIC fora do Safari), envia o original.
 */
export type ImagemPronta = { blob: Blob; largura: number | null; altura: number | null; ext: string }

export async function prepararImagem(arquivo: File, max = 1600): Promise<ImagemPronta> {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * escala)
    const h = Math.round(bmp.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sem canvas')
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82))
    if (!blob) throw new Error('falha ao gerar JPEG')
    return { blob, largura: w, altura: h, ext: 'jpg' }
  } catch {
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase()
    return { blob: arquivo, largura: null, altura: null, ext }
  }
}
