import type { RefObject } from 'preact'
import type { SceneBroadcastChannel } from './iframeChannel'

export type ThreeModule = typeof import('three')
export type CSS3DObjectConstructor =
  typeof import('three/examples/jsm/renderers/CSS3DRenderer.js').CSS3DObject

export interface Disposable {
  dispose: () => void
}

export type TargetKind =
  | 'label'
  | 'screen'
  | 'drawer'
  | 'power'
  | 'zebra-latch'
  | 'zebra-label'
  | 'scanner'
  | 'scanner-dock'

export type HeldItemMode = 'none' | 'label' | 'scanner'

export interface BarcodeScanEvent {
  code: string
  format: string
  tabletId: 'pos-center'
  deliveredToTablet: boolean
  timestamp: number
}

export interface EuroCashBreakdown {
  cents: number
  amount: number
  notes: Record<'100' | '50' | '20' | '10' | '5', number>
  coins: Record<'200' | '100' | '50' | '20' | '10' | '5' | '2' | '1', number>
}

export type ZebraReelId = '25x13' | '57x32' | '101x51' | '101x152'

export interface ZebraMediaInfo {
  [key: string]: unknown
  id: ZebraReelId
  label: string
  dpi: number
  widthMm: number
  heightMm: number
  widthPx: number
  heightPx: number
}

export type NavPresetId = 'total' | 'left' | 'center' | 'right' | 'drawer'

export type FocusViewId = NavPresetId

export interface TargetedDevice {
  title: string
  kind: TargetKind
  poweredOn?: boolean
  controllablePower?: boolean
  loginRequiredPrompt?: boolean
}

export interface ScreenPowerSummary {
  id: string
  title: string
  subtitle: string
  poweredOn: boolean
  enabled: boolean
}

export interface TabletSpec {
  id: string
  title: string
  subtitle: string
  url: string
  x: number
  cssW: number
  cssH: number
  physicalScale: number
  bezelPad: number
  bottomClearance: number
  initialPower?: boolean
  canControlScreens?: boolean
  crop?: {
    x: number
    y: number
    w: number
    h: number
  }
}

export interface TabletInstance {
  spec: TabletSpec
  poweredOn: boolean
  enabledByMain: boolean
  loginPromptTimer: number
  cutoutMesh: InstanceType<ThreeModule['Mesh']>
  loginOsdMesh: InstanceType<ThreeModule['Mesh']>
  loginOsdMat: InstanceType<ThreeModule['MeshBasicMaterial']>
  camDot: InstanceType<ThreeModule['Mesh']>
  powerBtnGroup: InstanceType<ThreeModule['Group']>
  powerFaceMat: InstanceType<ThreeModule['MeshStandardMaterial']>
  powerUserData: {
    tabletTitle: string
    tabletId: string
    kind: 'power'
    poweredOn: boolean
    controllablePower: boolean
  }
  powerBaseZ: number
  powerHover: number
  powerPressAnim: number
  reloadFlash: number
  cssObject: InstanceType<CSS3DObjectConstructor>
  wrapperEl: HTMLDivElement
  iframeEl: HTMLIFrameElement
  tabletW: number
  tabletH: number
  centerY: number
}

export interface LoupeInstance {
  viewId: NavPresetId
  loupeGroup: InstanceType<ThreeModule['Group']>
  plateMesh: InstanceType<ThreeModule['Mesh']> | null
  baseScale: number
  baseY: number
  baseZ: number
  liftAxis: 'y' | 'z'
  hover: number
}

export interface CameraTween {
  fromX: number
  fromY: number
  fromZ: number
  fromYaw: number
  fromPitch: number
  toX: number
  toY: number
  toZ: number
  toYaw: number
  toPitch: number
  elapsed: number
  duration: number
}

export interface SavedPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  activeView: FocusViewId | null
}

export interface SceneRuntimeState {
  yaw: number
  pitch: number
  targetYaw: number
  targetPitch: number
  velX: number
  velZ: number
  pointerLocked: boolean
  dragTurning: boolean
  activeView: FocusViewId | null
  poseHistory: SavedPose[]
  cameraTween: CameraTween | null
  currentTargetTitle: string | null
  currentTargetId: string | null
  currentTargetKind: TargetKind | null
  currentTargetPoweredOn: boolean | null
  currentTargetLoginPrompt: boolean
  lastMouseX: number
  lastMouseY: number
  pressedKeys: Set<string>
  wheelMoveY: number
  touchMoveX: number
  touchMoveY: number
  touchAimX: number
  touchAimY: number
  moveStickEngaged: boolean
  aimStickEngaged: boolean
  mouseAimVisualX: number
  mouseAimVisualY: number
}

export interface TouchStickRefs {
  moveStickRef: RefObject<HTMLDivElement | null>
  moveKnobRef: RefObject<HTMLDivElement | null>
  moveMirrorRef: RefObject<HTMLDivElement | null>
  moveMirrorDotRef: RefObject<HTMLDivElement | null>
  aimStickRef: RefObject<HTMLDivElement | null>
  aimKnobRef: RefObject<HTMLDivElement | null>
  aimMirrorRef: RefObject<HTMLDivElement | null>
  aimMirrorDotRef: RefObject<HTMLDivElement | null>
}

export interface SceneCallbacks {
  onLockChange: (locked: boolean) => void
  onTargetChange: (target: TargetedDevice | null) => void
  onActiveViewChange: (view: FocusViewId | null) => void
  onDrawerChange: (isOpen: boolean) => void
  onZebraReelChange?: (media: ZebraMediaInfo) => void
  onZebraReelPickerOpen?: () => void
  onHeldModeChange?: (mode: HeldItemMode) => void
  onBarcodeScan?: (scan: BarcodeScanEvent) => void
}

export interface SceneController {
  channel: SceneBroadcastChannel
  navigateToView: (view: NavPresetId) => void
  returnToPrevious: () => void
  toggleDrawer: () => void
  setDrawerCash: (amountEur: number) => void
  setTabletPower: (tabletId: string, poweredOn: boolean) => void
  toggleTabletPower: (tabletId: string) => void
  setZebraReel: (reelId: ZebraReelId) => void
  getZebraMedia: () => ZebraMediaInfo
  printZpl: (zpl: string) => void
  printEscPos: (payload: string | Uint8Array | number[]) => void
  rotateHeldLabel: () => void
  dropHeldItem: () => void
  onBarcodeScan: (callback: (scan: BarcodeScanEvent) => void) => () => void
  dispose: () => void
}
