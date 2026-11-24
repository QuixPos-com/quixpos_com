import type { ThreeModule } from './types'

export function createFloorTexture(THREE: ThreeModule) {
  const size = 512
  const tileSize = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Deterministic LCG so carpet fibers render identically every load
  let seed = 0x51a7c3
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  const tiles: Array<{ col: number; row: number; base: string; horizontal: boolean }> = [
    { col: 0, row: 0, base: '#4b705f', horizontal: true },
    { col: 1, row: 0, base: '#47657d', horizontal: false },
    { col: 0, row: 1, base: '#735c4f', horizontal: false },
    { col: 1, row: 1, base: '#507872', horizontal: true },
  ]

  for (const tile of tiles) {
    const x0 = tile.col * tileSize
    const y0 = tile.row * tileSize

    ctx.fillStyle = tile.base
    ctx.fillRect(x0, y0, tileSize, tileSize)

    // Quarter-turn woven carpet loop-pile ribs
    for (let i = 0; i < tileSize; i += 4) {
      const isHighlight = (i / 4) % 2 === 0
      ctx.fillStyle = isHighlight
        ? 'rgba(255, 255, 255, 0.055)'
        : 'rgba(12, 18, 24, 0.14)'
      if (tile.horizontal) {
        ctx.fillRect(x0, y0 + i, tileSize, 2)
      } else {
        ctx.fillRect(x0 + i, y0, 2, tileSize)
      }
    }

    // Cross-weave micro threads
    ctx.fillStyle = 'rgba(12, 18, 24, 0.08)'
    for (let i = 2; i < tileSize; i += 6) {
      if (tile.horizontal) {
        ctx.fillRect(x0 + i, y0, 1, tileSize)
      } else {
        ctx.fillRect(x0, y0 + i, tileSize, 1)
      }
    }

    // Subtle carpet pile fiber flecks
    for (let n = 0; n < 1400; n++) {
      const fx = x0 + Math.floor(nextRand() * tileSize)
      const fy = y0 + Math.floor(nextRand() * tileSize)
      ctx.fillStyle =
        nextRand() > 0.5
          ? 'rgba(255, 255, 255, 0.06)'
          : 'rgba(10, 16, 22, 0.13)'
      ctx.fillRect(fx, fy, 2, 2)
    }

    // Soft carpet-tile seam around each checkered square
    ctx.strokeStyle = 'rgba(10, 16, 22, 0.22)'
    ctx.lineWidth = 2
    ctx.strokeRect(x0 + 1, y0 + 1, tileSize - 2, tileSize - 2)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(44, 44)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createWoodTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#c89f72'
  ctx.fillRect(0, 0, 512, 512)

  for (let y = 0; y < 512; y += 4) {
    const shade = Math.sin(y * 0.09) * 10 + Math.cos(y * 0.27) * 6
    ctx.fillStyle = shade > 0 ? 'rgba(255, 240, 220, 0.06)' : 'rgba(92, 56, 28, 0.07)'
    ctx.fillRect(0, y, 512, 3)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createNameplateTexture(
  THREE: ThreeModule,
  title: string,
  subtitle: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, 512, 128)

  ctx.strokeStyle = '#1ec9a8'
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, 504, 120)

  ctx.fillStyle = '#f7fafc'
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, 208, 46, 376)

  ctx.fillStyle = '#1ec9a8'
  ctx.font = '500 20px system-ui, -apple-system, sans-serif'
  ctx.fillText(subtitle, 208, 88, 376)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createPowerButtonTexture(
  THREE: ThreeModule,
  mode: 'on' | 'active' | 'off' = 'on',
) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  const accent =
    mode === 'active' ? '#f59e0b' : mode === 'off' ? '#64748b' : '#1ec9a8'

  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, 128, 128)

  // Outer illuminated ring
  ctx.strokeStyle = accent
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(64, 64, 54, 0, Math.PI * 2)
  ctx.stroke()

  // IEC 5009 power symbol arc (gap at top)
  ctx.lineCap = 'round'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(64, 68, 26, -Math.PI * 0.28, Math.PI * 1.28, false)
  ctx.stroke()

  // Top vertical power bar
  ctx.beginPath()
  ctx.moveTo(64, 30)
  ctx.lineTo(64, 62)
  ctx.stroke()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createFullscreenButtonTexture(
  THREE: ThreeModule,
  active = false,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  const accent = active ? '#f59e0b' : '#1ec9a8'

  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, 128, 128)

  // Outer illuminated ring matching the power button
  ctx.strokeStyle = accent
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(64, 64, 54, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = accent
  ctx.lineWidth = 7.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (!active) {
    // Expand / fullscreen 4 corner brackets
    const o = 38
    const b = 54
    ctx.beginPath()
    ctx.moveTo(o, b)
    ctx.lineTo(o, o)
    ctx.lineTo(b, o)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(128 - b, o)
    ctx.lineTo(128 - o, o)
    ctx.lineTo(128 - o, b)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(o, 128 - b)
    ctx.lineTo(o, 128 - o)
    ctx.lineTo(b, 128 - o)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(128 - b, 128 - o)
    ctx.lineTo(128 - o, 128 - o)
    ctx.lineTo(128 - o, 128 - b)
    ctx.stroke()
  } else {
    // Collapse / exit fullscreen 4 inward corner brackets
    const inner = 54
    const outer = 38
    ctx.beginPath()
    ctx.moveTo(outer, inner)
    ctx.lineTo(inner, inner)
    ctx.lineTo(inner, outer)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(128 - outer, inner)
    ctx.lineTo(128 - inner, inner)
    ctx.lineTo(128 - inner, outer)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(outer, 128 - inner)
    ctx.lineTo(inner, 128 - inner)
    ctx.lineTo(inner, 128 - outer)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(128 - outer, 128 - inner)
    ctx.lineTo(128 - inner, 128 - inner)
    ctx.lineTo(128 - inner, 128 - outer)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createLoginFirstOsdTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 144
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, 512, 144)

  // Dark OSD pill card with warm amber border
  ctx.fillStyle = 'rgba(11, 18, 32, 0.96)'
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.roundRect(8, 8, 496, 128, 22)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#fef3c7'
  ctx.font = 'bold 50px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('<- Login first', 256, 74)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createCashButtonTexture(
  THREE: ThreeModule,
  label: string,
  accent: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 112
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, 256, 112)

  ctx.strokeStyle = accent
  ctx.lineWidth = 6
  ctx.strokeRect(5, 5, 246, 102)

  ctx.fillStyle = accent
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 128, 56)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createPrinterFrontTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#181d26'
  ctx.fillRect(0, 0, 256, 128)

  ctx.fillStyle = '#9ca3af'
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('EPSON', 128, 44)

  ctx.fillStyle = '#e5e7eb'
  ctx.font = '600 22px system-ui, -apple-system, sans-serif'
  ctx.fillText('TM-m30III', 128, 84)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createReceiptTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f9fafb'
  ctx.fillRect(0, 0, 256, 256)

  ctx.fillStyle = '#111827'
  ctx.font = 'bold 22px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('QuixPOS Beleg', 128, 34)

  ctx.font = '16px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('Espresso       2,80 EUR', 18, 76)
  ctx.fillText('Croissant      3,20 EUR', 18, 104)
  ctx.fillText('Orangensaft    3,50 EUR', 18, 132)
  ctx.fillText('-----------------------', 18, 158)
  ctx.font = 'bold 18px monospace'
  ctx.fillText('SUMME          9,50 EUR', 18, 186)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#4b5563'
  ctx.fillText('TSE Signatur: OK', 18, 222)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createZebraBadgeTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#2b313a'
  ctx.fillRect(0, 0, 512, 256)

  ctx.strokeStyle = '#3f4754'
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, 504, 248)

  // Left white circular power button
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(82, 86, 30, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(82, 88, 12, -Math.PI * 0.28, Math.PI * 1.28)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(82, 72)
  ctx.lineTo(82, 86)
  ctx.stroke()

  // NFC icon below power button
  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = 3
  ctx.strokeRect(86, 166, 20, 30)
  ctx.beginPath()
  ctx.arc(76, 180, 10, -0.9, 0.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(76, 180, 17, -0.9, 0.9)
  ctx.stroke()

  // 5 status indicator icons across top row
  const statusColors = ['#10b981', '#6b7280', '#6b7280', '#6b7280', '#10b981']
  for (let i = 0; i < 5; i++) {
    const sx = 188 + i * 58
    ctx.fillStyle = statusColors[i]
    ctx.fillRect(sx - 10, 42, 20, 20)
  }

  // 3 white pill buttons (Pause, Feed, Cancel)
  const pillLabels = ['||', '•>', 'X']
  for (let i = 0; i < 3; i++) {
    const px = 176 + i * 94
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.roundRect(px, 98, 76, 44, 22)
    ctx.fill()

    ctx.fillStyle = '#111827'
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(pillLabels[i], px + 38, 121)
  }

  // ZEBRA ZD420 branding
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('ZEBRA', 238, 194)

  ctx.fillStyle = '#d1d5db'
  ctx.font = '600 22px system-ui, -apple-system, sans-serif'
  ctx.fillText('ZD420', 362, 192)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createShippingLabelTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)

  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 4
  ctx.strokeRect(10, 10, 236, 236)

  ctx.fillStyle = '#111827'
  ctx.fillRect(10, 10, 236, 42)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('PAKETVERSAND', 20, 38)

  ctx.fillStyle = '#111827'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('Von: QuixPOS GmbH', 20, 78)
  ctx.font = '15px monospace'
  ctx.fillText('An:  Musterkunde', 20, 104)
  ctx.fillText('     10115 Berlin', 20, 126)

  // Shipping barcode stripes
  const widths = [4, 2, 6, 3, 2, 5, 4, 2, 6, 2, 4, 5, 3, 2, 6, 4, 3, 5, 2, 4, 6, 2, 3, 5]
  let bx = 24
  for (let i = 0; i < widths.length && bx < 228; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(bx, 152, widths[i], 68)
    }
    bx += widths[i] + 3
  }

  ctx.font = '13px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('0034 0434 1610 9281 42', 128, 236)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export type EuroNoteDenom = 5 | 10 | 20 | 50 | 100

