/**
 * Compact zero-dependency 1D Barcode (Code 128B, Code 39, EAN) and 2D QR Code
 * canvas renderers for ZPL II and ESC/POS thermal label/receipt emulation.
 */

// Code 128 pattern widths (each entry is 6 digits summing to 11 modules; Stop=106 has 7 digits = 13 modules)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
]

export function encodeCode128Modules(text: string): number[] {
  const clean = text.replace(/[^\x20-\x7E]/g, '?') || '0'
  // Start Code B = 104
  const codes: number[] = [104]
  let checksum = 104

  for (let i = 0; i < clean.length; i++) {
    const val = clean.charCodeAt(i) - 32
    codes.push(val)
    checksum += val * (i + 1)
  }

  codes.push(checksum % 103)
  codes.push(106) // Stop

  const widths: number[] = []
  for (const code of codes) {
    const pat = CODE128_PATTERNS[code]
    for (let i = 0; i < pat.length; i++) {
      widths.push(pat.charCodeAt(i) - 48)
    }
  }
  return widths
}

export interface DrawBarcodeOptions {
  x: number
  y: number
  height: number
  moduleWidth?: number
  maxWidth?: number
  hriPosition?: 'none' | 'above' | 'below' | 'both'
  align?: 'left' | 'center' | 'right'
  color?: string
}

/**
 * Draws a crisp Code 128 barcode onto `ctx` and returns `{ width, totalHeight }`.
 */
export function drawBarcode1D(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: DrawBarcodeOptions,
): { width: number; totalHeight: number } {
  const widths = encodeCode128Modules(text)
  const totalModules = widths.reduce((sum, w) => sum + w, 0)
  let modW = Math.max(1, Math.round(opts.moduleWidth ?? 2))
  if (opts.maxWidth && totalModules * modW > opts.maxWidth) {
    modW = Math.max(1, Math.floor(opts.maxWidth / totalModules))
  }

  const barWidth = totalModules * modW
  let startX = opts.x
  if (opts.align === 'center') startX -= barWidth / 2
  else if (opts.align === 'right') startX -= barWidth
  else {
    const minQuietLeft = Math.round(modW * 6)
    if (startX < minQuietLeft && (!opts.maxWidth || barWidth + minQuietLeft <= opts.maxWidth + startX)) {
      startX = minQuietLeft
    }
  }

  const hri = opts.hriPosition ?? 'below'
  const fontSize = Math.max(14, Math.min(22, Math.round(modW * 8.5)))
  const textGap = 4
  const topTextOffset =
    hri === 'above' || hri === 'both' ? fontSize + textGap : 0
  const bottomTextOffset =
    hri === 'below' || hri === 'both' ? fontSize + textGap : 0

  ctx.save()
  const barColor = opts.color ?? '#000000'
  const barY = opts.y + topTextOffset
  if (barColor !== '#ffffff') {
    const quietPad = Math.max(8, Math.round(modW * 8))
    ctx.fillStyle = '#fcfcfb'
    ctx.fillRect(
      Math.max(0, Math.floor(startX - quietPad)),
      Math.max(0, Math.floor(barY - 4)),
      Math.ceil(barWidth + quietPad * 2),
      Math.ceil(opts.height + 8),
    )
  }
  ctx.fillStyle = barColor

  if (hri === 'above' || hri === 'both') {
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(text, startX + barWidth / 2, opts.y, barWidth)
  }

  let curX = startX
  for (let i = 0; i < widths.length; i++) {
    const nextX = curX + widths[i] * modW
    if (i % 2 === 0) {
      const x0 = Math.round(curX)
      const x1 = Math.max(x0 + 1, Math.round(nextX))
      ctx.fillRect(x0, Math.round(barY), x1 - x0, opts.height)
    }
    curX = nextX
  }

  if (hri === 'below' || hri === 'both') {
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(
      text,
      startX + barWidth / 2,
      barY + opts.height + textGap,
      barWidth,
    )
  }

  ctx.restore()
  return {
    width: barWidth,
    totalHeight: topTextOffset + opts.height + bottomTextOffset,
  }
}

// ── Self-Contained ISO/IEC 18004 QR Code Generator (Byte Mode, Level L, V1-V10) ──

interface QrVersionSpec {
  size: number
  totalCodewords: number
  ecCodewordsPerBlock: number
  numBlocks1: number
  dataPerBlock1: number
  numBlocks2: number
  dataPerBlock2: number
  alignCenters: number[]
}

