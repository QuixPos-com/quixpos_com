import type { RefObject } from 'preact'
import {
  getCursorProximity,
  resolveTableCollision,
  stepCameraTween,
} from './cameraPhysics'
import {
  DEFAULT_ZEBRA_REEL_ID,
  DRAWER_D,
  DRAWER_OPEN_OFFSET,
  EYE_HEIGHT,
  getZebraReelById,
  SPAWN_PITCH,
  SPAWN_POS,
  SPAWN_YAW,
  STICK_MAX_R,
  STICK_PITCH_SPEED,
  STICK_YAW_SPEED,
  WALK_SPEED,
} from './config'
import {
  createFocusBlurPass,
  FOCUS_SHARP_LAYER,
} from './focusBlurPass'
import {
  createSceneBroadcastChannel,
  type PosPairingEntry,
  type PosPairingPayload,
} from './iframeChannel'
import { attachInputController } from './inputController'
import { buildBarcodeScanner } from './models/barcodeScanner'
import { buildCashDrawer } from './models/cashDrawer'
import {
  createDrawerMotionState,
  setDrawerMotionTarget,
  stepDrawerMotion,
} from './models/coinPhysics'
import { buildLightingAndFloor, buildTable } from './models/environment'
import { buildEpsonPrinter } from './models/epsonPrinter'
import { buildWallsAndShelves } from './models/shelves'
import { buildStationLoupes } from './models/stationLoupes'
import { buildTablets } from './models/tablets'
import { buildZebraPrinter } from './models/zebraPrinter'
import { createPrintManager } from './printers/printManager'
import {
  FRAME_FLAG_AIM_ENGAGED,
  FRAME_FLAG_DRAG_TURNING,
  FRAME_FLAG_HAS_CURSOR,
  FRAME_FLAG_MOVE_ENGAGED,
  FRAME_FLAG_POINTER_LOCKED,
  FRAME_FLAG_SCANNER_FLASH,
  FRAME_FLAG_ZOOM_ENGAGED,
  type NormalizedUvRect,
  type RecordedFrameTuple,
  type RecordedInitialSnapshot,
  type RecordedSceneEvent,
  type RecordedTabletGeometry,
  type ReplayCameraFollowMode,
  type UnpackedRecordingSession,
} from './recorder/recordingTypes'
import {
  createTabletVideoProjector,
  type InterpolatedFrameSample,
  type TabletVideoProjector,
} from './recorder/tabletVideoProjector'
import {
  decodeSpotPixels,
  paintSpotPreview,
  playScannerBeep,
  warmScannerDecoder,
} from './scanner/barcodeSpotDecoder'
import type {
  BarcodeScanEvent,
  Disposable,
  HeldItemMode,
  NavPresetId,
  SceneCallbacks,
  SceneController,
  SceneRecordingStartOptions,
  SceneRecordingStopResult,
  SceneReplayCallbacks,
  SceneReplayHandle,
  SceneRuntimeState,
  ScreenPowerSummary,
  ShelfProductInput,
  ShelfProductSummary,
  TouchStickRefs,
  ZebraMediaInfo,
  ZebraReelId,
} from './types'

export interface MountSceneOptions {
  stageEl: HTMLDivElement
  cssLayerEl: HTMLDivElement
  canvasEl: HTMLCanvasElement
  touchCapable: boolean
  stickRefs: TouchStickRefs
  laserReticleRef?: RefObject<HTMLDivElement | null>
  scannerPreviewCanvasRef?: RefObject<HTMLCanvasElement | null>
  isAudioMuted?: () => boolean
  callbacks: SceneCallbacks
}

const SCAN_SPOT_CSS_W = 112
const SCAN_SPOT_CSS_H = 70
const SCAN_RT_W = 960
const SCAN_RT_H = 600
const SCAN_INTERVAL_MS = 100
const MIN_ZOOM_FOV = 22
const DEFAULT_ZOOM_FOV = 58
const MAX_ZOOM_FOV = 70
const DEFAULT_ZOOM_NORM =
  (MAX_ZOOM_FOV - DEFAULT_ZOOM_FOV) / (MAX_ZOOM_FOV - MIN_ZOOM_FOV)
const ZOOM_KNOB_TRAVEL_PX = 28

