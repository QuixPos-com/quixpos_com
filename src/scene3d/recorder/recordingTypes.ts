import type {
  FocusViewId,
  HeldItemMode,
  ShelfProductInput,
  ZebraReelId,
} from '../types'

export const RECORDING_FORMAT_ID = 'quixpos-scene3d-recording' as const
export const RECORDING_FORMAT_VERSION = 1 as const

export const FRAME_FLAG_POINTER_LOCKED = 1 << 0
export const FRAME_FLAG_DRAG_TURNING = 1 << 1
export const FRAME_FLAG_HAS_CURSOR = 1 << 2
export const FRAME_FLAG_MOVE_ENGAGED = 1 << 3
export const FRAME_FLAG_AIM_ENGAGED = 1 << 4
export const FRAME_FLAG_ZOOM_ENGAGED = 1 << 5
export const FRAME_FLAG_SCANNER_FLASH = 1 << 6

/**
 * Compact per-frame movement sample recorded in sync with the tab capture video:
 * [
 *   0: tMs,
 *   1: camX, 2: camY, 3: camZ,
 *   4: yaw, 5: pitch, 6: fov,
 *   7: stageW, 8: stageH,
 *   9: cursorU (0..1 left->right), 10: cursorV (0..1 top->bottom),
 *   11: moveKnobX, 12: moveKnobY,
 *   13: aimKnobX, 14: aimKnobY,
 *   15: zoomNorm,
 *   16: flags (FRAME_FLAG_* bitmask)
 * ]
 */
export type RecordedFrameTuple = [
  tMs: number,
  camX: number,
  camY: number,
  camZ: number,
  yaw: number,
  pitch: number,
  fov: number,
  stageW: number,
  stageH: number,
  cursorU: number,
  cursorV: number,
  moveKnobX: number,
  moveKnobY: number,
  aimKnobX: number,
  aimKnobY: number,
  zoomNorm: number,
  flags: number,
]

/** Normalized [uMin, vMin, uMax, vMax] in WebGL video UV space (0..1 left->right, 0..1 bottom->top) */
export type NormalizedUvRect = [
  uMin: number,
  vMin: number,
  uMax: number,
  vMax: number,
]

export interface RecordedTabletGeometry {
  id: string
  title: string
  subtitle: string
  screenW: number
  screenH: number
  cutoutW: number
  cutoutH: number
  /** Column-major 4x4 world matrix of the tablet's cutoutMesh plane */
  matrixWorld: number[]
}

export interface RecordedScreenState {
  poweredOn: boolean
  enabled: boolean
}

export interface RecordedInitialSnapshot {
  camera: {
    x: number
    y: number
    z: number
    yaw: number
    pitch: number
    fov: number
    zoomNorm: number
    stageW: number
    stageH: number
  }
  activeView: FocusViewId | null
  fullscreenTabletId: string | null
  heldMode: HeldItemMode
  drawerOpen: boolean
  drawerCashCents: number
  zebraReelId: ZebraReelId
  audioMuted: boolean
  screens: Record<string, RecordedScreenState>
  shelfProducts: ShelfProductInput[]
  hudExclusionRects: NormalizedUvRect[]
}

export type RecordedSceneEvent =
  | {
      t: number
      type: 'view:change'
      activeView: FocusViewId | null
      fullscreenTabletId: string | null
    }
  | {
      t: number
      type: 'tablet:power'
      tabletId: string
      poweredOn: boolean
      enabled: boolean
    }
  | { t: number; type: 'tablet:powerBlocked'; tabletId: string }
  | { t: number; type: 'tablet:reload'; tabletId: string }
  | { t: number; type: 'drawer:state'; open: boolean }
  | { t: number; type: 'drawer:cash'; cents: number }
  | { t: number; type: 'zebra:reel'; reelId: ZebraReelId }
  | { t: number; type: 'zebra:pickerModal'; open: boolean }
  | {
      t: number
      type: 'print:zpl'
      sheetId: string
      zpl: string
      jobId?: string
      sender?: string
    }
  | {
      t: number
      type: 'print:escpos'
      sheetId: string
      base64: string
      jobId?: string
      sender?: string
      kickDrawer?: boolean
    }
  | { t: number; type: 'label:pickup'; sheetId: string }
  | { t: number; type: 'label:rotate'; yawOffset: number }
  | {
      t: number
      type: 'label:place'
      sheetId: string
      targetKind: 'scene' | 'drawer'
      pos: [number, number, number]
      quat: [number, number, number, number]
      yawOffset: number
    }
  | { t: number; type: 'label:cancel'; sheetId?: string }
  | { t: number; type: 'scanner:pickup' }
  | { t: number; type: 'scanner:putdown' }
  | { t: number; type: 'scanner:pulse' }
  | {
      t: number
      type: 'scanner:decoded'
      code: string
      format: string
      deliveredToTablet: boolean
    }
  | { t: number; type: 'shelves:setProducts'; products: ShelfProductInput[] }
  | {
      t: number
      type: 'shelves:upsertProduct'
      product: Partial<ShelfProductInput> & { id: string | number }
    }
  | { t: number; type: 'shelves:clear' }
  | { t: number; type: 'audio:mute'; muted: boolean }
  | { t: number; type: 'hud:rects'; rects: NormalizedUvRect[] }

export interface SceneRecordingManifest {
  format: typeof RECORDING_FORMAT_ID
  version: typeof RECORDING_FORMAT_VERSION
  createdAt: string
  durationMs: number
  videoFile: string
  videoMimeType: string
  videoWidth: number
  videoHeight: number
  hasAudio: boolean
  hasTabAudio: boolean
  hasMicAudio: boolean
  cleanHud: boolean
  tablets: RecordedTabletGeometry[]
  /** Maps original product image URL -> zip asset path (e.g. "assets/shelf-0.webp") */
  shelfImageAssets: Record<string, string>
  initialSnapshot: RecordedInitialSnapshot
  frames: RecordedFrameTuple[]
  events: RecordedSceneEvent[]
}

export interface UnpackedRecordingSession {
  manifest: SceneRecordingManifest
  videoBlob: Blob
  videoObjectUrl: string
  /** Maps original product image URL -> local blob: object URL for 100% offline shelf textures */
  offlineImageMap: Record<string, string>
  bundleSizeBytes: number
  dispose: () => void
}

export type ReplayCameraFollowMode = 'recorded' | 'free'
