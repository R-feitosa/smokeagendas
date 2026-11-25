import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from 'react'

/**
 * Fumaça em partículas (canvas): baforadas que sobem, crescem, ondulam e somem,
 * e anéis de fumaça. Decorativa; com "reduzir movimento" no aparelho, não anima.
 */
export type FumacaHandle = {
  /** baforada extra (toque na marca, fim da gravação) */
  rajada: (qtd?: number) => void
}

type Props = {
  className?: string
  /** "claro" = fumaça branca, para fundo escuro; "escuro" = fumaça cinza-azulada, para fundo claro */
  tom?: 'claro' | 'escuro'
  /** de onde a fumaça sai: um ponto do elemento (fração da largura/altura) */
  fonte: RefObject<Element | null>
  ponto?: { x: number; y: number }
  /** baforadas por segundo e anéis por segundo (multiplicados por intensidade) */
  taxa?: number
  aneis?: number
  intensidade?: () => number
  /** deriva horizontal (px/s) e tamanho das baforadas */
  vento?: number
  escala?: number
  /** velocidade de subida (1 = normal; baixo = fumaça que se espalha na horizontal) */
  subida?: number
}

type Particula = {
  anel: boolean
  x: number
  y: number
  vx: number
  vy: number
  r: number
  dr: number
  a: number
  vida: number
  max: number
  fase: number
}

const MAX_PARTICULAS = 160
const aleat = (a: number, b: number) => a + Math.random() * (b - a)

/** textura de nuvem: vários borrões radiais sobrepostos, para não parecer um círculo liso */
function criarSprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  for (let i = 0; i < 7; i++) {
    const cx = 64 + aleat(-18, 18)
    const cy = 64 + aleat(-18, 18)
    const r = aleat(30, 50)
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r)
    grad.addColorStop(0, `rgba(${rgb},0.38)`)
    grad.addColorStop(0.55, `rgba(${rgb},0.16)`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  return c
}

export const Fumaca = forwardRef<FumacaHandle, Props>(function Fumaca(
  { className = '', tom = 'claro', fonte, ponto = { x: 0.5, y: 0 }, taxa = 4, aneis = 0.4, intensidade, vento = 0, escala = 1, subida = 1 },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const particulas = useRef<Particula[]>([])
  // as props mudam a cada render; o laço de animação lê sempre as mais recentes
  const cfg = useRef({ fonte, ponto, taxa, aneis, intensidade, vento, escala, subida })
  cfg.current = { fonte, ponto, taxa, aneis, intensidade, vento, escala, subida }
  const origem = useRef({ x: 0, y: 0 })
  const parado = useRef(false)

  /** ponto de saída em coordenadas do canvas (o elemento pode ter mudado de lugar) */
  function calcularOrigem() {
    const el = cfg.current.fonte.current
    const cv = canvas.current
    if (!el || !cv) return
    const a = el.getBoundingClientRect()
    const b = cv.getBoundingClientRect()
    origem.current = { x: a.left - b.left + a.width * cfg.current.ponto.x, y: a.top - b.top + a.height * cfg.current.ponto.y }
  }

  function soltar(anel: boolean, forte = false) {
    const { escala: e, vento: v, subida: su } = cfg.current
    if (particulas.current.length >= MAX_PARTICULAS) particulas.current.shift()
    const { x, y } = origem.current
    particulas.current.push(
      anel
        ? { anel, x, y, vx: v * 0.4 + aleat(-6, 6), vy: -aleat(38, 52) * e * su, r: 4 * e, dr: aleat(14, 20) * e, a: 0.75, vida: 0, max: aleat(2.4, 3.2), fase: aleat(0, 6.28) }
        : {
            anel,
            x: x + aleat(-3, 3) * e,
            y,
            vx: v * 0.5 + aleat(-12, 12) * (forte ? 4 : 1),
            vy: -aleat(26, 48) * e * su * (forte ? 1.8 : 1),
            r: aleat(5, 10) * e * (forte ? 1.4 : 1),
            dr: aleat(12, 24) * e * (forte ? 1.5 : 1),
            a: aleat(0.6, 0.9),
            vida: 0,
            max: aleat(2, 3.6),
            fase: aleat(0, 6.28),
          },
    )
  }

  useImperativeHandle(ref, () => ({
    rajada(qtd = 16) {
      if (parado.current) return
      calcularOrigem()
      for (let i = 0; i < qtd; i++) soltar(false, true)
      soltar(true)
      setTimeout(() => soltar(true), 260)
    },
  }))

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    // no fundo claro, cinza-azulado claro (escuro demais parece fumaça suja)
    const rgb = tom === 'claro' ? '255,255,255' : '128,140,178'
    const sprite = criarSprite(rgb)
    const corAnel = tom === 'claro' ? '255,255,255' : '112,124,165'
    parado.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    let largura = 0
    let altura = 0
    const dimensionar = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      largura = r.width
      altura = r.height
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    dimensionar()
    const obs = new ResizeObserver(dimensionar)
    obs.observe(cv)

    let raf = 0
    let antes = performance.now()
    let accBaforada = 0
    let accAnel = 0
    const quadro = (agora: number) => {
      raf = requestAnimationFrame(quadro)
      const dt = Math.min(0.05, (agora - antes) / 1000)
      antes = agora
      const t = agora / 1000
      const c = cfg.current

      calcularOrigem()

      if (!parado.current && !document.hidden) {
        const k = c.intensidade ? c.intensidade() : 1
        accBaforada += c.taxa * k * dt
        accAnel += c.aneis * Math.min(k, 2) * dt
        while (accBaforada >= 1) {
          soltar(false)
          accBaforada -= 1
        }
        while (accAnel >= 1) {
          soltar(true)
          accAnel -= 1
        }
      }

      ctx.clearRect(0, 0, largura, altura)
      const vivas: Particula[] = []
      for (const p of particulas.current) {
        p.vida += dt
        if (p.vida >= p.max) continue
        vivas.push(p)
        // sobe desacelerando, ondula e é levada pelo vento
        p.vy *= 1 - 0.28 * dt
        p.vx += (c.vento - p.vx) * 0.25 * dt
        p.x += (p.vx + Math.sin(t * 1.4 + p.fase) * 14 * c.escala) * dt
        p.y += p.vy * dt
        p.r += p.dr * dt
        const entrada = Math.min(1, p.vida * 5)
        const alfa = p.a * entrada * Math.pow(1 - p.vida / p.max, 1.5)
        if (p.anel) {
          const ry = p.r * 0.42
          ctx.strokeStyle = `rgba(${corAnel},${alfa * 0.25})`
          ctx.lineWidth = Math.max(3, p.r * 0.5)
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.r, ry, Math.sin(t + p.fase) * 0.15, 0, Math.PI * 2)
          ctx.stroke()
          ctx.strokeStyle = `rgba(${corAnel},${alfa * 0.7})`
          ctx.lineWidth = Math.max(1.5, p.r * 0.2)
          ctx.stroke()
        } else {
          ctx.globalAlpha = alfa
          ctx.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
          ctx.globalAlpha = 1
        }
      }
      particulas.current = vivas
    }
    raf = requestAnimationFrame(quadro)
    return () => {
      cancelAnimationFrame(raf)
      obs.disconnect()
    }
  }, [tom])

  return <canvas ref={canvas} className={`fumaca ${className}`} aria-hidden="true" />
})