export function mountSceneEngine({
  stageEl,
  cssLayerEl,
  canvasEl,
  touchCapable,
  stickRefs,
  laserReticleRef,
  scannerPreviewCanvasRef,
  isAudioMuted,
  callbacks,
}: MountSceneOptions): SceneController {
  let disposed = false
  let animId = 0
  let cleanupFns: Array<() => void> = []

  let navigateImpl: ((view: NavPresetId) => void) | null = null
  let returnPrevImpl: (() => void) | null = null
  let toggleDrawerImpl: (() => void) | null = null
  let setDrawerCashImpl: ((amountEur: number) => void) | null = null
  let setTabletPowerImpl: ((tabletId: string, poweredOn: boolean) => void) | null =
    null
  let toggleTabletPowerImpl: ((tabletId: string) => void) | null = null
  let setZebraReelImpl: ((reelId: ZebraReelId) => void) | null = null
  let activeZebraMedia: ZebraMediaInfo = getZebraReelById(DEFAULT_ZEBRA_REEL_ID)
  let printZplImpl: ((zpl: string) => void) | null = null
  let printEscPosImpl:
    | ((payload: string | Uint8Array | number[]) => void)
    | null = null
  let rotateHeldLabelImpl: (() => void) | null = null
  let dropHeldItemImpl: (() => void) | null = null
  let toggleScannerImpl: (() => void) | null = null
  let setShelfProductsImpl:
    | ((products: ShelfProductInput[]) => ShelfProductSummary[])
    | null = null
  let upsertShelfProductImpl:
    | ((
      product: Partial<ShelfProductInput> & { id: string | number },
    ) => ShelfProductSummary[])
    | null = null
  let clearShelvesImpl: (() => void) | null = null
  let startRecordingImpl:
    | ((options: SceneRecordingStartOptions) => boolean)
    | null = null
  let recordCustomEventImpl:
    | ((
        event:
          | { type: 'zebra:pickerModal'; open: boolean }
          | { type: 'audio:mute'; muted: boolean }
          | { type: 'hud:rects'; rects: NormalizedUvRect[] },
      ) => void)
    | null = null
  let stopRecordingImpl:
    | (() => Promise<SceneRecordingStopResult | null>)
    | null = null
  let enterReplayImpl:
    | ((
        session: UnpackedRecordingSession,
        replayCallbacks?: SceneReplayCallbacks,
      ) => SceneReplayHandle | null)
    | null = null

  const scanListeners = new Set<(scan: BarcodeScanEvent) => void>()

  const channel = createSceneBroadcastChannel()
  if (typeof window !== 'undefined') {
    window.quixposSceneChannel = channel
  }

  let lastBroadcastView: NavPresetId | null = 'total'
  const sceneCallbacks: SceneCallbacks = {
    onActiveViewChange: (view) => {
      callbacks.onActiveViewChange(view)
      if (view !== lastBroadcastView) {
        lastBroadcastView = view
        channel.send('camera:viewChanged', { view })
      }
    },
    onDrawerChange: (isOpen) => {
      callbacks.onDrawerChange(isOpen)
      channel.send('drawer:changed', { open: isOpen })
    },
    onHeldModeChange: callbacks.onHeldModeChange,
    onBarcodeScan: (scan) => {
      callbacks.onBarcodeScan?.(scan)
      for (const cb of Array.from(scanListeners)) {
        cb(scan)
      }
    },
  }

  Promise.all([
    import('three'),
    import('three/examples/jsm/renderers/CSS3DRenderer.js'),
  ]).then(([THREE, { CSS3DRenderer, CSS3DObject }]) => {
    if (disposed) return

    const disposables: Disposable[] = []

    // 1. Renderers (on touch/mobile, CSS3D sits above opaque WebGL so cross-origin iframes composite reliably)
    const webglRenderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: !touchCapable,
      powerPreference: 'high-performance',
    })
    webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    webglRenderer.setSize(stageEl.clientWidth, stageEl.clientHeight)
    webglRenderer.shadowMap.enabled = true
    webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap
    webglRenderer.localClippingEnabled = true
    webglRenderer.outputColorSpace = THREE.SRGBColorSpace

    const cssRenderer = new CSS3DRenderer({ element: cssLayerEl })
    cssRenderer.setSize(stageEl.clientWidth, stageEl.clientHeight)

    // Dedicated offscreen render target for live optical spot screenshots around the laser crosshair
    const scanRT = new THREE.WebGLRenderTarget(SCAN_RT_W, SCAN_RT_H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
    })
    disposables.push(scanRT)
    const scanPixelBuf = new Uint8Array(SCAN_RT_W * SCAN_RT_H * 4)

    // 2. Scenes & Camera
    const webglScene = new THREE.Scene()
    webglScene.background = new THREE.Color('#dce8f0')
    webglScene.fog = new THREE.Fog('#dce8f0', 48000, 150000)

    const cssScene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(
      58,
      stageEl.clientWidth / Math.max(1, stageEl.clientHeight),
      120,
      160000,
    )
    camera.rotation.order = 'YXZ'
    camera.position.set(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z)
    camera.rotation.set(SPAWN_PITCH, SPAWN_YAW, 0, 'YXZ')

    const focusBlurPass = createFocusBlurPass(
      THREE,
      webglRenderer,
      webglScene,
      camera,
      stageEl.clientWidth,
      stageEl.clientHeight,
      webglRenderer.getPixelRatio(),
    )
    disposables.push(focusBlurPass)

    // 3. Environment & POS Hardware Models
    const { floorMesh, updateBerlinTimeLighting } = buildLightingAndFloor(
      THREE,
      webglScene,
      disposables,
    )
    const { tableMeshes } = buildTable(THREE, webglScene, disposables)

    const broadcastShelvesUpdated = (products: ShelfProductSummary[]) => {
      const slotSet = new Set<string>()
      let totalStock = 0
      let renderedBoxes = 0
      for (const p of products) {
        totalStock += p.stock
        renderedBoxes += p.renderedBoxes
        for (const sid of p.slotIds) slotSet.add(sid)
      }
      channel.send('shelves:updated', {
        totalProducts: products.length,
        totalStock,
        renderedBoxes,
        slotsUsed: slotSet.size,
        products,
      })
    }

    const shelvesController = buildWallsAndShelves(
      THREE,
      webglScene,
      disposables,
      broadcastShelvesUpdated,
    )
    const { wallAndShelfSurfaceMeshes } = shelvesController

    const {
      tabletInstances,
      cutoutTargets,
      powerTargets,
      fullscreenTargets,
      tabletSurfaceMeshes,
      cutoutOnMat,
      screenOffMat,
      camDotOnMat,
      camDotOffMat,
      powerIdleTex,
      powerActiveTex,
      powerOffTex,
      fullscreenIdleTex,
      fullscreenActiveTex,
    } = buildTablets(
      THREE,
      CSS3DObject,
      webglScene,
      cssScene,
      touchCapable,
      disposables,
    )

    const {
      drawerTrayGroup,
      cashBtnMesh,
      drawerBtnFaceMat,
      openBtnTex,
      closeBtnTex,
      drawerTargets,
      setCashAmount,
      setCashCents,
      getCashBreakdown,
      updateCoinPhysics,
      drawerSurfaceMeshes,
    } = buildCashDrawer(THREE, webglScene, disposables)

    const { loupeInstances, plateTargets } = buildStationLoupes(
      THREE,
      webglScene,
      disposables,
    )

    const { printerNetLedMat, epsonSurfaceMeshes } = buildEpsonPrinter(
      THREE,
      webglScene,
      disposables,
    )
    const {
      zebraTargets,
      zebraLatchMat,
      setZebraReelVisual,
      zebraSurfaceMeshes,
    } = buildZebraPrinter(THREE, webglScene, disposables)
    setZebraReelVisual(activeZebraMedia.widthMm)

    const {
      scannerGroup,
      laserVisualsGroup,
      scannerTargets,
      scannerDockTargets,
      updateScannerPose,
    } = buildBarcodeScanner(THREE, webglScene, disposables)

    const printManager = createPrintManager(
      THREE,
      webglScene,
      printerNetLedMat,
      {
        maxAnisotropy: webglRenderer.capabilities.getMaxAnisotropy(),
        drawerTrayGroup,
      },
    )
    printManager.setZebraMedia(activeZebraMedia)
    disposables.push(printManager)

    // Solid 3D surfaces where Zebra labels can be placed (tabletop, legs, printers, drawer, monitor stands/bezels, walls, shelves, floor)
    const placeableBaseSurfaces: Array<InstanceType<typeof THREE.Object3D>> = [
      ...tableMeshes,
      ...wallAndShelfSurfaceMeshes,
      ...drawerSurfaceMeshes,
      ...zebraSurfaceMeshes,
      ...epsonSurfaceMeshes,
      ...tabletSurfaceMeshes,
      floorMesh,
    ]

    // 4. Runtime State & Input Controller
    const state: SceneRuntimeState = {
      yaw: SPAWN_YAW,
      pitch: SPAWN_PITCH,
      targetYaw: SPAWN_YAW,
      targetPitch: SPAWN_PITCH,
      velX: 0,
      velZ: 0,
      pointerLocked: false,
      dragTurning: false,
      activeView: 'total',
      fullscreenTabletId: null,
      poseHistory: [],
      cameraTween: null,
      lastMouseX: -9999,
      lastMouseY: -9999,
      pressedKeys: new Set<string>(),
      mouseMoveX: 0,
      mouseMoveY: 0,
      touchMoveX: 0,
      touchMoveY: 0,
      touchAimX: 0,
      touchAimY: 0,
      moveStickEngaged: false,
      aimStickEngaged: false,
      zoomEngaged: false,
      zoomNorm: DEFAULT_ZOOM_NORM,
      targetZoomNorm: DEFAULT_ZOOM_NORM,
      mouseAimVisualX: 0,
      mouseAimVisualY: 0,
    }

    let heldMode: HeldItemMode = 'none'
    let scannerTriggerAnim = 0
    let scanSuccessFlash = 0
    let scannerHover = 0
    let scannerDockHover = 0
    let lastScanPreviewMs = 0
    let scanDecodeBusy = false
    let pendingScanTrigger = false

    let drawerOpen = false
    const drawerMotion = createDrawerMotionState()
    let pendingDrawerKickDv = 0
    let btnPressAnim = 0
    let cashBtnHover = 0

    let keyStickVisualX = 0
    let keyStickVisualY = 0
    let smoothKeyForward = 0
    let smoothKeyRight = 0
    let mouseStickVisualX = 0
    let mouseStickVisualY = 0

    let refreshInputShield: (() => void) | null = null

    // Recording & Replay state
    let recordingActive = false
    let recordStartPerfNow = 0
    let recordInitialSnapshot: RecordedInitialSnapshot | null = null
    let recordTabletsGeo: RecordedTabletGeometry[] = []
    let recordedFrames: RecordedFrameTuple[] = []
    let recordedEvents: RecordedSceneEvent[] = []
    let recordOnStats: SceneRecordingStartOptions['onStats']
    let recordPaintSyncStamp: SceneRecordingStartOptions['paintSyncStamp']
    let lastRecordStatsMs = 0
    let lastRecordedActiveView: NavPresetId | null = 'total'
    let lastRecordedFullscreenId: string | null = null

    interface ActiveReplayState {
      session: UnpackedRecordingSession
      projector: TabletVideoProjector
      callbacks?: SceneReplayCallbacks
      cameraFollow: ReplayCameraFollowMode
      currentTimeMs: number
      appliedEventIndex: number
      appliedTimeMs: number
      appliedCashCents: number
      recPoseCam: InstanceType<typeof THREE.PerspectiveCamera>
      fallbackSample: InterpolatedFrameSample
      savedLiveState: {
        activeView: NavPresetId | null
        fullscreenTabletId: string | null
        camX: number
        camY: number
        camZ: number
        yaw: number
        pitch: number
        zoomNorm: number
        drawerOpen: boolean
        cashCents: number
        zebraReelId: ZebraReelId
        shelfProducts: ShelfProductInput[]
        screens: Array<{
          id: string
          poweredOn: boolean
          enabledByMain: boolean
        }>
      }
    }
    let replayState: ActiveReplayState | null = null

    type DistributiveOmitT<U> = U extends unknown ? Omit<U, 't'> : never
    const getRecordElapsedMs = () =>
      Math.max(0, Math.round(performance.now() - recordStartPerfNow))

    const pushRecordedEvent = (ev: DistributiveOmitT<RecordedSceneEvent>) => {
      if (!recordingActive || replayState !== null) return
      recordedEvents.push({
        ...(ev as Record<string, unknown>),
        t: getRecordElapsedMs(),
      } as RecordedSceneEvent)
    }

    const setHeldMode = (nextMode: HeldItemMode) => {
      if (heldMode === nextMode) return
      heldMode = nextMode
      if (nextMode !== 'scanner') {
        laserReticleRef?.current?.classList.remove('is-visible', 'is-hit')
      }
      refreshInputShield?.()
      sceneCallbacks.onHeldModeChange?.(nextMode)
    }

    const pickUpZebraLabel = (
      target: InstanceType<typeof THREE.Object3D> | string,
    ): boolean => {
      if (replayState) return false
      if (heldMode !== 'none') return false
      if (printManager.pickUpLabel(target)) {
        setHeldMode('label')
        const info = printManager.getHeldLabelInfo()
        if (info) {
          pushRecordedEvent({ type: 'label:pickup', sheetId: info.sheetId })
        }
        return true
      }
      return false
    }

    const commitHeldLabelPlacement = (
      clientX?: number,
      clientY?: number,
    ): boolean => {
      if (replayState) return false
      if (heldMode !== 'label') return false
      if (typeof clientX === 'number' && typeof clientY === 'number') {
        const rect = stageEl.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          const ndc = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
          )
          raycaster.setFromCamera(ndc, camera)
          printManager.updateHeldLabelPreview(
            raycaster,
            camera,
            state.yaw,
            [
              ...placeableBaseSurfaces,
              ...shelvesController.getBoxSurfaceMeshes(),
              ...printManager.getPlacedLabelSurfaces(),
            ],
            1,
          )
        }
      }
      const placed = printManager.placeHeldLabel()
      if (placed) {
        setHeldMode('none')
        pushRecordedEvent({
          type: 'label:place',
          ...placed,
        })
        return true
      }
      return false
    }

    const handleRotateHeldLabel = () => {
      if (replayState) return
      printManager.rotateHeldLabel()
      const info = printManager.getHeldLabelInfo()
      if (info) {
        pushRecordedEvent({ type: 'label:rotate', yawOffset: info.yawOffset })
      }
    }

    const pickUpScanner = () => {
      if (replayState) return
      if (heldMode === 'label') {
        const info = printManager.getHeldLabelInfo()
        printManager.cancelHeldLabel()
        pushRecordedEvent({ type: 'label:cancel', sheetId: info?.sheetId })
      }
      warmScannerDecoder()
      pendingScanTrigger = false
      scannerTriggerAnim = 0.65
      setHeldMode('scanner')
      pushRecordedEvent({ type: 'scanner:pickup' })
    }

    const putDownScanner = () => {
      if (replayState) return
      if (heldMode !== 'scanner') return
      pendingScanTrigger = false
      setHeldMode('none')
      pushRecordedEvent({ type: 'scanner:putdown' })
    }

    const toggleScanner = () => {
      if (replayState) return
      if (heldMode === 'scanner') {
        putDownScanner()
      } else {
        pickUpScanner()
      }
    }

    const triggerScannerPulse = () => {
      if (replayState) return
      if (heldMode !== 'scanner') return
      scannerTriggerAnim = 1
      pendingScanTrigger = true
      pushRecordedEvent({ type: 'scanner:pulse' })
    }

    const cancelHeldItem = () => {
      if (replayState) return
      if (heldMode === 'label') {
        const info = printManager.getHeldLabelInfo()
        printManager.cancelHeldLabel()
        setHeldMode('none')
        pushRecordedEvent({ type: 'label:cancel', sheetId: info?.sheetId })
      } else if (heldMode === 'scanner') {
        putDownScanner()
      }
    }

    const setCashDrawerOpen = (nextOpen: boolean, fromReplay = false) => {
      if (replayState && !fromReplay) return
      if (drawerOpen === nextOpen) return
      drawerOpen = nextOpen
      pendingDrawerKickDv += setDrawerMotionTarget(
        drawerMotion,
        nextOpen,
        DRAWER_OPEN_OFFSET,
      )
      btnPressAnim = 1
      drawerBtnFaceMat.map = drawerOpen ? closeBtnTex : openBtnTex
      drawerBtnFaceMat.needsUpdate = true
      if (!fromReplay) {
        pushRecordedEvent({ type: 'drawer:state', open: drawerOpen })
      }
      sceneCallbacks.onDrawerChange(drawerOpen)
    }

    const toggleCashDrawer = () => {
      if (replayState) return
      setCashDrawerOpen(!drawerOpen)
    }

    const ensureCashDrawerOpen = () => {
      if (replayState) return
      setCashDrawerOpen(true)
    }

    const LOGIN_PROMPT_DURATION = 2.6

    const getControllableScreensMap = (): Record<
      string,
      ScreenPowerSummary
    > => {
      const result: Record<string, ScreenPowerSummary> = {}
      for (const t of tabletInstances) {
        if (!t.spec.canControlScreens) {
          result[t.spec.id] = {
            id: t.spec.id,
            title: t.spec.title,
            subtitle: t.spec.subtitle,
            poweredOn: t.poweredOn,
            enabled: t.enabledByMain,
          }
        }
      }
      return result
    }

    const applyTabletPowerButtonVisual = (
      target: (typeof tabletInstances)[number],
    ) => {
      if (target.poweredOn) {
        target.powerFaceMat.map = powerIdleTex
        target.powerFaceMat.emissive.set('#0f9f86')
        target.powerFaceMat.emissiveIntensity = 0.35
      } else {
        target.powerFaceMat.map = powerOffTex
        target.powerFaceMat.emissive.set('#334155')
        target.powerFaceMat.emissiveIntensity = 0.12
      }
      target.powerFaceMat.needsUpdate = true
    }

    const triggerLoginFirstPrompt = (
      target: (typeof tabletInstances)[number],
      fromReplay = false,
    ) => {
      target.powerPressAnim = 1
      target.reloadFlash = 0.55
      target.loginPromptTimer = LOGIN_PROMPT_DURATION
      target.powerFaceMat.map = powerActiveTex
      target.powerFaceMat.emissive.set('#f59e0b')
      target.powerFaceMat.emissiveIntensity = 0.75
      target.powerFaceMat.needsUpdate = true
      if (!fromReplay) {
        pushRecordedEvent({
          type: 'tablet:powerBlocked',
          tabletId: target.spec.id,
        })
        channel.send('screen:powerBlocked', {
          tabletId: target.spec.id,
          reason: 'login_required',
        })
      }
    }

    const setSingleTabletPower = (
      tabletId: string,
      nextOn: boolean,
      broadcast = true,
      nextEnabled?: boolean,
    ): boolean => {
      if (replayState) return false
      const target = tabletInstances.find((t) => t.spec.id === tabletId)
      if (!target || target.spec.canControlScreens) return false

      const resolvedEnabled =
        typeof nextEnabled === 'boolean'
          ? nextEnabled
          : nextOn
            ? true
            : target.enabledByMain

      const powerChanged = target.poweredOn !== nextOn
      const enabledChanged = target.enabledByMain !== resolvedEnabled
      if (!powerChanged && !enabledChanged) return false

      target.enabledByMain = resolvedEnabled

      if (powerChanged) {
        target.poweredOn = nextOn
        target.powerPressAnim = 1
        target.powerUserData.poweredOn = nextOn
        target.cutoutMesh.userData.poweredOn = nextOn

        if (nextOn) {
          target.loginPromptTimer = 0
          target.loginOsdMesh.visible = false
          target.loginOsdMat.opacity = 0

          target.reloadFlash = 0.65
          target.powerFaceMat.map = powerActiveTex
          target.powerFaceMat.emissive.set('#f59e0b')
          target.powerFaceMat.emissiveIntensity = 0.75
          target.powerFaceMat.needsUpdate = true

          target.cutoutMesh.material = cutoutOnMat
          if (!touchCapable) {
            target.cutoutMesh.layers.enable(FOCUS_SHARP_LAYER)
          }
          target.camDot.material = camDotOnMat
          target.cssObject.visible = true
          target.wrapperEl.style.visibility = 'visible'
          // Mount wrapperEl into CSS3DRenderer's DOM tree before navigating src
          cssRenderer.render(cssScene, camera)
          target.iframeEl.src = target.spec.url
        } else {
          target.reloadFlash = 0
          applyTabletPowerButtonVisual(target)

          channel.notifyTabletReloading(target.spec.id)
          target.cutoutMesh.material = screenOffMat
          if (!touchCapable) {
            target.cutoutMesh.layers.disable(FOCUS_SHARP_LAYER)
          }
          target.camDot.material = camDotOffMat
          target.cssObject.visible = false
          target.wrapperEl.style.visibility = 'hidden'
          target.wrapperEl.style.pointerEvents = 'none'
          target.iframeEl.style.pointerEvents = 'none'
          if (document.activeElement === target.iframeEl) {
            window.focus()
          }
          target.iframeEl.src = 'about:blank'
          if (!target.enabledByMain) {
            clearPendingPairing(target.spec.id)
          }
        }
      }

      pushRecordedEvent({
        type: 'tablet:power',
        tabletId: target.spec.id,
        poweredOn: target.poweredOn,
        enabled: target.enabledByMain,
      })

      if (broadcast) {
        channel.send('screens:changed', {
          tabletId: target.spec.id,
          poweredOn: target.poweredOn,
          enabled: target.enabledByMain,
          screens: getControllableScreensMap(),
        })
      }
      return true
    }

    const setMultipleTabletsPower = (
      ids: string[],
      nextOn: boolean,
      nextEnabled?: boolean,
    ) => {
      let lastChangedId: string | null = null
      let changedCount = 0
      for (const id of ids) {
        if (setSingleTabletPower(id, nextOn, false, nextEnabled)) {
          lastChangedId = id
          changedCount++
        }
      }
      if (changedCount > 0) {
        channel.send('screens:changed', {
          tabletId: changedCount === 1 ? lastChangedId : undefined,
          poweredOn: nextOn,
          screens: getControllableScreensMap(),
        })
      }
    }

    const reloadTablet = (tabletId: string) => {
      if (replayState) return
      const target = tabletInstances.find((t) => t.spec.id === tabletId)
      if (!target || !target.poweredOn) return
      target.powerPressAnim = 1
      target.reloadFlash = 1
      target.powerFaceMat.map = powerActiveTex
      target.powerFaceMat.emissive.set('#f59e0b')
      target.powerFaceMat.emissiveIntensity = 0.75
      target.powerFaceMat.needsUpdate = true

      pushRecordedEvent({ type: 'tablet:reload', tabletId })
      channel.notifyTabletReloading(tabletId)
      if (target.spec.canControlScreens) {
        clearPendingPairing()
      }
      target.iframeEl.src = 'about:blank'
      requestAnimationFrame(() => {
        if (!disposed && target.poweredOn) {
          target.iframeEl.src = target.spec.url
        }
      })
    }

    const handleBezelPowerButton = (tabletId: string) => {
      if (replayState) return
      const target = tabletInstances.find((t) => t.spec.id === tabletId)
      if (!target) return
      if (target.spec.canControlScreens) {
        reloadTablet(tabletId)
        return
      }
      if (target.poweredOn) {
        // Keep enabledByMain intact so an already-enabled monitor can be switched back on manually
        setSingleTabletPower(tabletId, false, true, target.enabledByMain)
        return
      }
      if (!target.enabledByMain) {
        triggerLoginFirstPrompt(target)
        return
      }
      setSingleTabletPower(tabletId, true, true, true)
    }

    const raycaster = new THREE.Raycaster()

    const {
      navigateToFocusView,
      returnToPreviousPose,
      clearActiveFocusForFreeMove,
      refreshCursorAndShield,
      beginExternalLook,
      applyExternalLookDelta,
      endExternalLook,
      cleanup: cleanupInput,
    } = attachInputController({
      stageEl,
      THREE,
      camera,
      raycaster,
      state,
      tabletInstances,
      plateTargets,
      drawerTargets,
      powerTargets,
      fullscreenTargets,
      zebraTargets,
      scannerTargets,
      scannerDockTargets,
      getZebraLabelTargets: () => printManager.getZebraLabelTargets(),
      getHeldMode: () => heldMode,
      canPlaceHeldLabel: () => printManager.canPlaceHeldLabel(),
      pickUpZebraLabel,
      placeHeldLabel: commitHeldLabelPlacement,
      rotateHeldLabel: handleRotateHeldLabel,
      cancelHeldItem,
      pickUpScanner,
      putDownScanner,
      toggleScanner,
      triggerScannerPulse,
      stickRefs,
      callbacks: sceneCallbacks,
      toggleCashDrawer,
      ensureCashDrawerOpen,
      reloadTablet: handleBezelPowerButton,
      openZebraReelPicker: () => {
        if (replayState) return
        pushRecordedEvent({ type: 'zebra:pickerModal', open: true })
        callbacks.onZebraReelPickerOpen?.()
      },
    })
    refreshInputShield = refreshCursorAndShield

    const validFocusViews = new Set<NavPresetId>([
      'total',
      'left',
      'center',
      'right',
      'drawer',
    ])

    let pendingPairingHost = ''
    let pendingPairingOrigin = ''
    const pendingPairingByTablet = new Map<string, PosPairingEntry>()

    const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v)

    const normalizePairingEntry = (
      raw: unknown,
      fallbackTabletId: string,
      fallbackHost: string,
      fallbackOrigin: string,
      fallbackName?: string,
    ): PosPairingEntry | null => {
      if (!isPlainRecord(raw)) return null
      const pin = typeof raw.pin === 'string' ? raw.pin.trim() : ''
      if (!pin) return null
      const tabletId =
        typeof raw.tabletId === 'string' && raw.tabletId.trim()
          ? raw.tabletId.trim()
          : fallbackTabletId
      if (!tabletId) return null
      const host =
        typeof raw.host === 'string' && raw.host.trim()
          ? raw.host.trim()
          : fallbackHost
      const origin =
        typeof raw.origin === 'string' && raw.origin.trim()
          ? raw.origin.trim()
          : fallbackOrigin
      return {
        ...raw,
        id:
          typeof raw.id === 'number' || typeof raw.id === 'string'
            ? raw.id
            : undefined,
        name:
          typeof raw.name === 'string' && raw.name.trim()
            ? raw.name.trim()
            : fallbackName,
        pin,
        tabletId,
        host,
        origin,
        created: typeof raw.created === 'boolean' ? raw.created : undefined,
      }
    }

    const storePairingFromMain = (data: Record<string, unknown>) => {
      const host = typeof data.host === 'string' ? data.host.trim() : ''
      const origin = typeof data.origin === 'string' ? data.origin.trim() : ''
      if (host) pendingPairingHost = host
      if (origin) pendingPairingOrigin = origin

      const nextEntries = new Map<string, PosPairingEntry>()
      if (isPlainRecord(data.byTabletId)) {
        for (const [tabletId, rawEntry] of Object.entries(data.byTabletId)) {
          const entry = normalizePairingEntry(
            rawEntry,
            tabletId,
            pendingPairingHost,
            pendingPairingOrigin,
          )
          if (entry) nextEntries.set(entry.tabletId, entry)
        }
      }
      if (isPlainRecord(data.terminals)) {
        for (const [termName, rawEntry] of Object.entries(data.terminals)) {
          const entry = normalizePairingEntry(
            rawEntry,
            '',
            pendingPairingHost,
            pendingPairingOrigin,
            termName,
          )
          if (entry && !nextEntries.has(entry.tabletId)) {
            nextEntries.set(entry.tabletId, entry)
          }
        }
      }

      for (const [tabletId, entry] of nextEntries) {
        pendingPairingByTablet.set(tabletId, entry)
      }
    }

    const clearPendingPairing = (tabletId?: string) => {
      if (tabletId) {
        pendingPairingByTablet.delete(tabletId)
        if (pendingPairingByTablet.size === 0) {
          pendingPairingHost = ''
          pendingPairingOrigin = ''
        }
      } else {
        pendingPairingByTablet.clear()
        pendingPairingHost = ''
        pendingPairingOrigin = ''
      }
    }

    const buildPairingPayloadForTablet = (
      tabletId: string,
    ): PosPairingPayload | null => {
      const targetEntry = pendingPairingByTablet.get(tabletId)
      if (!targetEntry) return null

      const terminals: Record<string, PosPairingEntry> = {}
      const byTabletId: Record<string, PosPairingEntry> = {}
      for (const [tid, entry] of pendingPairingByTablet) {
        byTabletId[tid] = entry
        const termKey =
          typeof entry.name === 'string' && entry.name ? entry.name : tid
        terminals[termKey] = entry
      }

      return {
        host: pendingPairingHost || targetEntry.host,
        origin: pendingPairingOrigin || targetEntry.origin || '',
        terminals,
        byTabletId,
      }
    }

    const deliverPendingPairingToTablet = (tabletId: string) => {
      const payload = buildPairingPayloadForTablet(tabletId)
      if (!payload) return
      channel.sendTo(tabletId, 'pos:pairing', payload)
    }

    channel.attachTablets(
      tabletInstances,
      () => ({
        activeView: state.activeView,
        drawerOpen,
        pointerLocked: state.pointerLocked,
        screens: getControllableScreensMap(),
        zebraMedia: activeZebraMedia,
      }),
      (loadedTabletId) => {
        deliverPendingPairingToTablet(loadedTabletId)
      },
    )

    // Render CSS3D once first so CSS3DRenderer appends powered-on wrapper elements
    // into the live DOM before assigning iframe.src (avoids aborted navigation on Mobile Chrome)
    cssRenderer.render(cssScene, camera)
    for (const t of tabletInstances) {
      if (t.poweredOn) {
        t.iframeEl.src = t.spec.url
      }
    }

    const isAuthorizedScreenController = (sender: string): boolean => {
      if (sender === 'host') return true
      const senderTablet = tabletInstances.find((t) => t.spec.id === sender)
      return Boolean(senderTablet?.spec.canControlScreens)
    }

    const resolveTargetScreenIds = (
      data: Record<string, unknown>,
    ): string[] => {
      if (data.all === true) {
        return tabletInstances
          .filter((t) => !t.spec.canControlScreens)
          .map((t) => t.spec.id)
      }
      if (Array.isArray(data.tabletIds)) {
        return data.tabletIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )
      }
      if (typeof data.tabletId === 'string' && data.tabletId) {
        return [data.tabletId]
      }
      return []
    }

    channel.on('input:middleClick', () => {
      toggleScanner()
    })

    channel.on('input:lookStart', () => {
      beginExternalLook()
    })

    channel.on('input:lookMove', (data) => {
      const dx = typeof data.dx === 'number' ? data.dx : 0
      const dy = typeof data.dy === 'number' ? data.dy : 0
      if (dx !== 0 || dy !== 0) {
        applyExternalLookDelta(dx, dy)
      }
    })

    channel.on('input:lookEnd', () => {
      endExternalLook()
    })

    channel.on('screen:on', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      setMultipleTabletsPower(resolveTargetScreenIds(data), true, true)
    })

    channel.on('screen:off', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      const keepEnabled = data.keepEnabled === true
      setMultipleTabletsPower(resolveTargetScreenIds(data), false, keepEnabled)
    })

    channel.on('screen:enable', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      const ids = resolveTargetScreenIds(data)
      const alsoPowerOn = data.powerOn === true
      let changed = false
      for (const id of ids) {
        const target = tabletInstances.find((t) => t.spec.id === id)
        if (!target || target.spec.canControlScreens) continue
        if (
          setSingleTabletPower(
            id,
            alsoPowerOn ? true : target.poweredOn,
            false,
            true,
          )
        ) {
          changed = true
        }
      }
      if (changed) {
        channel.send('screens:changed', {
          screens: getControllableScreensMap(),
        })
      }
    })

    channel.on('screen:disable', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      setMultipleTabletsPower(resolveTargetScreenIds(data), false, false)
    })

    channel.on('screen:power', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      const nextOn =
        typeof data.poweredOn === 'boolean'
          ? data.poweredOn
          : typeof data.on === 'boolean'
            ? data.on
            : null
      if (nextOn === null) return
      const explicitEnabled =
        typeof data.enabled === 'boolean' ? data.enabled : nextOn
      setMultipleTabletsPower(
        resolveTargetScreenIds(data),
        nextOn,
        explicitEnabled,
      )
    })

    channel.on('screen:toggle', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      const ids = resolveTargetScreenIds(data)
      for (const id of ids) {
        const target = tabletInstances.find((t) => t.spec.id === id)
        if (target && !target.spec.canControlScreens) {
          const nextOn = !target.poweredOn
          setSingleTabletPower(
            id,
            nextOn,
            true,
            nextOn ? true : target.enabledByMain,
          )
        }
      }
    })

    channel.on('screens:get', (_data, meta) => {
      meta.reply('screens:state', {
        screens: getControllableScreensMap(),
      })
    })

    channel.on('pos:pairing', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      storePairingFromMain(data)
    })

    channel.on('pos:pairing:get', (_data, meta) => {
      const payload = buildPairingPayloadForTablet(meta.sender)
      if (payload) {
        meta.reply('pos:pairing', payload)
      }
    })

    channel.on('pos:pairing:consumed', (data, meta) => {
      const existing = pendingPairingByTablet.get(meta.sender)
      if (!existing) return
      const consumedPin = typeof data.pin === 'string' ? data.pin.trim() : ''
      if (!consumedPin || consumedPin === existing.pin) {
        clearPendingPairing(meta.sender)
      }
    })

    channel.on('pos:pairing:clear', (data, meta) => {
      if (!isAuthorizedScreenController(meta.sender)) return
      const targetId =
        typeof data.tabletId === 'string' && data.tabletId.trim()
          ? data.tabletId.trim()
          : undefined
      clearPendingPairing(targetId)
    })

    channel.on('scene:ping', (_data, meta) => {
      deliverPendingPairingToTablet(meta.sender)
    })

    channel.on('drawer:open', () => {
      setCashDrawerOpen(true)
    })
    channel.on('drawer:close', () => {
      setCashDrawerOpen(false)
    })
    channel.on('drawer:toggle', () => {
      toggleCashDrawer()
    })

    const applyDrawerCashFromChannel = (data: Record<string, unknown>) => {
      if (replayState) return
      let breakdown = null
      if (typeof data.cents === 'number' && Number.isFinite(data.cents)) {
        breakdown = setCashCents(data.cents)
      } else if (
        typeof data.amountCents === 'number' &&
        Number.isFinite(data.amountCents)
      ) {
        breakdown = setCashCents(data.amountCents)
      } else if (
        typeof data.amount === 'number' &&
        Number.isFinite(data.amount)
      ) {
        breakdown = setCashAmount(data.amount)
      } else if (typeof data.amount === 'string') {
        const parsed = Number(data.amount.replace(',', '.'))
        if (Number.isFinite(parsed)) {
          breakdown = setCashAmount(parsed)
        }
      }
      if (!breakdown) return
      pushRecordedEvent({ type: 'drawer:cash', cents: breakdown.cents })
      channel.send('drawer:cashChanged', {
        currency: 'EUR',
        amount: breakdown.amount,
        cents: breakdown.cents,
        notes: breakdown.notes,
        coins: breakdown.coins,
      })
    }

    channel.on('drawer:setCash', (data) => {
      applyDrawerCashFromChannel(data)
    })
    channel.on('drawer:cash', (data) => {
      applyDrawerCashFromChannel(data)
    })
    channel.on('camera:focus', (data) => {
      if (replayState) return
      const view = data.view as NavPresetId
      if (validFocusViews.has(view)) {
        navigateToFocusView(view)
      }
    })
    channel.on('camera:return', () => {
      if (replayState) return
      returnToPreviousPose()
    })
    channel.on('tablet:reload', (data, meta) => {
      if (replayState) return
      const targetId =
        typeof data.tabletId === 'string' && data.tabletId
          ? data.tabletId
          : meta.sender
      reloadTablet(targetId)
    })

    const applyZebraReel = (
      reelId: ZebraReelId,
      broadcast = true,
      fromReplay = false,
    ) => {
      if (replayState && !fromReplay) return
      const next = getZebraReelById(reelId)
      activeZebraMedia = next
      printManager.setZebraMedia(next)
      setZebraReelVisual(next.widthMm)
      callbacks.onZebraReelChange?.(next)
      if (!fromReplay) {
        pushRecordedEvent({ type: 'zebra:reel', reelId: next.id })
      }
      if (broadcast && !fromReplay) {
        channel.send('printer:mediaChanged', {
          printer: 'zebra',
          ...next,
        })
      }
    }

    const replyZebraMedia = (
      reply: (name: string, data?: Record<string, unknown>) => void,
    ) => {
      reply('printer:media', {
        printer: 'zebra',
        ...activeZebraMedia,
      })
    }

    channel.on('printer:info', (_data, meta) => {
      replyZebraMedia(meta.reply)
    })
    channel.on('printer:media:get', (_data, meta) => {
      replyZebraMedia(meta.reply)
    })

    const handleZplChannelJob = (
      data: Record<string, unknown>,
      sender: string,
      origin?: string,
      messageName = 'printer:zpl',
    ) => {
      if (replayState) return
      const rawZpl =
        typeof data.zpl === 'string'
          ? data.zpl
          : typeof data.raw === 'string'
            ? data.raw
            : typeof data.content === 'string'
              ? data.content
              : ''
      if (!rawZpl.trim()) return

      const jobId = typeof data.jobId === 'string' ? data.jobId : undefined
      const outcome = printManager.printZpl(rawZpl, {
        sender,
        origin,
        messageName,
        jobId,
      })
      pushRecordedEvent({
        type: 'print:zpl',
        sheetId: outcome.sheetId,
        zpl: rawZpl,
        jobId,
        sender,
      })
      channel.send('printer:printed', {
        printer: 'zebra',
        protocol: 'zpl',
        jobId,
        droppedPrevious: outcome.droppedPrevious,
        requestedBy: sender,
        dpi: outcome.dpi,
        widthPx: outcome.widthPx,
        heightPx: outcome.heightPx,
      })
    }

    const handleEscPosChannelJob = (
      data: Record<string, unknown>,
      sender: string,
      origin?: string,
      messageName = 'printer:escpos',
    ) => {
      if (replayState) return
      const hasPayload =
        typeof data.escpos === 'string' ||
        typeof data.base64 === 'string' ||
        typeof data.raw === 'string' ||
        typeof data.data === 'string' ||
        Array.isArray(data.bytes) ||
        Array.isArray(data.data) ||
        data.bytes instanceof Uint8Array
      if (!hasPayload) return

      const jobId = typeof data.jobId === 'string' ? data.jobId : undefined
      const outcome = printManager.printEscPos(data, {
        sender,
        origin,
        messageName,
        jobId,
      })
      pushRecordedEvent({
        type: 'print:escpos',
        sheetId: outcome.sheetId,
        base64: outcome.escposBase64 ?? '',
        jobId,
        sender,
        kickDrawer: outcome.kickDrawer,
      })
      if (outcome.kickDrawer) {
        setCashDrawerOpen(true)
      }
      channel.send('printer:printed', {
        printer: 'epson',
        protocol: 'escpos',
        jobId,
        droppedPrevious: outcome.droppedPrevious,
        requestedBy: sender,
        dpi: outcome.dpi,
        widthPx: outcome.widthPx,
        heightPx: outcome.heightPx,
      })
    }

    channel.on('printer:zpl', (data, meta) => {
      handleZplChannelJob(data, meta.sender, meta.origin, meta.name)
    })
    channel.on('print:zpl', (data, meta) => {
      handleZplChannelJob(data, meta.sender, meta.origin, meta.name)
    })
    channel.on('printer:escpos', (data, meta) => {
      handleEscPosChannelJob(data, meta.sender, meta.origin, meta.name)
    })
    channel.on('print:escpos', (data, meta) => {
      handleEscPosChannelJob(data, meta.sender, meta.origin, meta.name)
    })

    const handleSetShelfProducts = (data: Record<string, unknown>) => {
      if (replayState) return
      const list = Array.isArray(data.products)
        ? data.products
        : Array.isArray(data.items)
          ? data.items
          : null
      if (!list) return
      const valid = list.filter(isPlainRecord) as unknown as ShelfProductInput[]
      shelvesController.setProducts(valid)
      pushRecordedEvent({
        type: 'shelves:setProducts',
        products: shelvesController.getProductsSnapshot(),
      })
    }

    const handleUpsertShelfProduct = (data: Record<string, unknown>) => {
      if (replayState) return
      const raw = isPlainRecord(data.product) ? data.product : data
      if (raw.id === undefined && typeof raw.sku !== 'string') return
      const normalized = {
        ...raw,
        id:
          raw.id !== undefined && raw.id !== null
            ? (raw.id as string | number)
            : String(raw.sku),
      } as Partial<ShelfProductInput> & { id: string | number }
      shelvesController.upsertProduct(normalized)
      pushRecordedEvent({
        type: 'shelves:upsertProduct',
        product: normalized,
      })
    }

    channel.on('shelves:setProducts', (data) => {
      handleSetShelfProducts(data)
    })
    channel.on('inventory:setProducts', (data) => {
      handleSetShelfProducts(data)
    })
    channel.on('shelves:upsertProduct', (data) => {
      handleUpsertShelfProduct(data)
    })
    channel.on('shelves:updateStock', (data) => {
      handleUpsertShelfProduct(data)
    })
    channel.on('shelves:clear', () => {
      if (replayState) return
      shelvesController.clearProducts()
      pushRecordedEvent({ type: 'shelves:clear' })
    })
    channel.on('shelves:getSlots', (_data, meta) => {
      meta.reply('shelves:slots', {
        slots: shelvesController.shelfSlots,
        products: shelvesController.getSummary(),
      })
    })

    navigateImpl = (view: NavPresetId) => {
      if (replayState && replayState.cameraFollow === 'recorded') {
        replayState.cameraFollow = 'free'
        replayState.callbacks?.onCameraFollowChange?.('free')
      }
      navigateToFocusView(view)
    }

    returnPrevImpl = () => {
      if (replayState && replayState.cameraFollow === 'recorded') {
        replayState.cameraFollow = 'free'
        replayState.callbacks?.onCameraFollowChange?.('free')
      }
      returnToPreviousPose()
    }

    toggleDrawerImpl = () => {
      toggleCashDrawer()
    }

    setDrawerCashImpl = (amountEur: number) => {
      applyDrawerCashFromChannel({ amount: amountEur })
    }

    setTabletPowerImpl = (tabletId: string, poweredOn: boolean) => {
      setSingleTabletPower(tabletId, poweredOn, true)
    }

    toggleTabletPowerImpl = (tabletId: string) => {
      const target = tabletInstances.find((t) => t.spec.id === tabletId)
      if (target && !target.spec.canControlScreens) {
        setSingleTabletPower(tabletId, !target.poweredOn, true)
      }
    }

    setZebraReelImpl = (reelId: ZebraReelId) => {
      applyZebraReel(reelId, true)
    }

    printZplImpl = (zpl: string) => {
      handleZplChannelJob({ zpl }, 'host')
    }

    printEscPosImpl = (payload: string | Uint8Array | number[]) => {
      if (typeof payload === 'string') {
        handleEscPosChannelJob({ escpos: payload }, 'host')
      } else {
        handleEscPosChannelJob({ bytes: payload }, 'host')
      }
    }

    rotateHeldLabelImpl = () => {
      handleRotateHeldLabel()
    }

    dropHeldItemImpl = () => {
      cancelHeldItem()
    }

    toggleScannerImpl = () => {
      toggleScanner()
    }

    setShelfProductsImpl = (products: ShelfProductInput[]) => {
      if (replayState) return []
      const res = shelvesController.setProducts(products)
      pushRecordedEvent({
        type: 'shelves:setProducts',
        products: shelvesController.getProductsSnapshot(),
      })
      return res
    }

    upsertShelfProductImpl = (
      product: Partial<ShelfProductInput> & { id: string | number },
    ) => {
      if (replayState) return []
      const res = shelvesController.upsertProduct(product)
      pushRecordedEvent({
        type: 'shelves:upsertProduct',
        product,
      })
      return res
    }

    clearShelvesImpl = () => {
      if (replayState) return
      shelvesController.clearProducts()
      pushRecordedEvent({ type: 'shelves:clear' })
    }

    // Recording & Replay lifecycle implementations
    const setTabletVisualPowerForReplay = (
      tabletId: string,
      nextOn: boolean,
      nextEnabled: boolean,
    ) => {
      const target = tabletInstances.find((t) => t.spec.id === tabletId)
      if (!target || !replayState) return
      const powerChanged = target.poweredOn !== nextOn
      target.poweredOn = nextOn
      target.enabledByMain = nextEnabled
      target.powerUserData.poweredOn = nextOn
      target.cutoutMesh.userData.poweredOn = nextOn

      if (nextOn) {
        target.loginPromptTimer = 0
        target.loginOsdMesh.visible = false
        target.loginOsdMat.opacity = 0
        const projMat = replayState.projector.getScreenMaterial(tabletId)
        target.cutoutMesh.material = projMat ?? cutoutOnMat
        target.cutoutMesh.layers.enable(FOCUS_SHARP_LAYER)
        target.camDot.material = camDotOnMat
        if (powerChanged) {
          replayState.projector.clearTabletCache(tabletId)
        }
      } else {
        target.cutoutMesh.material = screenOffMat
        if (!touchCapable) {
          target.cutoutMesh.layers.disable(FOCUS_SHARP_LAYER)
        }
        target.camDot.material = camDotOffMat
        replayState.projector.clearTabletCache(tabletId)
      }
      applyTabletPowerButtonVisual(target)
    }

    const remapProductsWithOfflineMap = (
      products: ShelfProductInput[],
      offlineMap: Record<string, string>,
    ): ShelfProductInput[] =>
      products.map((p) => {
        const rawImg = p.image ?? p.imageUrl ?? p.picture
        const mapped =
          typeof rawImg === 'string' && offlineMap[rawImg]
            ? offlineMap[rawImg]
            : rawImg
        return mapped ? { ...p, image: mapped } : { ...p }
      })

    const snapDrawerInstant = (open: boolean) => {
      drawerOpen = open
      drawerMotion.targetOpen = open
      drawerMotion.z = open ? DRAWER_OPEN_OFFSET : 0
      drawerMotion.velZ = 0
      drawerMotion.accZ = 0
      drawerMotion.settled = true
      drawerMotion.bouncePhase = 0
      drawerTrayGroup.position.z = drawerMotion.z
      drawerBtnFaceMat.map = drawerOpen ? closeBtnTex : openBtnTex
      drawerBtnFaceMat.needsUpdate = true
      callbacks.onDrawerChange(drawerOpen)
    }

    const applyReplayEventsUpTo = (
      rs: ActiveReplayState,
      targetMs: number,
      forceReset: boolean,
    ) => {
      const { manifest, offlineImageMap } = rs.session
      const { initialSnapshot: snap, events } = manifest

      if (
        forceReset ||
        rs.appliedEventIndex === -1 ||
        targetMs < rs.appliedTimeMs - 40 ||
        targetMs - rs.appliedTimeMs > 2000
      ) {
        // Full deterministic rebuild from initialSnapshot up to targetMs
        state.activeView = snap.activeView
        state.fullscreenTabletId = snap.fullscreenTabletId
        callbacks.onActiveViewChange(snap.activeView)

        for (const t of tabletInstances) {
          const sc = snap.screens[t.spec.id] ?? {
            poweredOn: t.spec.initialPower !== false,
            enabled: Boolean(t.spec.canControlScreens || t.spec.initialPower !== false),
          }
          setTabletVisualPowerForReplay(t.spec.id, sc.poweredOn, sc.enabled)
        }

        snapDrawerInstant(snap.drawerOpen)

        applyZebraReel(snap.zebraReelId, false, true)
        printManager.resetAllSheets()
        setHeldMode(snap.heldMode === 'scanner' ? 'scanner' : 'none')
        scannerTriggerAnim = 0
        scanSuccessFlash = 0
        rs.projector.setHudExclusionRects(snap.hudExclusionRects ?? [])

        let desiredCashCents = snap.drawerCashCents
        let desiredShelfProducts: ShelfProductInput[] = snap.shelfProducts.map(
          (p) => ({ ...p }),
        )
        let desiredReelModal = false
        let desiredMuted = snap.audioMuted
        let lastPrintSimMs = 0
        let idx = 0

        while (idx < events.length && events[idx].t <= targetMs) {
          const ev = events[idx]
          if (ev.t > lastPrintSimMs) {
            printManager.fastForward((ev.t - lastPrintSimMs) / 1000)
            lastPrintSimMs = ev.t
          }
          switch (ev.type) {
            case 'view:change':
              state.activeView = ev.activeView
              state.fullscreenTabletId = ev.fullscreenTabletId
              callbacks.onActiveViewChange(ev.activeView)
              break
            case 'tablet:power':
              setTabletVisualPowerForReplay(
                ev.tabletId,
                ev.poweredOn,
                ev.enabled,
              )
              break
            case 'drawer:state':
              snapDrawerInstant(ev.open)
              break
            case 'drawer:cash':
              desiredCashCents = ev.cents
              break
            case 'zebra:reel':
              applyZebraReel(ev.reelId, false, true)
              break
            case 'zebra:pickerModal':
              desiredReelModal = ev.open
              break
            case 'print:zpl':
              printManager.printZpl(
                ev.zpl,
                { sender: ev.sender ?? 'replay', jobId: ev.jobId },
                ev.sheetId,
              )
              break
            case 'print:escpos':
              printManager.printEscPos(
                { base64: ev.base64 },
                { sender: ev.sender ?? 'replay', jobId: ev.jobId },
                ev.sheetId,
              )
              break
            case 'label:pickup':
              if (printManager.pickUpLabel(ev.sheetId)) {
                setHeldMode('label')
              }
              break
            case 'label:rotate':
              printManager.setHeldLabelYawOffset(ev.yawOffset)
              break
            case 'label:place':
              if (printManager.placeLabelAtRecordedPose(ev)) {
                setHeldMode('none')
              }
              break
            case 'label:cancel':
              printManager.cancelHeldLabel()
              setHeldMode('none')
              break
            case 'scanner:pickup':
              setHeldMode('scanner')
              break
            case 'scanner:putdown':
              setHeldMode('none')
              break
            case 'scanner:decoded':
              callbacks.onBarcodeScan?.({
                code: ev.code,
                format: ev.format,
                tabletId: 'pos-center',
                deliveredToTablet: ev.deliveredToTablet,
                timestamp: Date.now(),
              })
              break
            case 'shelves:setProducts':
              desiredShelfProducts = ev.products.map((p) => ({ ...p }))
              break
            case 'shelves:upsertProduct': {
              const idStr = String(ev.product.id).trim()
              const pIdx = desiredShelfProducts.findIndex(
                (p) => String(p.id).trim() === idStr,
              )
              if (pIdx >= 0) {
                desiredShelfProducts[pIdx] = {
                  ...desiredShelfProducts[pIdx],
                  ...ev.product,
                } as ShelfProductInput
              } else {
                desiredShelfProducts.push({
                  stock: 0,
                  ...ev.product,
                } as ShelfProductInput)
              }
              break
            }
            case 'shelves:clear':
              desiredShelfProducts = []
              break
            case 'audio:mute':
              desiredMuted = ev.muted
              break
            case 'hud:rects':
              rs.projector.setHudExclusionRects(ev.rects)
              break
          }
          idx++
        }

        if (targetMs > lastPrintSimMs) {
          printManager.fastForward((targetMs - lastPrintSimMs) / 1000)
        }

        if (rs.appliedCashCents !== desiredCashCents) {
          setCashCents(desiredCashCents)
          rs.appliedCashCents = desiredCashCents
        }

        shelvesController.setProducts(
          remapProductsWithOfflineMap(desiredShelfProducts, offlineImageMap),
        )
        shelvesController.flushPendingNow()

        rs.callbacks?.onReelPickerModalChange?.(desiredReelModal)
        rs.callbacks?.onAudioMuteChange?.(desiredMuted)
        rs.appliedEventIndex = idx
        rs.appliedTimeMs = targetMs
        return
      }

      // Incremental real-time step
      while (
        rs.appliedEventIndex < events.length &&
        events[rs.appliedEventIndex].t <= targetMs
      ) {
        const ev = events[rs.appliedEventIndex]
        switch (ev.type) {
          case 'view:change':
            state.activeView = ev.activeView
            state.fullscreenTabletId = ev.fullscreenTabletId
            callbacks.onActiveViewChange(ev.activeView)
            break
          case 'tablet:power': {
            setTabletVisualPowerForReplay(
              ev.tabletId,
              ev.poweredOn,
              ev.enabled,
            )
            const tInst = tabletInstances.find((t) => t.spec.id === ev.tabletId)
            if (tInst) {
              tInst.powerPressAnim = 1
              if (ev.poweredOn) {
                tInst.reloadFlash = 0.65
                tInst.powerFaceMat.map = powerActiveTex
                tInst.powerFaceMat.emissive.set('#f59e0b')
                tInst.powerFaceMat.emissiveIntensity = 0.75
                tInst.powerFaceMat.needsUpdate = true
              }
            }
            break
          }
          case 'tablet:powerBlocked': {
            const tInst = tabletInstances.find((t) => t.spec.id === ev.tabletId)
            if (tInst) triggerLoginFirstPrompt(tInst, true)
            break
          }
          case 'tablet:reload': {
            const tInst = tabletInstances.find((t) => t.spec.id === ev.tabletId)
            if (tInst) {
              tInst.powerPressAnim = 1
              tInst.reloadFlash = 1
              tInst.powerFaceMat.map = powerActiveTex
              tInst.powerFaceMat.emissive.set('#f59e0b')
              tInst.powerFaceMat.emissiveIntensity = 0.75
              tInst.powerFaceMat.needsUpdate = true
            }
            break
          }
          case 'drawer:state':
            setCashDrawerOpen(ev.open, true)
            break
          case 'drawer:cash':
            if (rs.appliedCashCents !== ev.cents) {
              setCashCents(ev.cents)
              rs.appliedCashCents = ev.cents
            }
            break
          case 'zebra:reel':
            applyZebraReel(ev.reelId, false, true)
            break
          case 'zebra:pickerModal':
            rs.callbacks?.onReelPickerModalChange?.(ev.open)
            break
          case 'print:zpl':
            printManager.printZpl(
              ev.zpl,
              { sender: ev.sender ?? 'replay', jobId: ev.jobId },
              ev.sheetId,
            )
            break
          case 'print:escpos': {
            const out = printManager.printEscPos(
              { base64: ev.base64 },
              { sender: ev.sender ?? 'replay', jobId: ev.jobId },
              ev.sheetId,
            )
            if (ev.kickDrawer || out.kickDrawer) {
              setCashDrawerOpen(true, true)
            }
            break
          }
          case 'label:pickup':
            if (printManager.pickUpLabel(ev.sheetId)) {
              setHeldMode('label')
            }
            break
          case 'label:rotate':
            printManager.setHeldLabelYawOffset(ev.yawOffset)
            break
          case 'label:place':
            if (printManager.placeLabelAtRecordedPose(ev)) {
              setHeldMode('none')
            }
            break
          case 'label:cancel':
            printManager.cancelHeldLabel()
            setHeldMode('none')
            break
          case 'scanner:pickup':
            scannerTriggerAnim = 0.65
            setHeldMode('scanner')
            break
          case 'scanner:putdown':
            setHeldMode('none')
            break
          case 'scanner:pulse':
            scannerTriggerAnim = 1
            break
          case 'scanner:decoded':
            scanSuccessFlash = 1
            if (!manifest.hasTabAudio) {
              playScannerBeep(Boolean(isAudioMuted?.()))
            }
            callbacks.onBarcodeScan?.({
              code: ev.code,
              format: ev.format,
              tabletId: 'pos-center',
              deliveredToTablet: ev.deliveredToTablet,
              timestamp: Date.now(),
            })
            break
          case 'shelves:setProducts':
            shelvesController.setProducts(
              remapProductsWithOfflineMap(ev.products, offlineImageMap),
            )
            break
          case 'shelves:upsertProduct': {
            const [mapped] = remapProductsWithOfflineMap(
              [{ stock: 0, ...ev.product } as ShelfProductInput],
              offlineImageMap,
            )
            shelvesController.upsertProduct({
              ...ev.product,
              ...(mapped.image ? { image: mapped.image } : {}),
            })
            break
          }
          case 'shelves:clear':
            shelvesController.clearProducts()
            break
          case 'audio:mute':
            rs.callbacks?.onAudioMuteChange?.(ev.muted)
            break
          case 'hud:rects':
            rs.projector.setHudExclusionRects(ev.rects)
            break
        }
        rs.appliedEventIndex++
      }
      rs.appliedTimeMs = targetMs
    }

    startRecordingImpl = (options: SceneRecordingStartOptions): boolean => {
      if (disposed || replayState) return false
      recordingActive = true
      recordStartPerfNow = options.startedAtPerfNow
      recordOnStats = options.onStats
      recordPaintSyncStamp = options.paintSyncStamp
      lastRecordStatsMs = 0
      recordedFrames = []
      recordedEvents = []
      lastRecordedActiveView = state.activeView
      lastRecordedFullscreenId = state.fullscreenTabletId

      const screensSnap: RecordedInitialSnapshot['screens'] = {}
      recordTabletsGeo = []
      for (const t of tabletInstances) {
        screensSnap[t.spec.id] = {
          poweredOn: t.poweredOn,
          enabled: t.enabledByMain,
        }
        const visW = t.spec.crop ? t.spec.crop.w : t.spec.cssW
        const visH = t.spec.crop ? t.spec.crop.h : t.spec.cssH
        const screenW = Math.round(visW * t.spec.physicalScale)
        const screenH = Math.round(visH * t.spec.physicalScale)
        t.cutoutMesh.updateMatrixWorld(true)
        recordTabletsGeo.push({
          id: t.spec.id,
          title: t.spec.title,
          subtitle: t.spec.subtitle,
          screenW,
          screenH,
          cutoutW: screenW + 12,
          cutoutH: screenH + 12,
          matrixWorld: t.cutoutMesh.matrixWorld.elements.slice(),
        })
      }

      recordInitialSnapshot = {
        camera: {
          x: Number(camera.position.x.toFixed(2)),
          y: Number(camera.position.y.toFixed(2)),
          z: Number(camera.position.z.toFixed(2)),
          yaw: Number(state.yaw.toFixed(5)),
          pitch: Number(state.pitch.toFixed(5)),
          fov: Number(camera.fov.toFixed(3)),
          zoomNorm: Number(state.zoomNorm.toFixed(4)),
          stageW: Math.max(1, stageEl.clientWidth),
          stageH: Math.max(1, stageEl.clientHeight),
        },
        activeView: state.activeView,
        fullscreenTabletId: state.fullscreenTabletId,
        heldMode,
        drawerOpen,
        drawerCashCents: getCashBreakdown().cents,
        zebraReelId: activeZebraMedia.id,
        audioMuted: Boolean(isAudioMuted?.()),
        screens: screensSnap,
        shelfProducts: shelvesController.getProductsSnapshot(),
        hudExclusionRects: options.getHudExclusionRects(),
      }
      return true
    }

    recordCustomEventImpl = (ev) => {
      pushRecordedEvent(ev)
    }

    stopRecordingImpl = async (): Promise<SceneRecordingStopResult | null> => {
      if (!recordingActive || !recordInitialSnapshot) return null
      recordingActive = false
      const snap = recordInitialSnapshot
      const frames = recordedFrames
      const events = recordedEvents
      const tablets = recordTabletsGeo
      recordInitialSnapshot = null
      recordOnStats = undefined
      recordPaintSyncStamp = undefined

      const shelfImageBlobs = await shelvesController.exportCachedProductImages()
      return {
        initialSnapshot: snap,
        tablets,
        frames,
        events,
        shelfImageBlobs,
      }
    }

    const exitActiveReplay = () => {
      if (!replayState) return
      const rs = replayState
      replayState = null

      rs.projector.dispose()
      printManager.resetAllSheets()
      setHeldMode('none')

      const saved = rs.savedLiveState
      for (const s of saved.screens) {
        const t = tabletInstances.find((item) => item.spec.id === s.id)
        if (!t) continue
        t.poweredOn = s.poweredOn
        t.enabledByMain = s.enabledByMain
        t.powerUserData.poweredOn = s.poweredOn
        t.cutoutMesh.userData.poweredOn = s.poweredOn
        t.loginPromptTimer = 0
        t.loginOsdMesh.visible = false
        t.loginOsdMat.opacity = 0

        if (s.poweredOn) {
          t.cutoutMesh.material = cutoutOnMat
          if (!touchCapable) {
            t.cutoutMesh.layers.enable(FOCUS_SHARP_LAYER)
          } else {
            t.cutoutMesh.layers.disable(FOCUS_SHARP_LAYER)
          }
          t.camDot.material = camDotOnMat
          t.cssObject.visible = true
          t.wrapperEl.style.visibility = 'visible'
        } else {
          t.cutoutMesh.material = screenOffMat
          t.cutoutMesh.layers.disable(FOCUS_SHARP_LAYER)
          t.camDot.material = camDotOffMat
          t.cssObject.visible = false
          t.wrapperEl.style.visibility = 'hidden'
          t.wrapperEl.style.pointerEvents = 'none'
          t.iframeEl.style.pointerEvents = 'none'
        }
        applyTabletPowerButtonVisual(t)
      }

      snapDrawerInstant(saved.drawerOpen)

      setCashCents(saved.cashCents)
      applyZebraReel(saved.zebraReelId, false, true)
      shelvesController.setProducts(saved.shelfProducts)

      state.cameraTween = null
      camera.position.set(saved.camX, saved.camY, saved.camZ)
      state.yaw = saved.yaw
      state.pitch = saved.pitch
      state.targetYaw = saved.yaw
      state.targetPitch = saved.pitch
      state.zoomNorm = saved.zoomNorm
      state.targetZoomNorm = saved.zoomNorm
      camera.rotation.set(saved.pitch, saved.yaw, 0, 'YXZ')
      state.activeView = saved.activeView
      state.fullscreenTabletId = saved.fullscreenTabletId
      callbacks.onActiveViewChange(saved.activeView)
      refreshInputShield?.()
    }

    enterReplayImpl = (
      session: UnpackedRecordingSession,
      replayCallbacks?: SceneReplayCallbacks,
    ): SceneReplayHandle | null => {
      if (disposed) return null
      if (recordingActive) {
        recordingActive = false
      }
      if (replayState) {
        exitActiveReplay()
      }

      if (document.pointerLockElement === stageEl) {
        document.exitPointerLock()
      }
      cancelHeldItem()

      const savedLiveState: ActiveReplayState['savedLiveState'] = {
        activeView: state.activeView,
        fullscreenTabletId: state.fullscreenTabletId,
        camX: camera.position.x,
        camY: camera.position.y,
        camZ: camera.position.z,
        yaw: state.yaw,
        pitch: state.pitch,
        zoomNorm: state.zoomNorm,
        drawerOpen,
        cashCents: getCashBreakdown().cents,
        zebraReelId: activeZebraMedia.id,
        shelfProducts: shelvesController.getProductsSnapshot(),
        screens: tabletInstances.map((t) => ({
          id: t.spec.id,
          poweredOn: t.poweredOn,
          enabledByMain: t.enabledByMain,
        })),
      }

      const projector = createTabletVideoProjector(
        THREE,
        webglRenderer,
        tabletInstances,
        session.videoObjectUrl,
        session.manifest,
      )
      projector.videoEl.muted = Boolean(isAudioMuted?.())

      const snapCam = session.manifest.initialSnapshot.camera
      const fallbackSample: InterpolatedFrameSample = {
        tMs: 0,
        camX: snapCam.x,
        camY: snapCam.y,
        camZ: snapCam.z,
        yaw: snapCam.yaw,
        pitch: snapCam.pitch,
        fov: snapCam.fov,
        stageW: snapCam.stageW,
        stageH: snapCam.stageH,
        cursorU: 0.5,
        cursorV: 0.5,
        moveKnobX: 0,
        moveKnobY: 0,
        aimKnobX: 0,
        aimKnobY: 0,
        zoomNorm: snapCam.zoomNorm,
        flags: 0,
      }

      const recPoseCam = new THREE.PerspectiveCamera(58, 16 / 9, 120, 160000)
      recPoseCam.rotation.order = 'YXZ'

      const rs: ActiveReplayState = {
        session,
        projector,
        callbacks: replayCallbacks,
        cameraFollow: 'recorded',
        currentTimeMs: 0,
        appliedEventIndex: -1,
        appliedTimeMs: 0,
        appliedCashCents: -1,
        recPoseCam,
        fallbackSample,
        savedLiveState,
      }
      replayState = rs

      state.cameraTween = null
      state.velX = 0
      state.velZ = 0
      applyReplayEventsUpTo(rs, 0, true)

      const onVideoEnded = () => {
        if (replayState !== rs) return
        rs.currentTimeMs = session.manifest.durationMs
        applyReplayEventsUpTo(rs, rs.currentTimeMs, false)
        rs.callbacks?.onProgress?.(
          rs.currentTimeMs,
          session.manifest.durationMs,
          false,
        )
      }
      projector.videoEl.addEventListener('ended', onVideoEnded)

      return {
        play: async () => {
          if (replayState !== rs) return
          if (projector.videoEl.ended || rs.currentTimeMs >= session.manifest.durationMs - 30) {
            projector.videoEl.currentTime = 0
            rs.currentTimeMs = 0
            applyReplayEventsUpTo(rs, 0, true)
          }
          await projector.videoEl.play().catch(() => {})
        },
        pause: () => {
          if (replayState !== rs) return
          projector.videoEl.pause()
          rs.callbacks?.onProgress?.(
            rs.currentTimeMs,
            session.manifest.durationMs,
            false,
          )
        },
        seek: (timeMs: number) => {
          if (replayState !== rs) return
          const clamped = Math.max(
            0,
            Math.min(session.manifest.durationMs, timeMs),
          )
          rs.currentTimeMs = clamped
          projector.videoEl.currentTime = clamped / 1000
          applyReplayEventsUpTo(rs, clamped, true)
          rs.callbacks?.onProgress?.(
            clamped,
            session.manifest.durationMs,
            !projector.videoEl.paused,
          )
        },
        setPlaybackRate: (rate: number) => {
          if (replayState !== rs) return
          projector.videoEl.playbackRate = Math.max(0.25, Math.min(4, rate))
        },
        setMuted: (muted: boolean) => {
          if (replayState !== rs) return
          projector.videoEl.muted = muted
        },
        setCameraFollowMode: (mode: ReplayCameraFollowMode) => {
          if (replayState !== rs) return
          rs.cameraFollow = mode
          if (mode === 'recorded') {
            state.cameraTween = null
            state.velX = 0
            state.velZ = 0
          }
          rs.callbacks?.onCameraFollowChange?.(mode)
        },
        exit: () => {
          projector.videoEl.removeEventListener('ended', onVideoEnded)
          if (replayState === rs) {
            exitActiveReplay()
          }
        },
      }
    }

    const onResize = () => {
      const w = stageEl.clientWidth
      const h = Math.max(1, stageEl.clientHeight)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      webglRenderer.setSize(w, h)
      focusBlurPass.setSize(w, h, webglRenderer.getPixelRatio())
      cssRenderer.setSize(w, h)
    }

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    resizeObserver?.observe(stageEl)
    window.addEventListener('resize', onResize)

    cleanupFns.push(() => {
      if (replayState) {
        replayState.projector.dispose()
        replayState = null
      }
      cleanupInput()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onResize)

      if (document.pointerLockElement === stageEl) {
        document.exitPointerLock()
      }

      for (const item of tabletInstances) {
        item.wrapperEl.remove()
      }
      for (const d of disposables) {
        d.dispose()
      }
      webglRenderer.dispose()
    })

    // 5. Animation Loop
    const aimNdc = new THREE.Vector2(0, 0)
    const tmpNormal = new THREE.Vector3()
    const tmpToCam = new THREE.Vector3()
    const tmpWorldPos = new THREE.Vector3()
    const tmpProjVec = new THREE.Vector3()
    const tmpWorldQuat = new THREE.Quaternion()
    const forwardVec = new THREE.Vector3()
    const rightVec = new THREE.Vector3()
    const moveVec = new THREE.Vector3()
    const tmpScannerAimPoint = new THREE.Vector3()
    const tmpScannerHitNormal = new THREE.Vector3()

    let lastTime = performance.now()
    let lastSunSyncMs = lastTime
    let smoothedDt = 1 / 60
    let focusBlurAmount = 0

    const tick = (now: number) => {
      if (disposed) return
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
      lastTime = now
      smoothedDt += (rawDt - smoothedDt) * 0.35
      const dt = smoothedDt

      if (now - lastSunSyncMs >= 30000) {
        lastSunSyncMs = now
        updateBerlinTimeLighting(new Date())
      }

      shelvesController.update(now)

      // Advance replay timeline & resolve frame-synced sample directly from decoded video
      let activeReplaySample: InterpolatedFrameSample | null = null
      if (replayState) {
        const { videoEl } = replayState.projector
        const synced = replayState.projector.resolveCurrentFrameSample(
          replayState.currentTimeMs,
          replayState.fallbackSample,
        )
        activeReplaySample = synced.sample

        if (!videoEl.paused && !videoEl.ended && !videoEl.seeking) {
          replayState.currentTimeMs = Math.min(
            replayState.session.manifest.durationMs,
            synced.mediaTimeMs,
          )
          applyReplayEventsUpTo(replayState, replayState.currentTimeMs, false)
          replayState.callbacks?.onProgress?.(
            replayState.currentTimeMs,
            replayState.session.manifest.durationMs,
            true,
          )
        } else if (synced.hasExactStamp && !videoEl.seeking) {
          // Even right after pause/scrub, align 3D events to the exact seeked video frame
          replayState.currentTimeMs = Math.min(
            replayState.session.manifest.durationMs,
            synced.mediaTimeMs,
          )
        }

        const recAspect = Math.max(
          0.25,
          activeReplaySample.stageW / Math.max(1, activeReplaySample.stageH),
        )
        replayState.recPoseCam.fov = activeReplaySample.fov
        replayState.recPoseCam.aspect = recAspect
        replayState.recPoseCam.updateProjectionMatrix()
        replayState.recPoseCam.position.set(
          activeReplaySample.camX,
          activeReplaySample.camY,
          activeReplaySample.camZ,
        )
        replayState.recPoseCam.rotation.set(
          activeReplaySample.pitch,
          activeReplaySample.yaw,
          0,
          'YXZ',
        )
        replayState.recPoseCam.updateMatrixWorld(true)

        replayState.projector.update(
          activeReplaySample,
          heldMode === 'scanner',
        )

        if (replayState.cameraFollow === 'recorded') {
          const stageRect = stageEl.getBoundingClientRect()
          if (
            (activeReplaySample.flags & FRAME_FLAG_HAS_CURSOR) !== 0 &&
            stageRect.width > 0 &&
            stageRect.height > 0
          ) {
            state.lastMouseX =
              stageRect.left + activeReplaySample.cursorU * stageRect.width
            state.lastMouseY =
              stageRect.top + activeReplaySample.cursorV * stageRect.height
          } else {
            state.lastMouseX = -9999
            state.lastMouseY = -9999
          }
        }
      }

      // Proximity grow animations for the 4 navigation loupes & cash drawer button
      // Disabled while holding the barcode scanner so aiming/clicking never triggers loupes or buttons
      const scannerActive = heldMode === 'scanner'
      const hoverSmooth = 1 - Math.exp(-16 * dt)
      for (const l of loupeInstances) {
        const isAlreadyFocused = state.activeView === l.viewId
        const targetHover =
          !scannerActive && !isAlreadyFocused
            ? Math.max(
              getCursorProximity(
                l.loupeGroup,
                150,
                state,
                stageEl,
                camera,
                tmpProjVec,
              ),
              l.plateMesh
                ? getCursorProximity(
                  l.plateMesh,
                  130,
                  state,
                  stageEl,
                  camera,
                  tmpProjVec,
                ) * 0.75
                : 0,
            )
            : 0

        l.hover += (targetHover - l.hover) * hoverSmooth
        l.loupeGroup.scale.setScalar(l.baseScale * (1 + 0.58 * l.hover))
        if (l.liftAxis === 'y') {
          l.loupeGroup.position.y = l.baseY + 18 * l.hover
        } else {
          l.loupeGroup.position.z = l.baseZ + 18 * l.hover
        }
        l.loupeGroup.rotation.x = -0.22 * l.hover
        l.loupeGroup.rotation.z = 0.08 * l.hover
        if (l.plateMesh) {
          l.plateMesh.scale.set(
            1 + 0.08 * l.hover,
            1,
            1 + 0.08 * l.hover,
          )
        }
      }

      // Subtle orange glow on the Zebra side latches when hovered
      let zebraLatchProx = 0
      if (!scannerActive) {
        for (const zMesh of zebraTargets) {
          const p = getCursorProximity(
            zMesh,
            95,
            state,
            stageEl,
            camera,
            tmpProjVec,
          )
          if (p > zebraLatchProx) zebraLatchProx = p
        }
      }
      zebraLatchMat.emissive.set('#f59e0b')
      zebraLatchMat.emissiveIntensity +=
        (0.08 + zebraLatchProx * 0.65 - zebraLatchMat.emissiveIntensity) *
        hoverSmooth

      // Barcode scanner & tabletop dock proximity hover
      const scannerProxTarget =
        heldMode === 'none'
          ? getCursorProximity(scannerGroup, 135, state, stageEl, camera, tmpProjVec)
          : 0
      scannerHover += (scannerProxTarget - scannerHover) * hoverSmooth

      const dockProxTarget =
        heldMode === 'scanner' && scannerDockTargets[0]
          ? getCursorProximity(
            scannerDockTargets[0],
            125,
            state,
            stageEl,
            camera,
            tmpProjVec,
          )
          : 0
      scannerDockHover += (dockProxTarget - scannerDockHover) * hoverSmooth

      if (scannerTriggerAnim > 0) {
        scannerTriggerAnim = Math.max(0, scannerTriggerAnim - dt * 5.2)
      }
      if (scanSuccessFlash > 0) {
        scanSuccessFlash = Math.max(0, scanSuccessFlash - dt * 2.8)
      }

      const btnTargetHover = scannerActive
        ? 0
        : getCursorProximity(
          cashBtnMesh,
          140,
          state,
          stageEl,
          camera,
          tmpProjVec,
        )
      cashBtnHover += (btnTargetHover - cashBtnHover) * hoverSmooth
      const btnScale = 1 + 0.42 * cashBtnHover
      cashBtnMesh.scale.set(btnScale, btnScale, 1 + 0.25 * cashBtnHover)

      // Monitor power/reload buttons hover, press & flash animations
      for (const t of tabletInstances) {
        const pTargetHover = scannerActive
          ? 0
          : getCursorProximity(
            t.powerBtnGroup,
            105,
            state,
            stageEl,
            camera,
            tmpProjVec,
          )
        t.powerHover += (pTargetHover - t.powerHover) * hoverSmooth
        const pScale = 1 + 0.45 * t.powerHover
        t.powerBtnGroup.scale.set(pScale, pScale, 1 + 0.2 * t.powerHover)

        if (t.powerPressAnim > 0) {
          t.powerPressAnim = Math.max(0, t.powerPressAnim - dt * 5.5)
          t.powerBtnGroup.position.z =
            t.powerBaseZ - Math.sin(t.powerPressAnim * Math.PI) * 6.5
        } else {
          t.powerBtnGroup.position.z = t.powerBaseZ
        }

        if (t.reloadFlash > 0) {
          t.reloadFlash = Math.max(0, t.reloadFlash - dt * 1.8)
          if (t.reloadFlash === 0) {
            applyTabletPowerButtonVisual(t)
          }
        }

        // Fullscreen bezel button hover, press & active icon state
        const fsTargetHover = scannerActive
          ? 0
          : getCursorProximity(
            t.fullscreenBtnGroup,
            105,
            state,
            stageEl,
            camera,
            tmpProjVec,
          )
        t.fullscreenHover += (fsTargetHover - t.fullscreenHover) * hoverSmooth
        const fsScale = 1 + 0.45 * t.fullscreenHover
        t.fullscreenBtnGroup.scale.set(
          fsScale,
          fsScale,
          1 + 0.2 * t.fullscreenHover,
        )

        if (t.fullscreenPressAnim > 0) {
          t.fullscreenPressAnim = Math.max(0, t.fullscreenPressAnim - dt * 5.5)
          t.fullscreenBtnGroup.position.z =
            t.fullscreenBaseZ - Math.sin(t.fullscreenPressAnim * Math.PI) * 6.5
        } else {
          t.fullscreenBtnGroup.position.z = t.fullscreenBaseZ
        }

        const isFullscreen = state.fullscreenTabletId === t.spec.id
        const desiredFsTex = isFullscreen
          ? fullscreenActiveTex
          : fullscreenIdleTex
        if (t.fullscreenFaceMat.map !== desiredFsTex) {
          t.fullscreenFaceMat.map = desiredFsTex
          t.fullscreenFaceMat.emissive.set(isFullscreen ? '#f59e0b' : '#0f9f86')
          t.fullscreenFaceMat.emissiveIntensity = isFullscreen ? 0.55 : 0.32
          t.fullscreenFaceMat.needsUpdate = true
        }

        if (t.loginPromptTimer > 0 && !t.poweredOn) {
          t.loginPromptTimer = Math.max(0, t.loginPromptTimer - dt)
          const elapsed = LOGIN_PROMPT_DURATION - t.loginPromptTimer
          const fadeIn = Math.min(1, elapsed / 0.12)
          const fadeOut = Math.min(1, t.loginPromptTimer / 0.45)
          const alpha = Math.min(fadeIn, fadeOut)
          t.loginOsdMesh.visible = alpha > 0.01
          t.loginOsdMat.opacity = alpha
          const popScale = 0.94 + 0.06 * fadeIn
          t.loginOsdMesh.scale.set(popScale, popScale, 1)
        } else if (t.loginOsdMesh.visible) {
          t.loginPromptTimer = 0
          t.loginOsdMesh.visible = false
          t.loginOsdMat.opacity = 0
        }
      }

      // Cash drawer slide (initial kick, accel, decel, hard stop) & dynamic coin fluid physics
      const drawerStep = stepDrawerMotion(
        drawerMotion,
        dt,
        DRAWER_OPEN_OFFSET,
        pendingDrawerKickDv,
      )
      pendingDrawerKickDv = 0
      drawerTrayGroup.position.z = drawerStep.z
      updateCoinPhysics(dt, drawerStep)

      if (btnPressAnim > 0) {
        btnPressAnim = Math.max(0, btnPressAnim - dt * 5)
        cashBtnMesh.position.z = DRAWER_D / 2 + 8 - Math.sin(btnPressAnim * Math.PI) * 14
      } else {
        cashBtnMesh.position.z = DRAWER_D / 2 + 8
      }

      // Printer label/receipt emerging & floor-drop physics
      printManager.update(dt)

      // Smooth focus / return-to-previous camera transition + drive virtual sticks during flight
      let tweenStickMoveX = 0
      let tweenStickMoveY = 0
      if (state.cameraTween) {
        const prevCamX = camera.position.x
        const prevCamZ = camera.position.z
        const prevYaw = state.yaw
        const prevPitch = state.pitch

        stepCameraTween(state, camera, dt)

        const dxWorld = camera.position.x - prevCamX
        const dzWorld = camera.position.z - prevCamZ
        forwardVec.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize()
        rightVec.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).normalize()

        const localRightVel = (dxWorld * rightVec.x + dzWorld * rightVec.z) / dt
        const localForwardVel = (dxWorld * forwardVec.x + dzWorld * forwardVec.z) / dt
        const normScale = WALK_SPEED * 1.15
        tweenStickMoveX = localRightVel / normScale
        tweenStickMoveY = -localForwardVel / normScale
        const tMoveMag = Math.hypot(tweenStickMoveX, tweenStickMoveY)
        if (tMoveMag > 1) {
          tweenStickMoveX /= tMoveMag
          tweenStickMoveY /= tMoveMag
        }

        const dYawRate = -(state.yaw - prevYaw) / dt
        const dPitchRate = -(state.pitch - prevPitch) / dt
        if (Math.abs(dYawRate) > 0.01 || Math.abs(dPitchRate) > 0.01) {
          let vx = dYawRate * (STICK_MAX_R * 0.72)
          let vy = dPitchRate * (STICK_MAX_R * 0.72)
          const rMag = Math.hypot(vx, vy)
          if (rMag > STICK_MAX_R) {
            vx = (vx / rMag) * STICK_MAX_R
            vy = (vy / rMag) * STICK_MAX_R
          }
          state.mouseAimVisualX = vx
          state.mouseAimVisualY = vy
        }
      }

      // Right-stick continuous aim rotation (touch or mouse-dragged stick)
      if (state.touchAimX !== 0 || state.touchAimY !== 0) {
        clearActiveFocusForFreeMove()
        if (state.cameraTween) {
          state.targetYaw = state.yaw
          state.targetPitch = state.pitch
          state.cameraTween = null
        }
        state.targetYaw -= state.touchAimX * STICK_YAW_SPEED * dt
        state.targetPitch -= state.touchAimY * STICK_PITCH_SPEED * dt
        const maxPitch = Math.PI * 0.46
        state.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, state.targetPitch))
      }

      // Apply smoothed angular rotation synchronized to the animation frame
      if (!state.cameraTween) {
        const lookLerp = 1 - Math.exp(-26 * dt)
        const dyaw = state.targetYaw - state.yaw
        const dpitch = state.targetPitch - state.pitch
        if (Math.abs(dyaw) > 1e-5 || Math.abs(dpitch) > 1e-5) {
          state.yaw += dyaw * lookLerp
          state.pitch += dpitch * lookLerp
          camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ')
        } else if (dyaw !== 0 || dpitch !== 0) {
          state.yaw = state.targetYaw
          state.pitch = state.targetPitch
          camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ')
        }
      }

      // Keyboard WASD + arrow + left-stick walking (two-stage damped S-curve for buttery start/stop)
      let rawKeyForward = 0
      let rawKeyRight = 0
      if (state.pressedKeys.has('KeyW') || state.pressedKeys.has('ArrowUp')) {
        rawKeyForward += 1
      }
      if (state.pressedKeys.has('KeyS') || state.pressedKeys.has('ArrowDown')) {
        rawKeyForward -= 1
      }
      if (state.pressedKeys.has('KeyD') || state.pressedKeys.has('ArrowRight')) {
        rawKeyRight += 1
      }
      if (state.pressedKeys.has('KeyA') || state.pressedKeys.has('ArrowLeft')) {
        rawKeyRight -= 1
      }
      if (rawKeyForward !== 0 && rawKeyRight !== 0) {
        const invDiag = Math.SQRT1_2
        rawKeyForward *= invDiag
        rawKeyRight *= invDiag
      }

      const keyForwardRate =
        Math.abs(rawKeyForward) > Math.abs(smoothKeyForward) ? 8.5 : 7.0
      const keyRightRate =
        Math.abs(rawKeyRight) > Math.abs(smoothKeyRight) ? 8.5 : 7.0
      smoothKeyForward +=
        (rawKeyForward - smoothKeyForward) * (1 - Math.exp(-keyForwardRate * dt))
      smoothKeyRight +=
        (rawKeyRight - smoothKeyRight) * (1 - Math.exp(-keyRightRate * dt))
      if (rawKeyForward === 0 && Math.abs(smoothKeyForward) < 0.002) {
        smoothKeyForward = 0
      }
      if (rawKeyRight === 0 && Math.abs(smoothKeyRight) < 0.002) {
        smoothKeyRight = 0
      }

      const manualForward = smoothKeyForward + state.mouseMoveY
      const manualRight = smoothKeyRight + state.mouseMoveX
      const hasManualMove =
        Math.abs(manualForward) > 0.004 || Math.abs(manualRight) > 0.004

      // Animate left stick knob on desktop keypresses/drag or viewpoint flight when stick isn't manually dragged
      if (!state.moveStickEngaged) {
        let targetKx = hasManualMove ? manualRight : tweenStickMoveX
        let targetKy = hasManualMove ? -manualForward : tweenStickMoveY
        const kLen = Math.hypot(targetKx, targetKy)
        if (kLen > 1) {
          targetKx /= kLen
          targetKy /= kLen
        }
        const stickLerp = 1 - Math.exp(-14 * dt)
        keyStickVisualX += (targetKx * STICK_MAX_R - keyStickVisualX) * stickLerp
        keyStickVisualY += (targetKy * STICK_MAX_R - keyStickVisualY) * stickLerp
        if (Math.hypot(keyStickVisualX, keyStickVisualY) < 0.15 && kLen < 0.02) {
          keyStickVisualX = 0
          keyStickVisualY = 0
        }
        if (stickRefs.moveKnobRef.current) {
          stickRefs.moveKnobRef.current.style.transform = `translate(${keyStickVisualX.toFixed(1)}px, ${keyStickVisualY.toFixed(1)}px)`
        }
        stickRefs.moveStickRef.current?.classList.toggle('is-engaged', kLen > 0.04)
      } else {
        keyStickVisualX = 0
        keyStickVisualY = 0
      }

      // Animate right stick knob on desktop mouse look when stick isn't manually dragged
      if (!state.aimStickEngaged) {
        const stickLerp = 1 - Math.exp(-24 * dt)
        mouseStickVisualX += (state.mouseAimVisualX - mouseStickVisualX) * stickLerp
        mouseStickVisualY += (state.mouseAimVisualY - mouseStickVisualY) * stickLerp
        const decay = Math.exp(-14 * dt)
        state.mouseAimVisualX *= decay
        state.mouseAimVisualY *= decay
        if (Math.hypot(state.mouseAimVisualX, state.mouseAimVisualY) < 0.2) {
          state.mouseAimVisualX = 0
          state.mouseAimVisualY = 0
        }
        const vMag = Math.hypot(mouseStickVisualX, mouseStickVisualY)
        if (vMag < 0.15 && state.mouseAimVisualX === 0 && state.mouseAimVisualY === 0) {
          mouseStickVisualX = 0
          mouseStickVisualY = 0
        }
        if (stickRefs.aimKnobRef.current) {
          stickRefs.aimKnobRef.current.style.transform = `translate(${mouseStickVisualX.toFixed(1)}px, ${mouseStickVisualY.toFixed(1)}px)`
        }
        stickRefs.aimStickRef.current?.classList.toggle('is-engaged', vMag > 1.5)
      } else {
        mouseStickVisualX = 0
        mouseStickVisualY = 0
        state.mouseAimVisualX = 0
        state.mouseAimVisualY = 0
      }

      const moveForward = manualForward + state.touchMoveY
      const moveRight = manualRight + state.touchMoveX
      const hasMoveInput = Math.abs(moveForward) > 0.005 || Math.abs(moveRight) > 0.005

      if (
        replayState &&
        replayState.cameraFollow === 'recorded' &&
        (hasMoveInput ||
          state.dragTurning ||
          state.pointerLocked ||
          state.moveStickEngaged ||
          state.aimStickEngaged ||
          state.zoomEngaged ||
          state.touchAimX !== 0 ||
          state.touchAimY !== 0)
      ) {
        replayState.cameraFollow = 'free'
        replayState.callbacks?.onCameraFollowChange?.('free')
      }

      if (hasMoveInput) {
        clearActiveFocusForFreeMove()
        if (state.cameraTween) {
          state.targetYaw = state.yaw
          state.targetPitch = state.pitch
          state.cameraTween = null
        }
      }

      let targetVelX = 0
      let targetVelZ = 0
      if (hasMoveInput) {
        forwardVec.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize()
        rightVec.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).normalize()

        moveVec
          .set(0, 0, 0)
          .addScaledVector(forwardVec, moveForward)
          .addScaledVector(rightVec, moveRight)
        if (moveVec.length() > 1) {
          moveVec.normalize()
        }
        targetVelX = moveVec.x * WALK_SPEED
        targetVelZ = moveVec.z * WALK_SPEED
      }

      if (!state.cameraTween) {
        const isAccelerating =
          Math.hypot(targetVelX, targetVelZ) > Math.hypot(state.velX, state.velZ)
        const velRate = isAccelerating ? 7.5 : 6.2
        const velLerp = 1 - Math.exp(-velRate * dt)
        state.velX += (targetVelX - state.velX) * velLerp
        state.velZ += (targetVelZ - state.velZ) * velLerp

        if (Math.hypot(state.velX, state.velZ) > 0.5) {
          const nextX = camera.position.x + state.velX * dt
          const nextZ = camera.position.z + state.velZ * dt
          const [resolvedX, resolvedZ] = resolveTableCollision(nextX, nextZ)
          const nextY =
            camera.position.y +
            (EYE_HEIGHT - camera.position.y) * (1 - Math.exp(-10 * dt))
          camera.position.set(
            resolvedX,
            Math.abs(EYE_HEIGHT - nextY) < 0.5 ? EYE_HEIGHT : nextY,
            resolvedZ,
          )
        } else {
          state.velX = 0
          state.velZ = 0
        }
      }

      // Smooth optical camera zoom (mouse wheel & HUD zoom slider)
      if (
        replayState &&
        replayState.cameraFollow === 'recorded' &&
        activeReplaySample
      ) {
        camera.position.set(
          activeReplaySample.camX,
          activeReplaySample.camY,
          activeReplaySample.camZ,
        )
        state.yaw = activeReplaySample.yaw
        state.pitch = activeReplaySample.pitch
        state.targetYaw = activeReplaySample.yaw
        state.targetPitch = activeReplaySample.pitch
        camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ')
        state.velX = 0
        state.velZ = 0

        state.zoomNorm = activeReplaySample.zoomNorm
        state.targetZoomNorm = activeReplaySample.zoomNorm
        if (Math.abs(camera.fov - activeReplaySample.fov) > 0.005) {
          camera.fov = activeReplaySample.fov
          camera.updateProjectionMatrix()
        }

        if (stickRefs.moveKnobRef.current) {
          stickRefs.moveKnobRef.current.style.transform = `translate(${activeReplaySample.moveKnobX.toFixed(1)}px, ${activeReplaySample.moveKnobY.toFixed(1)}px)`
        }
        stickRefs.moveStickRef.current?.classList.toggle(
          'is-engaged',
          (activeReplaySample.flags & FRAME_FLAG_MOVE_ENGAGED) !== 0 ||
            Math.hypot(
              activeReplaySample.moveKnobX,
              activeReplaySample.moveKnobY,
            ) > 1.8,
        )

        if (stickRefs.aimKnobRef.current) {
          stickRefs.aimKnobRef.current.style.transform = `translate(${activeReplaySample.aimKnobX.toFixed(1)}px, ${activeReplaySample.aimKnobY.toFixed(1)}px)`
        }
        stickRefs.aimStickRef.current?.classList.toggle(
          'is-engaged',
          (activeReplaySample.flags & FRAME_FLAG_AIM_ENGAGED) !== 0 ||
            Math.hypot(
              activeReplaySample.aimKnobX,
              activeReplaySample.aimKnobY,
            ) > 1.8,
        )

        if (stickRefs.zoomKnobRef.current) {
          const knobY = (0.5 - state.zoomNorm) * 2 * ZOOM_KNOB_TRAVEL_PX
          stickRefs.zoomKnobRef.current.style.transform = `translateY(${knobY.toFixed(1)}px)`
        }
        stickRefs.zoomCtrlRef.current?.classList.toggle(
          'is-engaged',
          (activeReplaySample.flags & FRAME_FLAG_ZOOM_ENGAGED) !== 0 ||
            Math.abs(state.zoomNorm - DEFAULT_ZOOM_NORM) > 0.03,
        )
      } else {
        const zoomLerp = 1 - Math.exp(-16 * dt)
        state.zoomNorm += (state.targetZoomNorm - state.zoomNorm) * zoomLerp
        if (Math.abs(state.targetZoomNorm - state.zoomNorm) < 0.0005) {
          state.zoomNorm = state.targetZoomNorm
        }
        const nextFov =
          MAX_ZOOM_FOV - state.zoomNorm * (MAX_ZOOM_FOV - MIN_ZOOM_FOV)
        if (Math.abs(camera.fov - nextFov) > 0.005) {
          camera.fov = nextFov
          camera.updateProjectionMatrix()
        }
        if (stickRefs.zoomKnobRef.current) {
          const knobY = (0.5 - state.zoomNorm) * 2 * ZOOM_KNOB_TRAVEL_PX
          stickRefs.zoomKnobRef.current.style.transform = `translateY(${knobY.toFixed(1)}px)`
        }
        stickRefs.zoomCtrlRef.current?.classList.toggle(
          'is-engaged',
          state.zoomEngaged ||
            Math.abs(state.zoomNorm - DEFAULT_ZOOM_NORM) > 0.03,
        )
      }

      camera.updateMatrixWorld(true)

      // Compute active aim coordinates in stage pixels (cursor in desktop unlocked mode, center in FPS/touch)
      const stageW = Math.max(1, stageEl.clientWidth)
      const stageH = Math.max(1, stageEl.clientHeight)
      let aimStageX = stageW * 0.5
      let aimStageY = stageH * 0.5
      if (replayState && activeReplaySample) {
        aimStageX = activeReplaySample.cursorU * stageW
        aimStageY = activeReplaySample.cursorV * stageH
        aimNdc.set(
          activeReplaySample.cursorU * 2 - 1,
          -(activeReplaySample.cursorV * 2 - 1),
        )
      } else {
        if (
          !state.pointerLocked &&
          !touchCapable &&
          state.lastMouseX >= 0 &&
          state.lastMouseY >= 0
        ) {
          const stageRect = stageEl.getBoundingClientRect()
          aimStageX = Math.max(
            0,
            Math.min(stageW, state.lastMouseX - stageRect.left),
          )
          aimStageY = Math.max(
            0,
            Math.min(stageH, state.lastMouseY - stageRect.top),
          )
        }
        aimNdc.set((aimStageX / stageW) * 2 - 1, -(aimStageY / stageH) * 2 + 1)
      }

      const operatorCamera =
        replayState && activeReplaySample ? replayState.recPoseCam : camera
      const operatorYaw =
        replayState && activeReplaySample ? activeReplaySample.yaw : state.yaw

      // Update held Zebra label surface preview
      if (heldMode === 'label') {
        raycaster.setFromCamera(aimNdc, operatorCamera)
        const surfaces = [
          ...placeableBaseSurfaces,
          ...shelvesController.getBoxSurfaceMeshes(),
          ...printManager.getPlacedLabelSurfaces(),
        ]
        const canPlace = printManager.updateHeldLabelPreview(
          raycaster,
          operatorCamera,
          operatorYaw,
          surfaces,
          dt,
        )
        if (!replayState && !state.pointerLocked && !state.dragTurning) {
          stageEl.style.cursor = canPlace ? 'copy' : 'grabbing'
        }
      }

      // Update handheld barcode scanner pose, 3D laser beam & live optical spot WASM decoding
      let scannerAimWorld: InstanceType<typeof THREE.Vector3> | null = null
      let scannerHitNormal: InstanceType<typeof THREE.Vector3> | null = null

      if (heldMode === 'scanner') {
        if (laserReticleRef?.current) {
          const reticleEl = laserReticleRef.current
          if (!replayState || replayState.cameraFollow === 'recorded') {
            reticleEl.style.transform = `translate3d(${aimStageX.toFixed(1)}px, ${aimStageY.toFixed(1)}px, 0) translate(-50%, -50%)`
            reticleEl.classList.add('is-visible')
            reticleEl.classList.toggle('is-hit', scanSuccessFlash > 0.05)
          } else {
            reticleEl.classList.remove('is-visible', 'is-hit')
          }
        }

        raycaster.setFromCamera(aimNdc, operatorCamera)
        const laserTargets = [
          ...printManager.getAllSheetMeshes(),
          ...placeableBaseSurfaces,
          ...shelvesController.getBoxSurfaceMeshes(),
          ...cutoutTargets,
        ]
        const laserHits = raycaster.intersectObjects(laserTargets, false)
        if (laserHits.length > 0 && laserHits[0].distance <= 45000) {
          const lh = laserHits[0]
          scannerAimWorld = tmpScannerAimPoint.copy(lh.point)
          if (lh.face) {
            tmpScannerHitNormal
              .copy(lh.face.normal)
              .transformDirection(lh.object.matrixWorld)
              .normalize()
            tmpToCam.copy(operatorCamera.position).sub(lh.point)
            if (tmpScannerHitNormal.dot(tmpToCam) < 0) {
              tmpScannerHitNormal.negate()
            }
            scannerHitNormal = tmpScannerHitNormal
          }
        } else {
          scannerAimWorld = raycaster.ray.at(9000, tmpScannerAimPoint)
        }
      }

      const moveSpeedNorm = Math.min(
        1,
        Math.hypot(state.velX, state.velZ) / WALK_SPEED,
      )
      updateScannerPose({
        held: heldMode === 'scanner',
        dt,
        camera: operatorCamera,
        aspect: operatorCamera.aspect,
        aimWorldPoint: scannerAimWorld,
        hitNormal: scannerHitNormal,
        hoverAmount: scannerHover,
        dockHoverAmount: scannerDockHover,
        triggerAnim: scannerTriggerAnim,
        successFlash: scanSuccessFlash,
        moveSpeedNorm,
        timeSec: now * 0.001,
      })

      // Capture spot around the laser crosshair: live HUD viewfinder while aiming,
      // and decode via zxing-wasm ONLY on actual click/trigger; auto-return to dock after one successful scan.
      const shouldDecodeSpot =
        !replayState &&
        heldMode === 'scanner' &&
        pendingScanTrigger &&
        !scanDecodeBusy
      const shouldUpdatePreview =
        heldMode === 'scanner' &&
        !shouldDecodeSpot &&
        !scanDecodeBusy &&
        Boolean(scannerPreviewCanvasRef?.current) &&
        now - lastScanPreviewMs >= SCAN_INTERVAL_MS

      if (shouldDecodeSpot || shouldUpdatePreview) {
        lastScanPreviewMs = now

        const prevShadowAuto = webglRenderer.shadowMap.autoUpdate
        const prevScannerVis = scannerGroup.visible
        const prevLaserVis = laserVisualsGroup.visible
        const prevAutoClear = webglRenderer.autoClear

        webglRenderer.shadowMap.autoUpdate = false
        webglRenderer.autoClear = true
        scannerGroup.visible = false
        laserVisualsGroup.visible = false

        const spotStageW =
          replayState && activeReplaySample
            ? Math.max(1, activeReplaySample.stageW)
            : stageW
        const spotStageH =
          replayState && activeReplaySample
            ? Math.max(1, activeReplaySample.stageH)
            : stageH
        const spotAimX =
          replayState && activeReplaySample
            ? activeReplaySample.cursorU * spotStageW
            : aimStageX
        const spotAimY =
          replayState && activeReplaySample
            ? activeReplaySample.cursorV * spotStageH
            : aimStageY

        operatorCamera.layers.set(0)
        operatorCamera.setViewOffset(
          spotStageW,
          spotStageH,
          spotAimX - SCAN_SPOT_CSS_W * 0.5,
          spotAimY - SCAN_SPOT_CSS_H * 0.5,
          SCAN_SPOT_CSS_W,
          SCAN_SPOT_CSS_H,
        )
        webglRenderer.setRenderTarget(scanRT)
        webglRenderer.render(webglScene, operatorCamera)
        webglRenderer.readRenderTargetPixels(
          scanRT,
          0,
          0,
          SCAN_RT_W,
          SCAN_RT_H,
          scanPixelBuf,
        )

        operatorCamera.clearViewOffset()
        webglRenderer.setRenderTarget(null)
        scannerGroup.visible = prevScannerVis
        laserVisualsGroup.visible = prevLaserVis
        webglRenderer.shadowMap.autoUpdate = prevShadowAuto
        webglRenderer.autoClear = prevAutoClear

        const previewCtx =
          scannerPreviewCanvasRef?.current?.getContext('2d') ?? null

        if (shouldDecodeSpot) {
          pendingScanTrigger = false
          scanDecodeBusy = true

          decodeSpotPixels(scanPixelBuf, SCAN_RT_W, SCAN_RT_H, previewCtx)
            .then((decoded) => {
              scanDecodeBusy = false
              if (disposed || replayState || heldMode !== 'scanner' || !decoded) {
                return
              }

              scanSuccessFlash = 1
              playScannerBeep(Boolean(isAudioMuted?.()))

              const posCenterTablet = tabletInstances.find(
                (t) => t.spec.id === 'pos-center',
              )
              const deliveredToTablet = Boolean(posCenterTablet?.poweredOn)
              const timestamp = Date.now()

              pushRecordedEvent({
                type: 'scanner:decoded',
                code: decoded.code,
                format: decoded.format,
                deliveredToTablet,
              })

              // Emit scanned string to the 12" wide center POS tablet ('pos-center')
              channel.sendTo('pos-center', 'scanner:scan', {
                code: decoded.code,
                text: decoded.code,
                format: decoded.format,
                tabletId: 'pos-center',
                timestamp,
              })

              sceneCallbacks.onBarcodeScan?.({
                code: decoded.code,
                format: decoded.format,
                tabletId: 'pos-center',
                deliveredToTablet,
                timestamp,
              })

              // Return the scanner smoothly back to its tabletop dock after one successful scan
              putDownScanner()
            })
            .catch(() => {
              scanDecodeBusy = false
            })
        } else {
          paintSpotPreview(scanPixelBuf, SCAN_RT_W, SCAN_RT_H, previewCtx)
        }
      }

      // Front-face check & pointer-events routing for the real iframes (hidden during offline WebGL Replay)
      if (replayState) {
        for (const t of tabletInstances) {
          t.cssObject.visible = false
          t.wrapperEl.style.visibility = 'hidden'
          t.wrapperEl.style.pointerEvents = 'none'
          t.iframeEl.style.pointerEvents = 'none'
        }
      } else {
        for (const t of tabletInstances) {
          t.cutoutMesh.getWorldPosition(tmpWorldPos)
          t.cutoutMesh.getWorldQuaternion(tmpWorldQuat)
          tmpNormal.set(0, 0, 1).applyQuaternion(tmpWorldQuat)
          tmpToCam.copy(camera.position).sub(tmpWorldPos)

          const isFrontFacing = tmpNormal.dot(tmpToCam) > 0
          t.cssObject.visible = t.poweredOn
          if (!t.poweredOn) {
            t.wrapperEl.style.visibility = 'hidden'
            t.wrapperEl.style.pointerEvents = 'none'
            t.iframeEl.style.pointerEvents = 'none'
          } else if (!isFrontFacing) {
            t.wrapperEl.style.visibility = 'hidden'
            t.wrapperEl.style.pointerEvents = 'none'
            t.iframeEl.style.pointerEvents = 'none'
          } else {
            t.wrapperEl.style.visibility = 'visible'
            const interactive =
              !state.pointerLocked && !state.dragTurning && heldMode === 'none'
                ? 'auto'
                : 'none'
            t.wrapperEl.style.pointerEvents = interactive
            t.iframeEl.style.pointerEvents = interactive
          }
        }
      }

      if (recordingActive && !replayState) {
        if (
          state.activeView !== lastRecordedActiveView ||
          state.fullscreenTabletId !== lastRecordedFullscreenId
        ) {
          lastRecordedActiveView = state.activeView
          lastRecordedFullscreenId = state.fullscreenTabletId
          pushRecordedEvent({
            type: 'view:change',
            activeView: state.activeView,
            fullscreenTabletId: state.fullscreenTabletId,
          })
        }

        const recT = Math.max(0, Math.round(now - recordStartPerfNow))
        let flags = 0
        if (state.pointerLocked) flags |= FRAME_FLAG_POINTER_LOCKED
        if (state.dragTurning) flags |= FRAME_FLAG_DRAG_TURNING
        if (state.lastMouseX >= 0 && state.lastMouseY >= 0) {
          flags |= FRAME_FLAG_HAS_CURSOR
        }
        if (state.moveStickEngaged) flags |= FRAME_FLAG_MOVE_ENGAGED
        if (state.aimStickEngaged) flags |= FRAME_FLAG_AIM_ENGAGED
        if (state.zoomEngaged) flags |= FRAME_FLAG_ZOOM_ENGAGED
        if (scanSuccessFlash > 0.05) flags |= FRAME_FLAG_SCANNER_FLASH

        let recMoveKnobX = keyStickVisualX
        let recMoveKnobY = keyStickVisualY
        if (state.moveStickEngaged && stickRefs.moveKnobRef.current) {
          const m = stickRefs.moveKnobRef.current.style.transform.match(
            /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/,
          )
          if (m) {
            recMoveKnobX = Number(m[1]) || 0
            recMoveKnobY = Number(m[2]) || 0
          }
        }

        let recAimKnobX = mouseStickVisualX
        let recAimKnobY = mouseStickVisualY
        if (state.aimStickEngaged && stickRefs.aimKnobRef.current) {
          const m = stickRefs.aimKnobRef.current.style.transform.match(
            /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/,
          )
          if (m) {
            recAimKnobX = Number(m[1]) || 0
            recAimKnobY = Number(m[2]) || 0
          }
        }

        const frameIndex = recordedFrames.length
        recordedFrames.push([
          recT,
          Math.round(camera.position.x * 2) / 2,
          Math.round(camera.position.y * 2) / 2,
          Math.round(camera.position.z * 2) / 2,
          Number(state.yaw.toFixed(5)),
          Number(state.pitch.toFixed(5)),
          Number(camera.fov.toFixed(3)),
          stageW,
          stageH,
          Number((aimStageX / stageW).toFixed(4)),
          Number((aimStageY / stageH).toFixed(4)),
          Number(recMoveKnobX.toFixed(1)),
          Number(recMoveKnobY.toFixed(1)),
          Number(recAimKnobX.toFixed(1)),
          Number(recAimKnobY.toFixed(1)),
          Number(state.zoomNorm.toFixed(4)),
          flags,
        ])
        recordPaintSyncStamp?.(frameIndex)

        if (recordOnStats && now - lastRecordStatsMs >= 200) {
          lastRecordStatsMs = now
          recordOnStats({
            durationMs: recT,
            frameCount: recordedFrames.length,
            eventCount: recordedEvents.length,
          })
        }
      }

      const targetBlur =
        (state.activeView === 'left' ||
          state.activeView === 'center' ||
          state.activeView === 'right' ||
          state.fullscreenTabletId !== null) &&
          heldMode === 'none'
          ? 1
          : 0
      focusBlurAmount +=
        (targetBlur - focusBlurAmount) * (1 - Math.exp(-14 * dt))
      if (Math.abs(focusBlurAmount - targetBlur) < 0.002) {
        focusBlurAmount = targetBlur
      }

      focusBlurPass.render(focusBlurAmount)
      cssRenderer.render(cssScene, camera)
      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
  })

  return {
    channel,
    navigateToView: (view: NavPresetId) => navigateImpl?.(view),
    returnToPrevious: () => returnPrevImpl?.(),
    toggleDrawer: () => toggleDrawerImpl?.(),
    setDrawerCash: (amountEur: number) => setDrawerCashImpl?.(amountEur),
    setTabletPower: (tabletId: string, poweredOn: boolean) =>
      setTabletPowerImpl?.(tabletId, poweredOn),
    toggleTabletPower: (tabletId: string) => toggleTabletPowerImpl?.(tabletId),
    setZebraReel: (reelId: ZebraReelId) => setZebraReelImpl?.(reelId),
    getZebraMedia: () => activeZebraMedia,
    printZpl: (zpl: string) => printZplImpl?.(zpl),
    printEscPos: (payload: string | Uint8Array | number[]) =>
      printEscPosImpl?.(payload),
    rotateHeldLabel: () => rotateHeldLabelImpl?.(),
    dropHeldItem: () => dropHeldItemImpl?.(),
    toggleScanner: () => toggleScannerImpl?.(),
    onBarcodeScan: (callback) => {
      scanListeners.add(callback)
      return () => {
        scanListeners.delete(callback)
      }
    },
    setShelfProducts: (products) => setShelfProductsImpl?.(products) ?? [],
    upsertShelfProduct: (product) => upsertShelfProductImpl?.(product) ?? [],
    clearShelves: () => clearShelvesImpl?.(),
    startRecordingSession: (options) =>
      startRecordingImpl ? startRecordingImpl(options) : false,
    recordCustomEvent: (ev) => recordCustomEventImpl?.(ev),
    stopRecordingSession: async () =>
      stopRecordingImpl ? stopRecordingImpl() : null,
    enterReplayMode: (session, replayCallbacks) =>
      enterReplayImpl ? enterReplayImpl(session, replayCallbacks) : null,
    dispose: () => {
      disposed = true
      if (animId) cancelAnimationFrame(animId)
      scanListeners.clear()
      channel.dispose()
      if (
        typeof window !== 'undefined' &&
        window.quixposSceneChannel === channel
      ) {
        delete window.quixposSceneChannel
      }
      for (const fn of cleanupFns) fn()
      cleanupFns = []
    },
  }
}