const EURO_NOTE_STYLES: Record<
  EuroNoteDenom,
  { bg: string; band: string; accent: string; ink: string }
> = {
  5: { bg: '#cfd6de', band: '#b4beca', accent: '#475569', ink: '#1e293b' },
  10: { bg: '#eab4ae', band: '#df948c', accent: '#b91c1c', ink: '#7f1d1d' },
  20: { bg: '#a8cdf6', band: '#83b8f2', accent: '#1d4ed8', ink: '#1e3a8a' },
  50: { bg: '#f4c089', band: '#eca55d', accent: '#c2410c', ink: '#7c2d12' },
  100: { bg: '#9fdba9', band: '#7ac888', accent: '#15803d', ink: '#14532d' },
}

export function createEuroNoteTexture(
  THREE: ThreeModule,
  denom: EuroNoteDenom,
) {
  const style = EURO_NOTE_STYLES[denom]
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Paper base
  ctx.fillStyle = style.bg
  ctx.fillRect(0, 0, 256, 512)

  // Subtle decorative color band across middle
  ctx.fillStyle = style.band
  ctx.fillRect(16, 130, 224, 252)

  // Crisp outer banknote border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.lineWidth = 10
  ctx.strokeRect(5, 5, 246, 502)

  ctx.strokeStyle = style.accent
  ctx.lineWidth = 3
  ctx.strokeRect(14, 14, 228, 484)

  // Holographic foil strip along right edge
  const foilGrad = ctx.createLinearGradient(204, 0, 232, 512)
  foilGrad.addColorStop(0, 'rgba(241, 245, 249, 0.78)')
  foilGrad.addColorStop(0.5, 'rgba(203, 213, 225, 0.92)')
  foilGrad.addColorStop(1, 'rgba(248, 250, 252, 0.72)')
  ctx.fillStyle = foilGrad
  ctx.fillRect(204, 18, 26, 476)

  // EU flag badge top-left
  ctx.fillStyle = '#1d4ed8'
  ctx.fillRect(26, 28, 54, 34)
  ctx.fillStyle = '#facc15'
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(53 + Math.cos(a) * 11, 45 + Math.sin(a) * 11, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }

  // Subtle architectural arch motif in center
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(114, 276, 58, Math.PI, 0)
  ctx.lineTo(172, 344)
  ctx.moveTo(56, 276)
  ctx.lineTo(56, 344)
  ctx.stroke()

  // Denomination numerals (top & bottom)
  ctx.fillStyle = style.ink
  ctx.font = '800 54px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(String(denom), 26, 74)

  ctx.font = '800 66px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${denom}€`, 114, 260)

  ctx.font = '700 22px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = style.accent
  ctx.fillText('EURO', 114, 314)

  ctx.fillStyle = style.ink
  ctx.font = '800 44px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(String(denom), 26, 484)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export type EuroCoinVisualStyle =
  | 'bimetallic-2'
  | 'bimetallic-1'
  | 'gold'
  | 'copper'

export function createEuroCoinTexture(
  THREE: ThreeModule,
  label: string,
  subLabel: 'EURO' | 'CENT',
  style: EuroCoinVisualStyle,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  const outerColor =
    style === 'bimetallic-2'
      ? '#d5dbe3'
      : style === 'bimetallic-1' || style === 'gold'
        ? '#dfb549'
        : '#c9794c'
  const innerColor =
    style === 'bimetallic-2'
      ? '#dfb549'
      : style === 'bimetallic-1'
        ? '#d5dbe3'
        : style === 'gold'
          ? '#e6c45f'
          : '#d3875b'
  const inkColor =
    style === 'copper' ? '#5c2d16' : '#334155'

  ctx.fillStyle = outerColor
  ctx.fillRect(0, 0, 128, 128)

  // Raised outer rim highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(64, 64, 59, 0, Math.PI * 2)
  ctx.stroke()

  // Inner core disc (bimetallic ring on €1 and €2, subtle embossed circle on cent coins)
  ctx.fillStyle = innerColor
  ctx.beginPath()
  ctx.arc(64, 64, 41, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.24)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(64, 64, 41, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = inkColor
  ctx.font =
    label.length > 1
      ? '800 38px system-ui, -apple-system, sans-serif'
      : '800 46px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 64, 57)

  ctx.font = '700 13px system-ui, -apple-system, sans-serif'
  ctx.fillText(subLabel, 64, 86)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function createShelfLedWashTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, 128, 128)

  // Soft vertical warm-white LED falloff along the wall beneath each shelf
  const vGrad = ctx.createLinearGradient(0, 0, 0, 128)
  vGrad.addColorStop(0.0, 'rgba(255, 226, 176, 0.95)')
  vGrad.addColorStop(0.18, 'rgba(255, 222, 168, 0.55)')
  vGrad.addColorStop(0.55, 'rgba(255, 218, 160, 0.16)')
  vGrad.addColorStop(1.0, 'rgba(255, 214, 152, 0.0)')
  ctx.fillStyle = vGrad
  ctx.fillRect(0, 0, 128, 128)

  // Gentle horizontal feathering at bay posts
  ctx.globalCompositeOperation = 'destination-in'
  const hGrad = ctx.createLinearGradient(0, 0, 128, 0)
  hGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.15)')
  hGrad.addColorStop(0.14, 'rgba(0, 0, 0, 1.0)')
  hGrad.addColorStop(0.86, 'rgba(0, 0, 0, 1.0)')
  hGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.15)')
  ctx.fillStyle = hGrad
  ctx.fillRect(0, 0, 128, 128)
  ctx.globalCompositeOperation = 'source-over'

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
