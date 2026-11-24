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
import { buildLightingAndFloor, buildTable } from './models/environment'
import { buildEpsonPrinter } from './models/epsonPrinter'
import { buildStationLoupes } from './models/stationLoupes'
import { buildTablets } from './models/tablets'
import { buildZebraPrinter } from './models/zebraPrinter'
import { createPrintManager } from './printers/printManager'
import {
  decodeSpotPixels,
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
  SceneRuntimeState,
  ScreenPowerSummary,
  TargetKind,
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

  const scanListeners = new Set<(scan: BarcodeScanEvent) => void>()

  const channel = createSceneBroadcastChannel()
  if (typeof window !== 'undefined') {
    window.quixposSceneChannel = channel
  }

  let lastBroadcastView: NavPresetId | null = 'total'
  let lastBroadcastLocked = false
  const sceneCallbacks: SceneCallbacks = {
    onLockChange: (locked) => {
      callbacks.onLockChange(locked)
      if (locked !== lastBroadcastLocked) {
        lastBroadcastLocked = locked
        channel.send('scene:lockChanged', { locked })
      }
    },
    onTargetChange: callbacks.onTargetChange,
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
    const floorMesh = buildLightingAndFloor(THREE, webglScene, disposables)
    const { tableMeshes } = buildTable(THREE, webglScene, disposables)

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

    // Solid 3D surfaces where Zebra labels can be placed (tabletop, legs, printers, drawer, monitor stands/bezels, floor)
    const placeableBaseSurfaces: Array<InstanceType<typeof THREE.Object3D>> = [
      ...tableMeshes,
      ...drawerSurfaceMeshes,
      ...zebraSurfaceMeshes,
      ...epsonSurfaceMeshes,
      ...tabletSurfaceMeshes,
      floorMesh,
    ]

    const staticRaycastTargets = [
      ...powerTargets,
      ...fullscreenTargets,
      ...zebraTargets,
      ...plateTargets,
      ...cutoutTargets,
      ...drawerTargets,
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
      currentTargetTitle: null,
      currentTargetId: null,
      currentTargetKind: null,
      currentTargetPoweredOn: null,
      currentTargetLoginPrompt: false,
      lastMouseX: -9999,
      lastMouseY: -9999,
      pressedKeys: new Set<string>(),
      wheelMoveY: 0,
      touchMoveX: 0,
      touchMoveY: 0,
      touchAimX: 0,
      touchAimY: 0,
      moveStickEngaged: false,
      aimStickEngaged: false,
      mouseAimVisualX: 0,
      mouseAimVisualY: 0,
    }

    let heldMode: HeldItemMode = 'none'
    let scannerTriggerAnim = 0
    let scanSuccessFlash = 0
    let scannerHover = 0
    let scannerDockHover = 0
    let lastScanAttemptMs = 0
    let scanDecodeBusy = false
    let latchedScanCode: string | null = null
    let emptyScanFrames = 0
    let lastScanEmitMs = 0
    let manualTriggerArmed = false

    let drawerOpen = false
    let drawerZCurrent = 0
    let drawerZTarget = 0
    let btnPressAnim = 0
    let cashBtnHover = 0

    let keyStickVisualX = 0
    let keyStickVisualY = 0
    let mouseStickVisualX = 0
    let mouseStickVisualY = 0

    let refreshInputShield: (() => void) | null = null

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
      if (heldMode !== 'none') return false
      if (printManager.pickUpLabel(target)) {
        setHeldMode('label')
        return true
      }
      return false
    }

    const commitHeldLabelPlacement = (
      clientX?: number,
      clientY?: number,
    ): boolean => {
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
              ...printManager.getPlacedLabelSurfaces(),
            ],
            1,
          )
        }
      }
      if (printManager.placeHeldLabel()) {
        setHeldMode('none')
        return true
      }
      return false
    }

    const pickUpScanner = () => {
      if (heldMode === 'label') {
        printManager.cancelHeldLabel()
      }
      warmScannerDecoder()
      latchedScanCode = null
      emptyScanFrames = 0
      manualTriggerArmed = false
      scannerTriggerAnim = 0.65
      setHeldMode('scanner')
    }

    const putDownScanner = () => {
      if (heldMode !== 'scanner') return
      manualTriggerArmed = false
      latchedScanCode = null
      setHeldMode('none')
    }

    const triggerScannerPulse = () => {
      if (heldMode !== 'scanner') return
      scannerTriggerAnim = 1
      manualTriggerArmed = true
      latchedScanCode = null
      lastScanAttemptMs = 0
    }

    const cancelHeldItem = () => {
      if (heldMode === 'label') {
        printManager.cancelHeldLabel()
        setHeldMode('none')
      } else if (heldMode === 'scanner') {
        putDownScanner()
      }
    }

    const setCashDrawerOpen = (nextOpen: boolean) => {
      if (drawerOpen === nextOpen) return
      drawerOpen = nextOpen
      drawerZTarget = drawerOpen ? DRAWER_OPEN_OFFSET : 0
      btnPressAnim = 1
      drawerBtnFaceMat.map = drawerOpen ? closeBtnTex : openBtnTex
      drawerBtnFaceMat.needsUpdate = true
      sceneCallbacks.onDrawerChange(drawerOpen)
    }

    const toggleCashDrawer = () => {
      setCashDrawerOpen(!drawerOpen)
    }

    const ensureCashDrawerOpen = () => {
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
    ) => {
      target.powerPressAnim = 1
      target.reloadFlash = 0.55
      target.loginPromptTimer = LOGIN_PROMPT_DURATION
      target.powerFaceMat.map = powerActiveTex
      target.powerFaceMat.emissive.set('#f59e0b')
      target.powerFaceMat.emissiveIntensity = 0.75
      target.powerFaceMat.needsUpdate = true
      channel.send('screen:powerBlocked', {
        tabletId: target.spec.id,
        reason: 'login_required',
      })
    }

    const setSingleTabletPower = (
      tabletId: string,
      nextOn: boolean,
      broadcast = true,
      nextEnabled?: boolean,
    ): boolean => {
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
      const target = tabletInstances.find((t) => t.spec.id === tabletId)
      if (!target || !target.poweredOn) return
      target.powerPressAnim = 1
      target.reloadFlash = 1
      target.powerFaceMat.map = powerActiveTex
      target.powerFaceMat.emissive.set('#f59e0b')
      target.powerFaceMat.emissiveIntensity = 0.75
      target.powerFaceMat.needsUpdate = true

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
      cleanup: cleanupInput,
    } = attachInputController({
      stageEl,
      THREE,
      camera,
      raycaster,
      state,
      tabletInstances,
      cutoutTargets,
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
      rotateHeldLabel: () => printManager.rotateHeldLabel(),
      cancelHeldItem,
      pickUpScanner,
      putDownScanner,
      triggerScannerPulse,
      stickRefs,
      callbacks: sceneCallbacks,
      toggleCashDrawer,
      ensureCashDrawerOpen,
      reloadTablet: handleBezelPowerButton,
      openZebraReelPicker: () => {
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
      const view = data.view as NavPresetId
      if (validFocusViews.has(view)) {
        navigateToFocusView(view)
      }
    })
    channel.on('camera:return', () => {
      returnToPreviousPose()
    })
    channel.on('tablet:reload', (data, meta) => {
      const targetId =
        typeof data.tabletId === 'string' && data.tabletId
          ? data.tabletId
          : meta.sender
      reloadTablet(targetId)
    })

    const applyZebraReel = (reelId: ZebraReelId, broadcast = true) => {
      const next = getZebraReelById(reelId)
      activeZebraMedia = next
      printManager.setZebraMedia(next)
      setZebraReelVisual(next.widthMm)
      callbacks.onZebraReelChange?.(next)
      if (broadcast) {
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

    navigateImpl = (view: NavPresetId) => {
      navigateToFocusView(view)
    }

    returnPrevImpl = () => {
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
      printManager.rotateHeldLabel()
    }

    dropHeldItemImpl = () => {
      cancelHeldItem()
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
    const screenCenter = new THREE.Vector2(0, 0)
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
    let smoothedDt = 1 / 60
    let focusBlurAmount = 0

    const tick = (now: number) => {
      if (disposed) return
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
      lastTime = now
      smoothedDt += (rawDt - smoothedDt) * 0.35
      const dt = smoothedDt

      // Proximity grow animations for the 4 navigation loupes & cash drawer button
      const hoverSmooth = 1 - Math.exp(-16 * dt)
      for (const l of loupeInstances) {
        const isAlreadyFocused = state.activeView === l.viewId
        const loupeProx = getCursorProximity(
          l.loupeGroup,
          150,
          state,
          stageEl,
          camera,
          tmpProjVec,
        )
        const plateProx = l.plateMesh
          ? getCursorProximity(l.plateMesh, 130, state, stageEl, camera, tmpProjVec) *
          0.75
          : 0
        const targetHover = !isAlreadyFocused ? Math.max(loupeProx, plateProx) : 0

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

      // Subtle orange glow on the Zebra side latches when hovered or targeted
      let zebraLatchProx = 0
      if (state.pointerLocked && state.currentTargetKind === 'zebra-latch') {
        zebraLatchProx = 1
      } else {
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

      const btnTargetHover = getCursorProximity(
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
        const pTargetHover = getCursorProximity(
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
        const fsTargetHover = getCursorProximity(
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

      // Cash drawer slide & button press animation
      if (Math.abs(drawerZTarget - drawerZCurrent) > 0.5) {
        const lerp = 1 - Math.exp(-12 * dt)
        drawerZCurrent += (drawerZTarget - drawerZCurrent) * lerp
      } else {
        drawerZCurrent = drawerZTarget
      }
      drawerTrayGroup.position.z = drawerZCurrent

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

      // Keyboard WASD + wheel + left-stick walking
      let keyForward = 0
      let keyRight = 0
      if (state.pressedKeys.has('KeyW') || state.pressedKeys.has('ArrowUp')) {
        keyForward += 1
      }
      if (state.pressedKeys.has('KeyS') || state.pressedKeys.has('ArrowDown')) {
        keyForward -= 1
      }
      if (state.pressedKeys.has('KeyD') || state.pressedKeys.has('ArrowRight')) {
        keyRight += 1
      }
      if (state.pressedKeys.has('KeyA') || state.pressedKeys.has('ArrowLeft')) {
        keyRight -= 1
      }

      const manualForward = keyForward + state.wheelMoveY
      const hasManualMove = Math.abs(manualForward) > 0.01 || keyRight !== 0

      // Animate left stick knob on desktop keypresses/wheel or viewpoint flight when stick isn't manually dragged
      if (!state.moveStickEngaged) {
        let targetKx = hasManualMove ? keyRight : tweenStickMoveX
        let targetKy = hasManualMove ? -manualForward : tweenStickMoveY
        const kLen = Math.hypot(targetKx, targetKy)
        if (kLen > 1) {
          targetKx /= kLen
          targetKy /= kLen
        }
        const stickLerp = 1 - Math.exp(-20 * dt)
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
      const moveRight = keyRight + state.touchMoveX
      const hasMoveInput = Math.abs(moveForward) > 0.005 || Math.abs(moveRight) > 0.005

      if (state.wheelMoveY !== 0) {
        state.wheelMoveY *= Math.exp(-10 * dt)
        if (Math.abs(state.wheelMoveY) < 0.01) {
          state.wheelMoveY = 0
        }
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
        const velLerp = 1 - Math.exp(-16 * dt)
        state.velX += (targetVelX - state.velX) * velLerp
        state.velZ += (targetVelZ - state.velZ) * velLerp

        if (Math.hypot(state.velX, state.velZ) > 2) {
          const nextX = camera.position.x + state.velX * dt
          const nextZ = camera.position.z + state.velZ * dt
          const [resolvedX, resolvedZ] = resolveTableCollision(nextX, nextZ)
          camera.position.set(resolvedX, EYE_HEIGHT, resolvedZ)
        } else {
          state.velX = 0
          state.velZ = 0
        }
      }

      camera.updateMatrixWorld(true)

      // Compute active aim coordinates in stage pixels (cursor in desktop unlocked mode, center in FPS/touch)
      const stageW = Math.max(1, stageEl.clientWidth)
      const stageH = Math.max(1, stageEl.clientHeight)
      let aimStageX = stageW * 0.5
      let aimStageY = stageH * 0.5
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

      // Update held Zebra label surface preview
      if (heldMode === 'label') {
        raycaster.setFromCamera(aimNdc, camera)
        const surfaces = [
          ...placeableBaseSurfaces,
          ...printManager.getPlacedLabelSurfaces(),
        ]
        const canPlace = printManager.updateHeldLabelPreview(
          raycaster,
          camera,
          state.yaw,
          surfaces,
          dt,
        )
        if (!state.pointerLocked && !state.dragTurning) {
          stageEl.style.cursor = canPlace ? 'copy' : 'grabbing'
        }
      }

      // Update handheld barcode scanner pose, 3D laser beam & live optical spot WASM decoding
      let scannerAimWorld: InstanceType<typeof THREE.Vector3> | null = null
      let scannerHitNormal: InstanceType<typeof THREE.Vector3> | null = null

      if (heldMode === 'scanner') {
        if (laserReticleRef?.current) {
          const reticleEl = laserReticleRef.current
          reticleEl.style.transform = `translate3d(${aimStageX.toFixed(1)}px, ${aimStageY.toFixed(1)}px, 0) translate(-50%, -50%)`
          reticleEl.classList.add('is-visible')
          reticleEl.classList.toggle('is-hit', scanSuccessFlash > 0.05)
        }

        raycaster.setFromCamera(aimNdc, camera)
        const laserTargets = [
          ...printManager.getAllSheetMeshes(),
          ...placeableBaseSurfaces,
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
            tmpToCam.copy(camera.position).sub(lh.point)
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
        camera,
        aspect: camera.aspect,
        aimWorldPoint: scannerAimWorld,
        hitNormal: scannerHitNormal,
        hoverAmount: scannerHover,
        dockHoverAmount: scannerDockHover,
        triggerAnim: scannerTriggerAnim,
        successFlash: scanSuccessFlash,
        moveSpeedNorm,
        timeSec: now * 0.001,
      })

      // Live screenshot of the small spot around the laser crosshair -> zxing-wasm decoder
      if (
        heldMode === 'scanner' &&
        !scanDecodeBusy &&
        now - lastScanAttemptMs >= SCAN_INTERVAL_MS
      ) {
        lastScanAttemptMs = now
        scanDecodeBusy = true

        const prevShadowAuto = webglRenderer.shadowMap.autoUpdate
        const prevScannerVis = scannerGroup.visible
        const prevLaserVis = laserVisualsGroup.visible
        const prevAutoClear = webglRenderer.autoClear

        webglRenderer.shadowMap.autoUpdate = false
        webglRenderer.autoClear = true
        scannerGroup.visible = false
        laserVisualsGroup.visible = false

        camera.layers.set(0)
        camera.setViewOffset(
          stageW,
          stageH,
          aimStageX - SCAN_SPOT_CSS_W * 0.5,
          aimStageY - SCAN_SPOT_CSS_H * 0.5,
          SCAN_SPOT_CSS_W,
          SCAN_SPOT_CSS_H,
        )
        webglRenderer.setRenderTarget(scanRT)
        webglRenderer.render(webglScene, camera)
        webglRenderer.readRenderTargetPixels(
          scanRT,
          0,
          0,
          SCAN_RT_W,
          SCAN_RT_H,
          scanPixelBuf,
        )

        camera.clearViewOffset()
        webglRenderer.setRenderTarget(null)
        scannerGroup.visible = prevScannerVis
        laserVisualsGroup.visible = prevLaserVis
        webglRenderer.shadowMap.autoUpdate = prevShadowAuto
        webglRenderer.autoClear = prevAutoClear

        const previewCtx =
          scannerPreviewCanvasRef?.current?.getContext('2d') ?? null

        decodeSpotPixels(scanPixelBuf, SCAN_RT_W, SCAN_RT_H, previewCtx)
          .then((decoded) => {
            scanDecodeBusy = false
            if (disposed || heldMode !== 'scanner') return

            if (!decoded) {
              emptyScanFrames++
              if (emptyScanFrames >= 4) {
                latchedScanCode = null
              }
              return
            }

            emptyScanFrames = 0
            const nowMs = performance.now()
            const canEmit =
              decoded.code !== latchedScanCode &&
              (nowMs - lastScanEmitMs >= 320 || manualTriggerArmed)

            if (!canEmit) return

            latchedScanCode = decoded.code
            lastScanEmitMs = nowMs
            manualTriggerArmed = false
            scanSuccessFlash = 1
            playScannerBeep(Boolean(isAudioMuted?.()))

            const posCenterTablet = tabletInstances.find(
              (t) => t.spec.id === 'pos-center',
            )
            const deliveredToTablet = Boolean(posCenterTablet?.poweredOn)
            const timestamp = Date.now()

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
          })
          .catch(() => {
            scanDecodeBusy = false
          })
      }

      // Front-face check & pointer-events routing for the real iframes
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

      // Raycast from crosshair when in Pointer Lock mode
      if (state.pointerLocked) {
        raycaster.setFromCamera(screenCenter, camera)
        const activeRaycastTargets =
          heldMode === 'label'
            ? []
            : heldMode === 'scanner'
              ? [
                ...scannerDockTargets,
                ...powerTargets,
                ...fullscreenTargets,
                ...plateTargets,
                ...drawerTargets,
              ]
              : [
                ...printManager.getZebraLabelTargets(),
                ...scannerTargets,
                ...staticRaycastTargets,
              ]
        const hits =
          activeRaycastTargets.length > 0
            ? raycaster.intersectObjects(activeRaycastTargets, false)
            : []
        const hasHit = hits.length > 0 && hits[0].distance <= 24000
        const hitData = hasHit ? hits[0].object.userData : null
        const nextTitle = hitData ? (hitData.tabletTitle as string) : null
        const nextId = hitData ? (hitData.tabletId as string) : null
        const nextKind = hitData
          ? ((hitData.kind as TargetKind) ?? 'screen')
          : null
        const nextPoweredOn =
          hitData && typeof hitData.poweredOn === 'boolean'
            ? (hitData.poweredOn as boolean)
            : null
        const nextControllable =
          hitData && typeof hitData.controllablePower === 'boolean'
            ? (hitData.controllablePower as boolean)
            : false
        const hitTablet = nextId
          ? tabletInstances.find((t) => t.spec.id === nextId)
          : undefined
        const nextLoginPrompt = Boolean(
          hitTablet && !hitTablet.poweredOn && hitTablet.loginPromptTimer > 0,
        )
        state.currentTargetId = nextId
        if (
          nextTitle !== state.currentTargetTitle ||
          nextKind !== state.currentTargetKind ||
          nextPoweredOn !== state.currentTargetPoweredOn ||
          nextLoginPrompt !== state.currentTargetLoginPrompt
        ) {
          state.currentTargetTitle = nextTitle
          state.currentTargetKind = nextKind
          state.currentTargetPoweredOn = nextPoweredOn
          state.currentTargetLoginPrompt = nextLoginPrompt
          callbacks.onTargetChange(
            nextTitle && nextKind
              ? {
                title: nextTitle,
                kind: nextKind,
                poweredOn: nextPoweredOn ?? undefined,
                controllablePower: nextControllable,
                loginRequiredPrompt: nextLoginPrompt,
              }
              : null,
          )
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
    onBarcodeScan: (callback) => {
      scanListeners.add(callback)
      return () => {
        scanListeners.delete(callback)
      }
    },
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
