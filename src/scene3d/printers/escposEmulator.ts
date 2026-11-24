import { drawBarcode1D, drawQrCode } from './barcodes'

export interface EscPosRenderResult {
  canvas: HTMLCanvasElement
  widthDots: number
  heightDots: number
  kickDrawer: boolean
}

const PAPER_WIDTH_DOTS = 576 // Standard 80mm thermal paper @ 203 dpi (576 dots, 48 cols Font A)
const MARGIN_X = 20
const PRINTABLE_WIDTH = PAPER_WIDTH_DOTS - MARGIN_X * 2

const CP858_MAP: Record<number, string> = {
  0x80: 'Ç', 0x81: 'ü', 0x82: 'é', 0x83: 'â', 0x84: 'ä', 0x85: 'à', 0x86: 'å', 0x87: 'ç',
  0x88: 'ê', 0x89: 'ë', 0x8a: 'è', 0x8b: 'ï', 0x8c: 'î', 0x8d: 'ì', 0x8e: 'Ä', 0x8f: 'Å',
  0x90: 'É', 0x91: 'æ', 0x92: 'Æ', 0x93: 'ô', 0x94: 'ö', 0x95: 'ò', 0x96: 'û', 0x97: 'ù',
  0x98: 'ÿ', 0x99: 'Ö', 0x9a: 'Ü', 0x9b: 'ø', 0x9c: '£', 0x9d: 'Ø', 0x9e: '×', 0x9f: 'ƒ',
  0xa0: 'á', 0xa1: 'í', 0xa2: 'ó', 0xa3: 'ú', 0xa4: 'ñ', 0xa5: 'Ñ', 0xb5: 'Á', 0xb6: 'Â',
  0xb7: 'À', 0xc4: '─', 0xcd: '═', 0xd5: '€', 0xe0: 'Ó', 0xe1: 'ß', 0xe9: 'Ú', 0xf8: '°',
}

export function normalizeEscPosBytes(
  input: {
    escpos?: unknown
    base64?: unknown
    bytes?: unknown
    raw?: unknown
    data?: unknown
    encoding?: unknown
  },
): Uint8Array {
  if (input.bytes instanceof Uint8Array) {
    return input.bytes
  }
  if (Array.isArray(input.bytes)) {
    return new Uint8Array(input.bytes.map((n) => Number(n) & 0xff))
  }
  if (Array.isArray(input.data)) {
    return new Uint8Array(input.data.map((n) => Number(n) & 0xff))
  }

  const b64 =
    typeof input.base64 === 'string'
      ? input.base64
      : input.encoding === 'base64' && typeof input.escpos === 'string'
        ? input.escpos
        : input.encoding === 'base64' && typeof input.raw === 'string'
          ? input.raw
          : input.encoding === 'base64' && typeof input.data === 'string'
            ? input.data
            : null

  if (b64 !== null) {
    try {
      const bin = atob(b64.replace(/\s+/g, ''))
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff
      return out
    } catch {
      // Fall through to string handling
    }
  }

  const str =
    typeof input.escpos === 'string'
      ? input.escpos
      : typeof input.raw === 'string'
        ? input.raw
        : typeof input.data === 'string'
          ? input.data
          : ''

  if (input.encoding === 'latin1') {
    const out = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff
    return out
  }

  // Encode JS string preserving raw single-byte ESC/POS parameters if all codepoints <= 0xFF
  // while supporting full UTF-8 strings containing characters > 0xFF (e.g. '€')
  let hasHighUnicode = false
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0xff) {
      hasHighUnicode = true
      break
    }
  }
  if (!hasHighUnicode) {
    // Check if string looks like raw byte-string or UTF-8
    const raw = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) raw[i] = str.charCodeAt(i) & 0xff
    return raw
  }

  return new TextEncoder().encode(str)
}

function decodeTextChunk(bytes: number[]): string {
  if (bytes.length === 0) return ''
  const u8 = new Uint8Array(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8)
  } catch {
    let out = ''
    for (const b of bytes) {
      if (b in CP858_MAP) out += CP858_MAP[b]
      else out += String.fromCharCode(b)
    }
    return out
  }
}

interface TextSpan {
  text: string
  fontB: boolean
  bold: boolean
  underline: number
  reverse: boolean
  scaleW: number
  scaleH: number
}