const QR_VERSIONS_L: QrVersionSpec[] = [
  // dummy v0
  { size: 0, totalCodewords: 0, ecCodewordsPerBlock: 0, numBlocks1: 0, dataPerBlock1: 0, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [] },
  { size: 21, totalCodewords: 26, ecCodewordsPerBlock: 7, numBlocks1: 1, dataPerBlock1: 19, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [] },
  { size: 25, totalCodewords: 44, ecCodewordsPerBlock: 10, numBlocks1: 1, dataPerBlock1: 34, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 18] },
  { size: 29, totalCodewords: 70, ecCodewordsPerBlock: 15, numBlocks1: 1, dataPerBlock1: 55, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 22] },
  { size: 33, totalCodewords: 100, ecCodewordsPerBlock: 20, numBlocks1: 1, dataPerBlock1: 80, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 26] },
  { size: 37, totalCodewords: 134, ecCodewordsPerBlock: 26, numBlocks1: 1, dataPerBlock1: 108, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 30] },
  { size: 41, totalCodewords: 172, ecCodewordsPerBlock: 18, numBlocks1: 2, dataPerBlock1: 68, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 34] },
  { size: 45, totalCodewords: 196, ecCodewordsPerBlock: 20, numBlocks1: 2, dataPerBlock1: 78, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 22, 38] },
  { size: 49, totalCodewords: 242, ecCodewordsPerBlock: 24, numBlocks1: 2, dataPerBlock1: 97, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 24, 42] },
  { size: 53, totalCodewords: 292, ecCodewordsPerBlock: 30, numBlocks1: 2, dataPerBlock1: 116, numBlocks2: 0, dataPerBlock2: 0, alignCenters: [6, 26, 46] },
  { size: 57, totalCodewords: 346, ecCodewordsPerBlock: 18, numBlocks1: 2, dataPerBlock1: 68, numBlocks2: 2, dataPerBlock2: 69, alignCenters: [6, 28, 50] },
]

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
  ; (() => {
    let x = 1
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x
      GF_LOG[x] = i
      x <<= 1
      if (x & 0x100) x ^= 0x11d
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255]
    }
  })()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function reedSolomonRemainder(data: Uint8Array, degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    const root = GF_EXP[i]
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], root)
    }
    poly = next
  }

  const result = new Uint8Array(degree)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0]
    result.copyWithin(0, 1)
    result[degree - 1] = 0
    for (let j = 0; j < degree; j++) {
      result[j] ^= gfMul(poly[j + 1], factor)
    }
  }
  return result
}

