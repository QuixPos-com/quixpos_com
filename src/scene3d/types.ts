import type { RefObject } from 'preact'

export type ThreeModule = typeof import('three')
export type CSS3DObjectConstructor =
  typeof import('three/examples/jsm/renderers/CSS3DRenderer.js').CSS3DObject

export interface Disposable {
  dispose: () => void
}

export type TargetKind = 'label' | 'screen' | 'drawer' | 'power'

export type NavPresetId = 'total' | 'left' | 'center' | 'right' | 'drawer'

export type FocusViewId = NavPresetId

export interface TargetedDevice {
  title: string
  kind: TargetKind
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
  crop?: {
    x: number
    y: number
    w: number
    h: number
  }
}

export interface TabletInstance {
  spec: TabletSpec
  cutoutMesh: InstanceType<ThreeModule['Mesh']>
  powerBtnGroup: InstanceType<ThreeModule['Group']>
  powerFaceMat: InstanceType<ThreeModule['MeshStandardMaterial']>
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
  lastMouseX: number
  lastMouseY: number
  pressedKeys: Set<string>
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
}

export interface SceneController {
  navigateToView: (view: NavPresetId) => void
  returnToPrevious: () => void
  toggleDrawer: () => void
  dispose: () => void
}