type PrintOp =
  | {
      kind: 'line'
      align: 'left' | 'center' | 'right'
      spans: TextSpan[]
      extraFeedDots: number
    }
  | {
      kind: 'feed'
      dots: number
    }
  | {
      kind: 'barcode'
      align: 'left' | 'center' | 'right'
      data: string
      height: number
      moduleWidth: number
      hri: 'none' | 'above' | 'below' | 'both'
    }
  | {
      kind: 'qr'
      align: 'left' | 'center' | 'right'
      data: string
      moduleSize: number
    }
  | {
      kind: 'raster'
      align: 'left' | 'center' | 'right'
      widthBytes: number
      heightDots: number
      scaleX: number
      scaleY: number
      bitmap: Uint8Array
    }
  | {
      kind: 'cut'
    }

/**
 * Emulates Epson TM-m30III ESC/POS byte stream onto an 80mm thermal receipt canvas.
 */
export function renderEscPosToCanvas(bytes: Uint8Array): EscPosRenderResult {
  const ops: PrintOp[] = []
  let kickDrawer = false

  // Formatting state
  let align: 'left' | 'center' | 'right' = 'left'
  let fontB = false
  let bold = false
  let underline = 0
  let reverse = false
  let scaleW = 1
  let scaleH = 1
  let lineSpacingDots = 32
  let tabStops = [8, 16, 24, 32, 40, 48]

  let barcodeHeight = 76
  let barcodeModuleWidth = 3
  let barcodeHri: 'none' | 'above' | 'below' | 'both' = 'below'

  let qrModuleSize = 5
  let qrStoredData = ''

  let pendingBytes: number[] = []
  let currentLineSpans: TextSpan[] = []
  let currentCol = 0

  const resetFormatting = () => {
    align = 'left'
    fontB = false
    bold = false
    underline = 0
    reverse = false
    scaleW = 1
    scaleH = 1
    lineSpacingDots = 32
    tabStops = [8, 16, 24, 32, 40, 48]
  }

  const flushTextBytesToSpan = () => {
    if (pendingBytes.length === 0) return
    const text = decodeTextChunk(pendingBytes)
    pendingBytes = []
    if (!text) return
    currentCol += text.length * scaleW
    currentLineSpans.push({
      text,
      fontB,
      bold,
      underline,
      reverse,
      scaleW,
      scaleH,
    })
  }

  const flushLine = (extraFeedDots = 0) => {
    flushTextBytesToSpan()
    ops.push({
      kind: 'line',
      align,
      spans: currentLineSpans,
      extraFeedDots,
    })
    currentLineSpans = []
    currentCol = 0
  }

  let i = 0
  const len = bytes.length

  while (i < len) {
    const b = bytes[i]

    if (b === 0x0a) {
      // LF
      flushLine(0)
      i++
      continue
    }

    if (b === 0x0d) {
      // CR (ignore if followed by LF)
      i++
      if (i < len && bytes[i] === 0x0a) continue
      flushLine(0)
      continue
    }

    if (b === 0x09) {
      // HT horizontal tab
      flushTextBytesToSpan()
      const nextStop = tabStops.find((s) => s > currentCol) ?? currentCol + 4
      const spaces = Math.max(1, Math.round((nextStop - currentCol) / scaleW))
      for (let s = 0; s < spaces; s++) pendingBytes.push(0x20)
      flushTextBytesToSpan()
      i++
      continue
    }

    if (b === 0x1b) {
      // ESC sequence
      flushTextBytesToSpan()
      const cmd = bytes[i + 1]
      if (cmd === undefined) break

      if (cmd === 0x40) {
        // ESC @ Initialize
        resetFormatting()
        i += 2
        continue
      }
      if (cmd === 0x61 && i + 2 < len) {
        // ESC a n — Select justification
        const n = bytes[i + 2]
        if (n === 1 || n === 49) align = 'center'
        else if (n === 2 || n === 50) align = 'right'
        else align = 'left'
        i += 3
        continue
      }
      if (cmd === 0x21 && i + 2 < len) {
        // ESC ! n — Master print mode
        const n = bytes[i + 2]
        fontB = (n & 0x01) !== 0
        bold = (n & 0x08) !== 0
        scaleH = (n & 0x10) !== 0 ? 2 : 1
        scaleW = (n & 0x20) !== 0 ? 2 : 1
        underline = (n & 0x80) !== 0 ? 1 : 0
        i += 3
        continue
      }
      if (cmd === 0x45 && i + 2 < len) {
        // ESC E n — Emphasized/Bold
        bold = (bytes[i + 2] & 1) !== 0
        i += 3
        continue
      }
      if (cmd === 0x47 && i + 2 < len) {
        // ESC G n — Double-strike (treat as bold)
        bold = (bytes[i + 2] & 1) !== 0
        i += 3
        continue
      }
      if (cmd === 0x2d && i + 2 < len) {
        // ESC - n — Underline
        const n = bytes[i + 2]
        underline = n === 49 || n === 1 ? 1 : n === 50 || n === 2 ? 2 : 0
        i += 3
        continue
      }
      if (cmd === 0x4d && i + 2 < len) {
        // ESC M n — Select character font
        const n = bytes[i + 2]
        fontB = n === 1 || n === 49
        i += 3
        continue
      }
      if (cmd === 0x32) {
        // ESC 2 — Default line spacing
        lineSpacingDots = 32
        i += 2
        continue
      }
      if (cmd === 0x33 && i + 2 < len) {
        // ESC 3 n — Set line spacing
        lineSpacingDots = Math.max(16, bytes[i + 2])
        i += 3
        continue
      }
      if (cmd === 0x64 && i + 2 < len) {
        // ESC d n — Print and feed n lines
        const n = bytes[i + 2]
        if (currentLineSpans.length > 0) flushLine(0)
        if (n > 0) ops.push({ kind: 'feed', dots: n * lineSpacingDots })
        i += 3
        continue
      }
      if (cmd === 0x4a && i + 2 < len) {
        // ESC J n — Print and feed n dots
        const n = bytes[i + 2]
        if (currentLineSpans.length > 0) flushLine(n)
        else if (n > 0) ops.push({ kind: 'feed', dots: n })
        i += 3
        continue
      }
      if (cmd === 0x44) {
        // ESC D n1...nk NUL — Set horizontal tab positions
        const stops: number[] = []
        let k = i + 2
        while (k < len && bytes[k] !== 0x00) {
          stops.push(bytes[k])
          k++
        }
        if (stops.length > 0) tabStops = stops
        i = k + 1
        continue
      }
      if (cmd === 0x74 && i + 2 < len) {
        // ESC t n — Code table selection
        i += 3
        continue
      }
      if (cmd === 0x52 && i + 2 < len) {
        // ESC R n — International character set
        i += 3
        continue
      }
      if (cmd === 0x70 && i + 4 < len) {
        // ESC p m t1 t2 — Cash drawer kick pulse
        kickDrawer = true
        i += 5
        continue
      }

      // Unrecognized ESC command: skip 2 bytes
      i += 2
      continue
    }

    if (b === 0x1d) {
      // GS sequence
      flushTextBytesToSpan()
      const cmd = bytes[i + 1]
      if (cmd === undefined) break

      if (cmd === 0x21 && i + 2 < len) {
        // GS ! n — Select character size
        const n = bytes[i + 2]
        scaleW = Math.min(6, ((n >>> 4) & 0x07) + 1)
        scaleH = Math.min(6, (n & 0x07) + 1)
        i += 3
        continue
      }
      if (cmd === 0x42 && i + 2 < len) {
        // GS B n — White/black reverse print
        reverse = (bytes[i + 2] & 1) !== 0
        i += 3
        continue
      }
      if (cmd === 0x68 && i + 2 < len) {
        // GS h n — Set barcode height
        barcodeHeight = Math.max(20, bytes[i + 2])
        i += 3
        continue
      }
      if (cmd === 0x77 && i + 2 < len) {
        // GS w n — Set barcode module width
        barcodeModuleWidth = Math.max(1, Math.min(6, bytes[i + 2]))
        i += 3
        continue
      }
      if (cmd === 0x48 && i + 2 < len) {
        // GS H n — Select HRI print position
        const n = bytes[i + 2] & 0x03
        barcodeHri =
          n === 1 ? 'above' : n === 2 ? 'below' : n === 3 ? 'both' : 'none'
        i += 3
        continue
      }
      if (cmd === 0x6b && i + 2 < len) {
        // GS k m ... — Print 1D barcode
        if (currentLineSpans.length > 0) flushLine(0)
        const m = bytes[i + 2]
        if (m <= 6) {
          let k = i + 3
          const bcBytes: number[] = []
          while (k < len && bytes[k] !== 0x00) {
            bcBytes.push(bytes[k])
            k++
          }
          ops.push({
            kind: 'barcode',
            align,
            data: decodeTextChunk(bcBytes),
            height: barcodeHeight,
            moduleWidth: barcodeModuleWidth,
            hri: barcodeHri,
          })
          i = k + 1
          continue
        } else if (m >= 65 && m <= 79 && i + 3 < len) {
          const nLen = bytes[i + 3]
          const slice = Array.from(bytes.slice(i + 4, i + 4 + nLen))
          // Strip Code 128 `{A` / `{B` / `{C` prefix if present
          const text = decodeTextChunk(slice).replace(/^\{[ABC]/, '')
          ops.push({
            kind: 'barcode',
            align,
            data: text,
            height: barcodeHeight,
            moduleWidth: barcodeModuleWidth,
            hri: barcodeHri,
          })
          i += 4 + nLen
          continue
        }
      }
      if (cmd === 0x28 && i + 5 < len && bytes[i + 2] === 0x6b) {
        // GS ( k pL pH cn fn ... — 2D / QR code commands
        const pL = bytes[i + 3]
        const pH = bytes[i + 4]
        const paramLen = pL + (pH << 8)
        const cn = bytes[i + 5]
        const fn = bytes[i + 6]
        const payloadEnd = Math.min(len, i + 5 + paramLen)

        if (cn === 49) {
          if (fn === 67 && i + 7 < payloadEnd) {
            qrModuleSize = Math.max(2, Math.min(12, bytes[i + 7]))
          } else if (fn === 80 && i + 8 <= payloadEnd) {
            // Store QR symbol data (skip m byte at i+7)
            qrStoredData = decodeTextChunk(
              Array.from(bytes.slice(i + 8, payloadEnd)),
            )
          } else if (fn === 81) {
            // Print stored QR symbol
            if (currentLineSpans.length > 0) flushLine(0)
            if (qrStoredData) {
              ops.push({
                kind: 'qr',
                align,
                data: qrStoredData,
                moduleSize: qrModuleSize,
              })
            }
          }
        }
        i = payloadEnd
        continue
      }
      if (cmd === 0x76 && i + 7 < len && bytes[i + 2] === 0x30) {
        // GS v 0 m xL xH yL yH d1...dk — Print raster bit image
        if (currentLineSpans.length > 0) flushLine(0)
        const mode = bytes[i + 3] & 0x03
        const xBytes = bytes[i + 4] + (bytes[i + 5] << 8)
        const yDots = bytes[i + 6] + (bytes[i + 7] << 8)
        const dataLen = xBytes * yDots
        const bitmap = bytes.slice(i + 8, Math.min(len, i + 8 + dataLen))
        if (xBytes > 0 && yDots > 0) {
          ops.push({
            kind: 'raster',
            align,
            widthBytes: xBytes,
            heightDots: yDots,
            scaleX: mode === 1 || mode === 3 ? 2 : 1,
            scaleY: mode === 2 || mode === 3 ? 2 : 1,
            bitmap,
          })
        }
        i += 8 + dataLen
        continue
      }
      if (cmd === 0x56 && i + 2 < len) {
        // GS V m [n] — Cut paper
        if (currentLineSpans.length > 0) flushLine(0)
        const m = bytes[i + 2]
        if (m === 65 || m === 66 || m === 97 || m === 98) {
          const extra = i + 3 < len ? bytes[i + 3] : 0
          if (extra > 0) ops.push({ kind: 'feed', dots: Math.min(140, extra) })
          ops.push({ kind: 'cut' })
          i += 4
        } else {
          ops.push({ kind: 'cut' })
          i += 3
        }
        continue
      }

      i += 2
      continue
    }

    if (b >= 0x20) {
      pendingBytes.push(b)
    }
    i++
  }

  flushTextBytesToSpan()
  if (currentLineSpans.length > 0) {
    flushLine(0)
  }

  // Trim trailing cut/blank feed noise while keeping a clean top/bottom receipt margin
  while (ops.length > 0 && ops[ops.length - 1].kind === 'cut') {
    ops.pop()
  }

  // Layout pass to measure exact receipt height
  const scratchCanvas = document.createElement('canvas')
  scratchCanvas.width = PAPER_WIDTH_DOTS
  scratchCanvas.height = 64
  const mCtx = scratchCanvas.getContext('2d')!

  const BASE_FONT_A_PX = 22 // 48 columns across 536px (~11.1px advance)
  const BASE_FONT_B_PX = 17 // 64 columns across 536px (~8.4px advance)

  interface LaidOutLine {
    y: number
    height: number
    align: 'left' | 'center' | 'right'
    spans: Array<TextSpan & { width: number; fontPx: number }>
  }

  const drawTasks: Array<
    | ({ kind: 'line' } & LaidOutLine)
    | {
        kind: 'barcode'
        y: number
        align: 'left' | 'center' | 'right'
        data: string
        height: number
        moduleWidth: number
        hri: 'none' | 'above' | 'below' | 'both'
      }
    | {
        kind: 'qr'
        y: number
        align: 'left' | 'center' | 'right'
        data: string
        moduleSize: number
      }
    | {
        kind: 'raster'
        y: number
        align: 'left' | 'center' | 'right'
        widthBytes: number
        heightDots: number
        scaleX: number
        scaleY: number
        bitmap: Uint8Array
      }
    | {
        kind: 'cut'
        y: number
      }
  > = []

  let cursorY = 26

  for (const op of ops) {
    if (op.kind === 'feed') {
      cursorY += op.dots
      continue
    }
    if (op.kind === 'cut') {
      cursorY += 12
      drawTasks.push({ kind: 'cut', y: cursorY })
      cursorY += 16
      continue
    }
    if (op.kind === 'barcode') {
      cursorY += 6
      drawTasks.push({ ...op, y: cursorY })
      const hriExtra =
        op.hri === 'both' ? 46 : op.hri === 'none' ? 0 : 24
      cursorY += op.height + hriExtra + 10
      continue
    }
    if (op.kind === 'qr') {
      cursorY += 8
      drawTasks.push({ ...op, y: cursorY })
      // Measure exact QR height using scratch context
      const { sizePx } = drawQrCode(mCtx, op.data, {
        x: 0,
        y: 0,
        moduleSize: op.moduleSize,
      })
      cursorY += sizePx + 12
      continue
    }
    if (op.kind === 'raster') {
      cursorY += 4
      drawTasks.push({ ...op, y: cursorY })
      cursorY += op.heightDots * op.scaleY + 6
      continue
    }
    if (op.kind === 'line') {
      if (op.spans.length === 0) {
        cursorY += 28 + op.extraFeedDots
        continue
      }

      // Wrap spans onto lines if wider than PRINTABLE_WIDTH
      let rowSpans: Array<TextSpan & { width: number; fontPx: number }> = []
      let rowWidth = 0
      let rowMaxH = 28

      const pushRow = (extra = 0) => {
        drawTasks.push({
          kind: 'line',
          y: cursorY,
          height: rowMaxH,
          align: op.align,
          spans: rowSpans,
        })
        cursorY += rowMaxH + extra
        rowSpans = []
        rowWidth = 0
        rowMaxH = 28
      }

      for (const sp of op.spans) {
        const basePx = sp.fontB ? BASE_FONT_B_PX : BASE_FONT_A_PX
        mCtx.font = `${sp.bold ? '700' : '500'} ${basePx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
        let remaining = sp.text
        while (remaining.length > 0) {
          const fullW = mCtx.measureText(remaining).width * sp.scaleW
          if (rowWidth + fullW <= PRINTABLE_WIDTH + 2) {
            rowSpans.push({ ...sp, text: remaining, width: fullW, fontPx: basePx })
            rowWidth += fullW
            rowMaxH = Math.max(rowMaxH, Math.round(basePx * sp.scaleH + 6))
            remaining = ''
          } else {
            const avail = Math.max(12, PRINTABLE_WIDTH - rowWidth)
            const charAdv = Math.max(
              4,
              (mCtx.measureText('M').width || basePx * 0.6) * sp.scaleW,
            )
            const take = Math.max(1, Math.floor(avail / charAdv))
            if (rowWidth > 0 && take < 2) {
              pushRow(0)
              continue
            }
            const head = remaining.slice(0, take)
            const headW = mCtx.measureText(head).width * sp.scaleW
            rowSpans.push({ ...sp, text: head, width: headW, fontPx: basePx })
            rowMaxH = Math.max(rowMaxH, Math.round(basePx * sp.scaleH + 6))
            remaining = remaining.slice(take)
            pushRow(0)
          }
        }
      }

      if (rowSpans.length > 0) {
        pushRow(op.extraFeedDots)
      }
    }
  }

  const totalHeight = Math.min(2800, Math.max(220, cursorY + 28))

  const canvas = document.createElement('canvas')
  canvas.width = PAPER_WIDTH_DOTS
  canvas.height = totalHeight
  const ctx = canvas.getContext('2d')!

  // Thermal receipt paper background
  ctx.fillStyle = '#fafaf9'
  ctx.fillRect(0, 0, PAPER_WIDTH_DOTS, totalHeight)

  const getAnchorX = (a: 'left' | 'center' | 'right') =>
    a === 'center'
      ? PAPER_WIDTH_DOTS / 2
      : a === 'right'
        ? PAPER_WIDTH_DOTS - MARGIN_X
        : MARGIN_X

  for (const task of drawTasks) {
    if (task.kind === 'cut') {
      ctx.save()
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(8, task.y)
      ctx.lineTo(PAPER_WIDTH_DOTS - 8, task.y)
      ctx.stroke()
      ctx.restore()
      continue
    }

    if (task.kind === 'barcode') {
      drawBarcode1D(ctx, task.data, {
        x: getAnchorX(task.align),
        y: task.y,
        height: task.height,
        moduleWidth: task.moduleWidth,
        maxWidth: PRINTABLE_WIDTH,
        hriPosition: task.hri,
        align: task.align,
        color: '#111827',
      })
      continue
    }

    if (task.kind === 'qr') {
      drawQrCode(ctx, task.data, {
        x: getAnchorX(task.align),
        y: task.y,
        moduleSize: task.moduleSize,
        align: task.align,
        color: '#111827',
      })
      continue
    }

    if (task.kind === 'raster') {
      const wDots = task.widthBytes * 8
      const outW = wDots * task.scaleX
      let rx = MARGIN_X
      if (task.align === 'center') rx = Math.round((PAPER_WIDTH_DOTS - outW) / 2)
      else if (task.align === 'right') rx = PAPER_WIDTH_DOTS - MARGIN_X - outW

      ctx.fillStyle = '#111827'
      for (let ry = 0; ry < task.heightDots; ry++) {
        const rowOffset = ry * task.widthBytes
        for (let bx = 0; bx < task.widthBytes; bx++) {
          const byteVal = task.bitmap[rowOffset + bx]
          if (!byteVal) continue
          for (let bit = 0; bit < 8; bit++) {
            if (byteVal & (0x80 >>> bit)) {
              ctx.fillRect(
                rx + (bx * 8 + bit) * task.scaleX,
                task.y + ry * task.scaleY,
                task.scaleX,
                task.scaleY,
              )
            }
          }
        }
      }
      continue
    }

    if (task.kind === 'line') {
      const totalW = task.spans.reduce((s, sp) => s + sp.width, 0)
      let x = MARGIN_X
      if (task.align === 'center') x = (PAPER_WIDTH_DOTS - totalW) / 2
      else if (task.align === 'right') x = PAPER_WIDTH_DOTS - MARGIN_X - totalW

      const baselineY = task.y + task.height - 5

      for (const sp of task.spans) {
        if (sp.reverse) {
          ctx.fillStyle = '#111827'
          ctx.fillRect(
            Math.round(x - 2),
            Math.round(task.y),
            Math.ceil(sp.width + 4),
            task.height,
          )
        }

        ctx.save()
        ctx.font = `${sp.bold ? '700' : '500'} ${sp.fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
        ctx.fillStyle = sp.reverse ? '#fafaf9' : '#111827'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.translate(x, baselineY)
        ctx.scale(sp.scaleW, sp.scaleH)
        ctx.fillText(sp.text, 0, 0)
        ctx.restore()

        if (sp.underline > 0) {
          ctx.fillStyle = sp.reverse ? '#fafaf9' : '#111827'
          ctx.fillRect(
            Math.round(x),
            Math.round(baselineY + 2),
            Math.ceil(sp.width),
            sp.underline,
          )
        }

        x += sp.width
      }
    }
  }

  return {
    canvas,
    widthDots: PAPER_WIDTH_DOTS,
    heightDots: totalHeight,
    kickDrawer,
  }
}