export function encodeQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder()
  let utf8 = encoder.encode(text || ' ')
  // Max byte capacity at V10-L is 271 bytes; truncate gracefully if longer
  if (utf8.length > 270) {
    utf8 = utf8.slice(0, 270)
  }

  let version = 1
  for (let v = 1; v <= 10; v++) {
    const spec = QR_VERSIONS_L[v]
    const totalDataCodewords =
      spec.numBlocks1 * spec.dataPerBlock1 +
      spec.numBlocks2 * spec.dataPerBlock2
    const headerBits = v <= 9 ? 4 + 8 : 4 + 16
    if (headerBits + utf8.length * 8 <= totalDataCodewords * 8) {
      version = v
      break
    }
  }

  const spec = QR_VERSIONS_L[version]
  const totalDataCodewords =
    spec.numBlocks1 * spec.dataPerBlock1 + spec.numBlocks2 * spec.dataPerBlock2

  const bits: number[] = []
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1)
    }
  }

  // Byte mode indicator 0100
  pushBits(0b0100, 4)
  pushBits(utf8.length, version <= 9 ? 8 : 16)
  for (let i = 0; i < utf8.length; i++) {
    pushBits(utf8[i], 8)
  }

  const maxBits = totalDataCodewords * 8
  const terminator = Math.min(4, maxBits - bits.length)
  pushBits(0, terminator)
  while (bits.length % 8 !== 0) bits.push(0)

  const dataBytes = new Uint8Array(totalDataCodewords)
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j]
    dataBytes[i] = b
  }
  let padIdx = 0
  for (let i = bits.length / 8; i < totalDataCodewords; i++) {
    dataBytes[i] = padIdx % 2 === 0 ? 0xec : 0x11
    padIdx++
  }

  // Split into RS blocks & interleave
  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  let offset = 0
  for (let b = 0; b < spec.numBlocks1; b++) {
    const block = dataBytes.slice(offset, offset + spec.dataPerBlock1)
    offset += spec.dataPerBlock1
    dataBlocks.push(block)
    ecBlocks.push(reedSolomonRemainder(block, spec.ecCodewordsPerBlock))
  }
  for (let b = 0; b < spec.numBlocks2; b++) {
    const block = dataBytes.slice(offset, offset + spec.dataPerBlock2)
    offset += spec.dataPerBlock2
    dataBlocks.push(block)
    ecBlocks.push(reedSolomonRemainder(block, spec.ecCodewordsPerBlock))
  }

  const interleaved: number[] = []
  const maxBlockLen = Math.max(spec.dataPerBlock1, spec.dataPerBlock2)
  for (let i = 0; i < maxBlockLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) interleaved.push(block[i])
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
    for (const ec of ecBlocks) {
      interleaved.push(ec[i])
    }
  }

  const size = spec.size
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  )
  const isFunc: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  )

  const setFunc = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    modules[y][x] = dark
    isFunc[y][x] = true
  }

  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        setFunc(cx + dx, cy + dy, dist !== 2 && dist !== 4)
      }
    }
  }

  drawFinder(3, 3)
  drawFinder(size - 4, 3)
  drawFinder(3, size - 4)

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(i, 6, i % 2 === 0)
    setFunc(6, i, i % 2 === 0)
  }

  // Alignment patterns
  const centers = spec.alignCenters
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue
      }
      const cx = centers[i]
      const cy = centers[j]
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8][i] = true
      isFunc[i][8] = true
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunc[8][size - 1 - i] = true
    isFunc[size - 1 - i][8] = true
  }
  setFunc(8, size - 8, true)

  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    }
    const vBits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) !== 0
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunc(a, b, bit)
      setFunc(b, a, bit)
    }
  }

  // Place data bits in zigzag upward/downward 2-column strips, applying Mask 0 ((x + y) % 2 === 0)
  let bitIdx = 0
  const totalBits = interleaved.length * 8
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert
      for (let j = 0; j < 2; j++) {
        const x = right - j
        if (!isFunc[y][x]) {
          let dark = false
          if (bitIdx < totalBits) {
            dark = ((interleaved[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0
            bitIdx++
          }
          if ((x + y) % 2 === 0) dark = !dark
          modules[y][x] = dark
        }
      }
    }
    upward = !upward
  }

  // Format bits for Level L (01) + Mask 0 (000) -> data = 0b01000 -> BCH & XOR 0x5412 = 0x77c4
  const formatBits = 0x77c4
  for (let i = 0; i <= 5; i++) setFunc(8, i, ((formatBits >>> i) & 1) !== 0)
  setFunc(8, 7, ((formatBits >>> 6) & 1) !== 0)
  setFunc(8, 8, ((formatBits >>> 7) & 1) !== 0)
  setFunc(7, 8, ((formatBits >>> 8) & 1) !== 0)
  for (let i = 9; i < 15; i++) {
    setFunc(14 - i, 8, ((formatBits >>> i) & 1) !== 0)
  }
  for (let i = 0; i < 8; i++) {
    setFunc(size - 1 - i, 8, ((formatBits >>> i) & 1) !== 0)
  }
  for (let i = 8; i < 15; i++) {
    setFunc(8, size - 15 + i, ((formatBits >>> i) & 1) !== 0)
  }

  return modules
}

export function drawQrCode(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: {
    x: number
    y: number
    moduleSize?: number
    align?: 'left' | 'center' | 'right'
    color?: string
  },
): { sizePx: number } {
  const matrix = encodeQrMatrix(text)
  const count = matrix.length
  const mod = Math.max(2, Math.round(opts.moduleSize ?? 5))
  const sizePx = count * mod

  let startX = opts.x
  if (opts.align === 'center') startX -= sizePx / 2
  else if (opts.align === 'right') startX -= sizePx

  ctx.save()
  const qrColor = opts.color ?? '#000000'
  if (qrColor !== '#ffffff') {
    const quietPad = mod * 3
    ctx.fillStyle = '#fcfcfb'
    ctx.fillRect(
      Math.max(0, Math.floor(startX - quietPad)),
      Math.max(0, Math.floor(opts.y - quietPad)),
      sizePx + quietPad * 2,
      sizePx + quietPad * 2,
    )
  }
  ctx.fillStyle = qrColor
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          Math.round(startX + c * mod),
          Math.round(opts.y + r * mod),
          mod,
          mod,
        )
      }
    }
  }
  ctx.restore()
  return { sizePx }
}
