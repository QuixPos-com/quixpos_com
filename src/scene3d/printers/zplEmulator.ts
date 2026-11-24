import { drawBarcode1D, drawQrCode } from './barcodes'

export interface ZplRenderResult {
  canvas: HTMLCanvasElement
  widthDots: number
  heightDots: number
}

interface ZplCommand {
  code: string
  args: string
}

function tokenizeZpl(input: string): ZplCommand[] {
  const cmds: ZplCommand[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const ch = input[i]
    if (ch !== '^' && ch !== '~') {
      i++
      continue
    }
    const prefix = ch
    i++
    if (i >= n) break

    let code = ''
    if (/[A-Za-z@]/.test(input[i])) {
      code += input[i].toUpperCase()
      i++
      if (
        i < n &&
        code === 'A' &&
        /[0-9A-Za-z]/.test(input[i]) &&
        !(
          input[i].toUpperCase() === 'N' ||
          input[i].toUpperCase() === 'R' ||
          input[i].toUpperCase() === 'I' ||
          input[i].toUpperCase() === 'B'
        )
      ) {
        // ^A0N,30,30 -> code='A0', args='N,30,30'
        code += input[i].toUpperCase()
        i++
      } else if (i < n && /[A-Za-z0-9]/.test(input[i])) {
        code += input[i].toUpperCase()
        i++
      }
    } else {
      i++
      continue
    }

    const startArgs = i
    if (code === 'FD' || code === 'FV') {
      // Field data runs until ^FS (or next ^XZ)
      while (i < n) {
        if (
          (input[i] === '^' || input[i] === '~') &&
          input.slice(i + 1, i + 3).toUpperCase() === 'FS'
        ) {
          break
        }
        i++
      }
    } else {
      while (i < n && input[i] !== '^' && input[i] !== '~') {
        i++
      }
    }

    const args = input.slice(startArgs, i)
    cmds.push({ code: prefix === '~' ? `~${code}` : code, args })
  }

  return cmds
}

function decodeFieldHex(text: string, indicator: string): string {
  if (!indicator || !text.includes(indicator)) return text
  const bytes: number[] = []
  const encoder = new TextEncoder()

  let i = 0
  while (i < text.length) {
    if (
      text.startsWith(indicator, i) &&
      i + indicator.length + 2 <= text.length
    ) {
      const hex = text.slice(i + indicator.length, i + indicator.length + 2)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += indicator.length + 2
        continue
      }
    }
    const encoded = encoder.encode(text[i])
    for (let b = 0; b < encoded.length; b++) bytes.push(encoded[b])
    i++
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return new TextDecoder('iso-8859-1').decode(new Uint8Array(bytes))
  }
}

function parseNums(str: string): Array<number | undefined> {
  return str.split(',').map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return undefined
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : undefined
  })
}

/**
 * Emulates ZPL II label commands onto an HTMLCanvasElement (203 dpi thermal label).
 */
