import type { ThreeModule } from './types'

export function createFloorTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#e7eef4'
  ctx.fillRect(0, 0, 512, 512)

  // Subtle architectural tile seams
  ctx.strokeStyle = 'rgba(11, 18, 32, 0.08)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 510, 510)

  ctx.strokeStyle = 'rgba(11, 18, 32, 0.035)'
  ctx.lineWidth = 1
  for (let i = 128; i < 512; i += 128) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 512)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(512, i)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(44, 44)
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

  // Subtle circular socket for the 3D loupe badge
  ctx.save()
  ctx.fillStyle = 'rgba(30, 201, 168, 0.08)'
  ctx.strokeStyle = 'rgba(30, 201, 168, 0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(446, 64, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createPowerButtonTexture(THREE: ThreeModule, active = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  const accent = active ? '#f59e0b' : '#1ec9a8'

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
