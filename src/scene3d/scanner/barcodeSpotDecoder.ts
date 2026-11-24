import {
  prepareZXingModule,
  readBarcodes,
  type ReaderOptions,
} from 'zxing-wasm/reader'
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export interface DecodedSpotBarcode {
  code: string
  format: string
}

const READER_OPTIONS: ReaderOptions = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  tryDenoise: true,
  binarizer: 'LocalAverage',
  textMode: 'Plain',
  maxNumberOfSymbols: 4,
}

// Three.js WebGLRenderTarget outputs LinearSRGBColorSpace; convert to exact sRGB OETF
const LINEAR_TO_SRGB = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  const lin = i / 255
  const srgb =
    lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055
  LINEAR_TO_SRGB[i] = Math.max(0, Math.min(255, Math.round(srgb * 255)))
}

let modulePrepared = false
let reusableClamped: Uint8ClampedArray<ArrayBuffer> | null = null

export function warmScannerDecoder(): void {
  if (modulePrepared || typeof window === 'undefined') return
  modulePrepared = true
  try {
    void prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path,
      },
      fireImmediately: true,
    })
  } catch {
    // Module will retry on first readBarcodes call if needed
  }
}

/**
 * Converts a WebGL `readRenderTargetPixels` bottom-up Linear-RGBA buffer into a
 * top-down sRGB `ImageData` (optionally painting into `previewCtx` for the live HUD
 * viewfinder) and decodes 1D barcodes & 2D QR codes via `zxing-wasm`.
 */
export async function decodeSpotPixels(
  rgbaBottomUp: Uint8Array,
  width: number,
  height: number,
  previewCtx?: CanvasRenderingContext2D | null,
): Promise<DecodedSpotBarcode | null> {
  if (typeof window === 'undefined' || typeof ImageData === 'undefined') {
    return null
  }
  warmScannerDecoder()

  const byteLen = width * height * 4
  if (!reusableClamped || reusableClamped.length !== byteLen) {
    reusableClamped = new Uint8ClampedArray(new ArrayBuffer(byteLen))
  }

  const rowStride = width * 4
  for (let y = 0; y < height; y++) {
    let src = (height - 1 - y) * rowStride
    let dst = y * rowStride
    for (let x = 0; x < width; x++) {
      reusableClamped[dst] = LINEAR_TO_SRGB[rgbaBottomUp[src]]
      reusableClamped[dst + 1] = LINEAR_TO_SRGB[rgbaBottomUp[src + 1]]
      reusableClamped[dst + 2] = LINEAR_TO_SRGB[rgbaBottomUp[src + 2]]
      reusableClamped[dst + 3] = 255
      src += 4
      dst += 4
    }
  }

  const imageData = new ImageData(reusableClamped, width, height)

  if (previewCtx) {
    const canvas = previewCtx.canvas
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    previewCtx.putImageData(imageData, 0, 0)
  }

  const results = await readBarcodes(imageData, READER_OPTIONS)
  if (!results || results.length === 0) return null

  const centerX = width * 0.5
  const centerY = height * 0.5
  let bestText = ''
  let bestFormat = ''
  let bestDistSq = Infinity

  for (const res of results) {
    if (!res.isValid) continue
    const text = res.text?.trim() ?? ''
    if (!text) continue

    const pos = res.position
    const cx =
      (pos.topLeft.x + pos.topRight.x + pos.bottomRight.x + pos.bottomLeft.x) *
      0.25
    const cy =
      (pos.topLeft.y + pos.topRight.y + pos.bottomRight.y + pos.bottomLeft.y) *
      0.25
    const dx = cx - centerX
    const dy = cy - centerY
    const distSq = dx * dx + dy * dy

    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestText = text
      bestFormat = res.format
    }
  }

  if (!bestText) return null
  return {
    code: bestText,
    format: bestFormat || 'Unknown',
  }
}

let sharedAudioCtx: AudioContext | null = null

export function playScannerBeep(muted: boolean): void {
  if (muted || typeof window === 'undefined') return
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioCtx) return

  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx()
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume()
    }
    const now = sharedAudioCtx.currentTime
    const osc = sharedAudioCtx.createOscillator()
    const gain = sharedAudioCtx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(2480, now)
    osc.frequency.setValueAtTime(2620, now + 0.032)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.006)
    gain.gain.setValueAtTime(0.11, now + 0.055)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.078)

    osc.connect(gain)
    gain.connect(sharedAudioCtx.destination)
    osc.start(now)
    osc.stop(now + 0.082)
  } catch {
    // Ignore Web Audio autoplay restrictions
  }
}