export function renderZplToCanvas(zplSource: string): ZplRenderResult {
  const allCmds = tokenizeZpl(zplSource)

  // If multiple ^XA...^XZ labels exist in one job, render the last complete one
  let cmds = allCmds
  let lastXa = -1
  for (let i = 0; i < allCmds.length; i++) {
    if (allCmds[i].code === 'XA') lastXa = i
  }
  if (lastXa >= 0) {
    const endXz = allCmds.findIndex((c, idx) => idx > lastXa && c.code === 'XZ')
    cmds = allCmds.slice(lastXa + 1, endXz > lastXa ? endXz : undefined)
  }

  let printWidth = 812 // Standard 4" @ 203 dpi
  let explicitLength = 0
  let maxEstimatedY = 420
  let curYCheck = 0
  let homeYCheck = 0

  for (const c of cmds) {
    const cleanArgs = c.args.trim()
    if (c.code === 'PW') {
      const [w] = parseNums(cleanArgs)
      if (w && w >= 160 && w <= 2400) printWidth = Math.round(w)
    } else if (c.code === 'LL') {
      const [l] = parseNums(cleanArgs)
      if (l && l >= 120 && l <= 3600) explicitLength = Math.round(l)
    } else if (c.code === 'LH') {
      const [, hy] = parseNums(cleanArgs)
      homeYCheck = hy ?? 0
    } else if (c.code === 'FO' || c.code === 'FT') {
      const [, fy] = parseNums(cleanArgs)
      curYCheck = homeYCheck + (fy ?? 0)
      maxEstimatedY = Math.max(maxEstimatedY, curYCheck + 90)
    } else if (c.code === 'GB') {
      const [, gh] = parseNums(cleanArgs)
      maxEstimatedY = Math.max(maxEstimatedY, curYCheck + (gh ?? 4) + 36)
    } else if (c.code === 'BC' || c.code === 'B3' || c.code === 'BE' || c.code === 'BU') {
      const parts = cleanArgs.split(',')
      const bh = Number(parts[1]) || 100
      maxEstimatedY = Math.max(maxEstimatedY, curYCheck + bh + 50)
    } else if (c.code === 'BQ') {
      maxEstimatedY = Math.max(maxEstimatedY, curYCheck + 240)
    }
  }

  const labelHeight = explicitLength > 0
    ? explicitLength
    : Math.min(1800, Math.max(460, maxEstimatedY + 40))

  const canvas = document.createElement('canvas')
  canvas.width = printWidth
  canvas.height = labelHeight
  const ctx = canvas.getContext('2d')!

  // Thermal label paper background
  ctx.fillStyle = '#fcfcfb'
  ctx.fillRect(0, 0, printWidth, labelHeight)

  // State machine
  let homeX = 0
  let homeY = 0
  let defaultFontH = 30
  let defaultFontW = 0
  let defaultFontMono = false

  let fieldX = 0
  let fieldY = 0
  let fieldTypesetBaseline = false
  let fieldReverse = false
  let fieldHexIndicator: string | null = null
  let fieldFontH: number | null = null
  let fieldFontW: number | null = null
  let fieldFontOrient: 'N' | 'R' | 'I' | 'B' = 'N'
  let fieldFontMono: boolean | null = null
  let fieldBlock: {
    width: number
    maxLines: number
    lineSpace: number
    align: 'L' | 'C' | 'R' | 'J'
  } | null = null

  let byModuleWidth = 3
  let byHeight = 96

  let pendingBarcode:
    | {
        kind: '1d'
        height: number
        hri: 'none' | 'above' | 'below'
      }
    | {
        kind: 'qr'
        mag: number
      }
    | null = null

  const resetField = () => {
    fieldReverse = false
    fieldHexIndicator = null
    fieldFontH = null
    fieldFontW = null
    fieldFontOrient = 'N'
    fieldFontMono = null
    fieldBlock = null
    pendingBarcode = null
    fieldTypesetBaseline = false
  }

  const withFieldDrawMode = (drawFn: (fill: string) => void) => {
    ctx.save()
    if (fieldReverse) {
      ctx.globalCompositeOperation = 'difference'
      drawFn('#ffffff')
    } else {
      drawFn('#111827')
    }
    ctx.restore()
  }

  for (const cmd of cmds) {
    const rawArgs = cmd.args
    const trimmed = rawArgs.trim()

    switch (cmd.code) {
      case 'LH': {
        const [hx, hy] = parseNums(trimmed)
        homeX = hx ?? 0
        homeY = hy ?? 0
        break
      }

      case 'CF': {
        const parts = trimmed.split(',')
        const fontId = (parts[0] || '0').trim().toUpperCase()
        defaultFontMono = fontId !== '0'
        const h = Number(parts[1])
        const w = Number(parts[2])
        if (Number.isFinite(h) && h > 0) defaultFontH = h
        defaultFontW = Number.isFinite(w) && w > 0 ? w : 0
        break
      }

      case 'BY': {
        const [mw, , bh] = parseNums(trimmed)
        if (mw && mw >= 1 && mw <= 12) byModuleWidth = mw
        if (bh && bh >= 16 && bh <= 800) byHeight = bh
        break
      }

      case 'FO':
      case 'FT': {
        const [fx, fy] = parseNums(trimmed)
        fieldX = homeX + (fx ?? 0)
        fieldY = homeY + (fy ?? 0)
        fieldTypesetBaseline = cmd.code === 'FT'
        break
      }

      case 'FR': {
        fieldReverse = true
        break
      }

      case 'FH': {
        fieldHexIndicator = trimmed ? trimmed[0] : '_'
        break
      }

      case 'FB': {
        const parts = trimmed.split(',')
        const width = Math.max(20, Number(parts[0]) || printWidth - fieldX)
        const maxLines = Math.max(1, Number(parts[1]) || 1)
        const lineSpace = Number(parts[2]) || 0
        const alignChar = (parts[3] || 'L').trim().toUpperCase()
        const align =
          alignChar === 'C' || alignChar === 'R' || alignChar === 'J'
            ? alignChar
            : 'L'
        fieldBlock = { width, maxLines, lineSpace, align }
        break
      }

      case 'GB': {
        const parts = trimmed.split(',')
        const w = Math.max(1, Number(parts[0]) || 1)
        const h = Math.max(1, Number(parts[1]) || 1)
        const thickness = Math.max(1, Number(parts[2]) || 1)
        const colorCode = (parts[3] || 'B').trim().toUpperCase()
        const rounding = Math.min(8, Math.max(0, Number(parts[4]) || 0))
        const radius =
          rounding > 0 ? Math.round((rounding / 8) * (Math.min(w, h) / 2)) : 0

        withFieldDrawMode((defaultColor) => {
          const drawColor =
            !fieldReverse && colorCode === 'W' ? '#fcfcfb' : defaultColor
          ctx.fillStyle = drawColor
          ctx.strokeStyle = drawColor

          if (thickness >= Math.min(w, h) / 2) {
            ctx.beginPath()
            if (radius > 0) ctx.roundRect(fieldX, fieldY, w, h, radius)
            else ctx.rect(fieldX, fieldY, w, h)
            ctx.fill()
          } else {
            ctx.lineWidth = thickness
            const half = thickness / 2
            ctx.beginPath()
            if (radius > 0) {
              ctx.roundRect(
                fieldX + half,
                fieldY + half,
                Math.max(1, w - thickness),
                Math.max(1, h - thickness),
                radius,
              )
            } else {
              ctx.rect(
                fieldX + half,
                fieldY + half,
                Math.max(1, w - thickness),
                Math.max(1, h - thickness),
              )
            }
            ctx.stroke()
          }
        })
        break
      }

      case 'GC': {
        const parts = trimmed.split(',')
        const diam = Math.max(2, Number(parts[0]) || 20)
        const thickness = Math.max(1, Number(parts[1]) || 2)
        const colorCode = (parts[2] || 'B').trim().toUpperCase()
        const r = diam / 2

        withFieldDrawMode((defaultColor) => {
          const drawColor =
            !fieldReverse && colorCode === 'W' ? '#fcfcfb' : defaultColor
          ctx.beginPath()
          if (thickness >= r) {
            ctx.fillStyle = drawColor
            ctx.arc(fieldX + r, fieldY + r, r, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.strokeStyle = drawColor
            ctx.lineWidth = thickness
            ctx.arc(
              fieldX + r,
              fieldY + r,
              Math.max(1, r - thickness / 2),
              0,
              Math.PI * 2,
            )
            ctx.stroke()
          }
        })
        break
      }

      case 'GD': {
        const parts = trimmed.split(',')
        const w = Math.max(1, Number(parts[0]) || 20)
        const h = Math.max(1, Number(parts[1]) || 20)
        const thickness = Math.max(1, Number(parts[2]) || 2)
        const colorCode = (parts[3] || 'B').trim().toUpperCase()
        const orient = (parts[4] || 'R').trim().toUpperCase()

        withFieldDrawMode((defaultColor) => {
          ctx.strokeStyle =
            !fieldReverse && colorCode === 'W' ? '#fcfcfb' : defaultColor
          ctx.lineWidth = thickness
          ctx.beginPath()
          if (orient === 'L') {
            ctx.moveTo(fieldX, fieldY)
            ctx.lineTo(fieldX + w, fieldY + h)
          } else {
            ctx.moveTo(fieldX, fieldY + h)
            ctx.lineTo(fieldX + w, fieldY)
          }
          ctx.stroke()
        })
        break
      }

      case 'BC':
      case 'B3':
      case 'BE':
      case 'BU': {
        const parts = trimmed.split(',')
        // ^BC orientation, height, printInterp(Y/N), interpAbove(Y/N)
        const heightIdx = cmd.code === 'B3' ? 2 : 1
        const interpIdx = cmd.code === 'B3' ? 3 : 2
        const aboveIdx = cmd.code === 'B3' ? 4 : 3
        const h = Number(parts[heightIdx]) || byHeight
        const printInterp = (parts[interpIdx] || 'Y').trim().toUpperCase() !== 'N'
        const above = (parts[aboveIdx] || 'N').trim().toUpperCase() === 'Y'
        pendingBarcode = {
          kind: '1d',
          height: Math.max(16, h),
          hri: !printInterp ? 'none' : above ? 'above' : 'below',
        }
        break
      }

      case 'BQ': {
        const parts = trimmed.split(',')
        const mag = Math.min(14, Math.max(2, Number(parts[2]) || 5))
        pendingBarcode = { kind: 'qr', mag }
        break
      }

      case 'GF': {
        // ^GFA,binaryBytes,graphicFieldBytes,bytesPerRow,HEXDATA
        const commaParts = trimmed.split(',')
        if (commaParts.length >= 5) {
          const mode = commaParts[0].trim().toUpperCase()
          const bytesPerRow = Math.max(1, Number(commaParts[3]) || 1)
          const hexData = commaParts.slice(4).join('').replace(/\s+/g, '')
          if (mode === 'A' && hexData.length >= 2) {
            withFieldDrawMode((fillColor) => {
              ctx.fillStyle = fillColor
              const totalBytes = Math.floor(hexData.length / 2)
              const rows = Math.ceil(totalBytes / bytesPerRow)
              let byteIdx = 0
              for (let r = 0; r < rows; r++) {
                for (let c = 0; c < bytesPerRow && byteIdx < totalBytes; c++) {
                  const byteVal = parseInt(
                    hexData.slice(byteIdx * 2, byteIdx * 2 + 2),
                    16,
                  )
                  byteIdx++
                  if (!byteVal) continue
                  for (let bit = 0; bit < 8; bit++) {
                    if (byteVal & (0x80 >>> bit)) {
                      ctx.fillRect(fieldX + c * 8 + bit, fieldY + r, 1, 1)
                    }
                  }
                }
              }
            })
          }
        }
        break
      }

      case 'FD':
      case 'FV': {
        let text = fieldHexIndicator
          ? decodeFieldHex(rawArgs, fieldHexIndicator)
          : rawArgs

        if (pendingBarcode?.kind === 'qr') {
          // ZPL ^BQ data often starts with "QA," / "MA," / "LA," / "HA,"
          const qrMatch = text.match(/^[QMLH][AM],(.*)$/s)
          const qrPayload = qrMatch ? qrMatch[1] : text
          const mag = pendingBarcode.mag
          withFieldDrawMode((fillColor) => {
            drawQrCode(ctx, qrPayload, {
              x: fieldX,
              y: fieldTypesetBaseline ? Math.max(0, fieldY - mag * 25) : fieldY,
              moduleSize: mag,
              color: fillColor,
            })
          })
          break
        }

        if (pendingBarcode?.kind === '1d') {
          // Strip ZPL Code128 subset prefixes like >:, >;, >9 if present
          const cleanCode = text.replace(/^>[:;90-8]/g, '')
          const bc = pendingBarcode
          withFieldDrawMode((fillColor) => {
            drawBarcode1D(ctx, cleanCode, {
              x: fieldX,
              y: fieldTypesetBaseline ? Math.max(0, fieldY - bc.height) : fieldY,
              height: bc.height,
              moduleWidth: byModuleWidth,
              maxWidth: Math.max(80, printWidth - fieldX - 12),
              hriPosition: bc.hri,
              color: fillColor,
            })
          })
          break
        }

        // Standard text rendering
        const fontH = Math.max(10, fieldFontH ?? defaultFontH)
        const fontW = fieldFontW ?? defaultFontW
        const isMono = fieldFontMono ?? defaultFontMono
        const scaleX = fontW > 0 ? Math.max(0.45, Math.min(2.6, fontW / fontH)) : 1

        if (fieldBlock) {
          text = text.replace(/\\&/g, '\n')
        }

        withFieldDrawMode((fillColor) => {
          ctx.fillStyle = fillColor
          ctx.font = isMono
            ? `600 ${fontH}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
            : `700 ${fontH}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
          ctx.textBaseline = fieldTypesetBaseline ? 'alphabetic' : 'top'

          ctx.save()
          ctx.translate(fieldX, fieldY)
          if (fieldFontOrient === 'R') ctx.rotate(Math.PI / 2)
          else if (fieldFontOrient === 'I') ctx.rotate(Math.PI)
          else if (fieldFontOrient === 'B') ctx.rotate(-Math.PI / 2)

          if (scaleX !== 1) {
            ctx.scale(scaleX, 1)
          }

          if (fieldBlock) {
            const effWidth = fieldBlock.width / scaleX
            const paragraphs = text.split(/\r?\n/)
            const lines: string[] = []
            for (const para of paragraphs) {
              const words = para.split(/\s+/).filter(Boolean)
              if (words.length === 0) {
                lines.push('')
                continue
              }
              let curLine = words[0]
              for (let wIdx = 1; wIdx < words.length; wIdx++) {
                const candidate = `${curLine} ${words[wIdx]}`
                if (ctx.measureText(candidate).width <= effWidth) {
                  curLine = candidate
                } else {
                  lines.push(curLine)
                  curLine = words[wIdx]
                }
              }
              lines.push(curLine)
            }

            const capped = lines.slice(0, fieldBlock.maxLines)
            const stepY = fontH + fieldBlock.lineSpace
            for (let li = 0; li < capped.length; li++) {
              let drawX = 0
              if (fieldBlock.align === 'C') {
                ctx.textAlign = 'center'
                drawX = effWidth / 2
              } else if (fieldBlock.align === 'R') {
                ctx.textAlign = 'right'
                drawX = effWidth
              } else {
                ctx.textAlign = 'left'
              }
              ctx.fillText(capped[li], drawX, li * stepY)
            }
          } else {
            ctx.textAlign = 'left'
            ctx.fillText(text, 0, 0)
          }

          ctx.restore()
        })
        break
      }

      case 'FS': {
        resetField()
        break
      }

      default: {
        // Handle ^A0N,h,w or ^AN,h,w font specification commands
        if (cmd.code.startsWith('A')) {
          const rest = cmd.code.slice(1) + trimmed
          const firstComma = rest.indexOf(',')
          const head = (firstComma >= 0 ? rest.slice(0, firstComma) : rest).trim()
          const tail = firstComma >= 0 ? rest.slice(firstComma + 1) : ''

          let fontKey = '0'
          let orientChar = 'N'
          if (head.length >= 2) {
            fontKey = head[0].toUpperCase()
            orientChar = head[1].toUpperCase()
          } else if (head.length === 1) {
            if ('NRIB'.includes(head[0].toUpperCase())) {
              orientChar = head[0].toUpperCase()
            } else {
              fontKey = head[0].toUpperCase()
            }
          }

          fieldFontMono = fontKey !== '0'
          if (
            orientChar === 'N' ||
            orientChar === 'R' ||
            orientChar === 'I' ||
            orientChar === 'B'
          ) {
            fieldFontOrient = orientChar
          }
          const [fh, fw] = parseNums(tail)
          if (fh && fh > 0) fieldFontH = fh
          if (fw && fw > 0) fieldFontW = fw
        }
        break
      }
    }
  }

  return {
    canvas,
    widthDots: printWidth,
    heightDots: labelHeight,
  }
}
