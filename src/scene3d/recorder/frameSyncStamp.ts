const SYNC_CELL_COUNT = 24
const SYNC_CELL_PX = 4
export const SYNC_STAMP_WIDTH_PX = SYNC_CELL_COUNT * SYNC_CELL_PX // 96 CSS px
export const SYNC_STAMP_HEIGHT_PX = 8 // 8 CSS px tall (immune to odd-height WebM rounding)

/**
 * Encodes an 18-bit `frameIndex` (0..262,143 -> 72+ min @ 60fps) into 24 4x4 luma cells:
 * - Cells 0..3:  1, 0, 1, 0 alternating white/black calibration & magic header
 * - Cells 4..21: 18-bit unsigned frame index (MSB first)
 * - Cells 22..23: 2-bit popcount checksum ((popcount & 3) ^ 1)
 */
export function paintFrameSyncStamp(
  ctx: CanvasRenderingContext2D,
  frameIndex: number,
): void {
  const clamped = Math.max(0, Math.min(0x3ffff, frameIndex | 0))
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, SYNC_STAMP_WIDTH_PX, SYNC_STAMP_HEIGHT_PX)

  ctx.fillStyle = '#ffffff'
  // Header bits: cell 0 = 1, cell 1 = 0, cell 2 = 1, cell 3 = 0
  ctx.fillRect(0, 0, SYNC_CELL_PX, SYNC_STAMP_HEIGHT_PX)
  ctx.fillRect(2 * SYNC_CELL_PX, 0, SYNC_CELL_PX, SYNC_STAMP_HEIGHT_PX)

  let pop = 0
  for (let b = 0; b < 18; b++) {
    const bit = (clamped >>> (17 - b)) & 1
    if (bit === 1) {
      pop++
      ctx.fillRect(
        (4 + b) * SYNC_CELL_PX,
        0,
        SYNC_CELL_PX,
        SYNC_STAMP_HEIGHT_PX,
      )
    }
  }

  const chk = (pop & 3) ^ 1
  if (((chk >>> 1) & 1) === 1) {
    ctx.fillRect(22 * SYNC_CELL_PX, 0, SYNC_CELL_PX, SYNC_STAMP_HEIGHT_PX)
  }
  if ((chk & 1) === 1) {
    ctx.fillRect(23 * SYNC_CELL_PX, 0, SYNC_CELL_PX, SYNC_STAMP_HEIGHT_PX)
  }
}

/**
 * Reads the 24-cell optical sync stamp from the bottom-left corner of a decoded `<video>` frame,
 * returning the exact `manifest.frames` index that produced that video frame, or `null` if absent.
 */
export function decodeFrameSyncStamp(
  readCtx: CanvasRenderingContext2D,
  videoEl: HTMLVideoElement,
  refStageW: number,
  refStageH: number,
  totalFrames: number,
): number | null {
  const vw = videoEl.videoWidth
  const vh = videoEl.videoHeight
  if (
    vw < SYNC_STAMP_WIDTH_PX ||
    vh < 32 ||
    refStageW <= 0 ||
    refStageH <= 0 ||
    totalFrames <= 0
  ) {
    return null
  }

  const stripW = (SYNC_STAMP_WIDTH_PX / refStageW) * vw
  const stripH = (SYNC_STAMP_HEIGHT_PX / refStageH) * vh
  if (stripW < 24 || stripH < 1.5) return null

  try {
    readCtx.drawImage(
      videoEl,
      0,
      vh - stripH,
      stripW,
      stripH,
      0,
      0,
      SYNC_STAMP_WIDTH_PX,
      SYNC_STAMP_HEIGHT_PX,
    )
  } catch {
    return null
  }

  const data = readCtx.getImageData(
    0,
    0,
    SYNC_STAMP_WIDTH_PX,
    SYNC_STAMP_HEIGHT_PX,
  ).data

  const cellLuma = (cellIdx: number): number => {
    const x = cellIdx * SYNC_CELL_PX + (SYNC_CELL_PX >> 1)
    const y = SYNC_STAMP_HEIGHT_PX >> 1
    const idx = (y * SYNC_STAMP_WIDTH_PX + x) * 4
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
  }

  const w0 = cellLuma(0)
  const b0 = cellLuma(1)
  const w1 = cellLuma(2)
  const b1 = cellLuma(3)
  const wMin = Math.min(w0, w1)
  const bMax = Math.max(b0, b1)

  if (
    wMin - bMax < 55 ||
    Math.abs(w0 - w1) > 45 ||
    Math.abs(b0 - b1) > 45
  ) {
    return null
  }

  const mid = (wMin + bMax) * 0.5
  let frameIndex = 0
  let pop = 0
  for (let b = 0; b < 18; b++) {
    const bit = cellLuma(4 + b) > mid ? 1 : 0
    frameIndex = (frameIndex << 1) | bit
    pop += bit
  }

  const c1 = cellLuma(22) > mid ? 1 : 0
  const c0 = cellLuma(23) > mid ? 1 : 0
  const chk = (c1 << 1) | c0
  if (chk !== ((pop & 3) ^ 1)) return null
  if (frameIndex < 0 || frameIndex >= totalFrames) return null

  return frameIndex
}
