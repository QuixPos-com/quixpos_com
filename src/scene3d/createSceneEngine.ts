import {
  getCursorProximity,
  resolveTableCollision,
  stepCameraTween,
} from './cameraPhysics'
import {
  DRAWER_D,
  DRAWER_OPEN_OFFSET,
  EYE_HEIGHT,
  SPAWN_PITCH,
  SPAWN_POS,
  SPAWN_YAW,
  STICK_MAX_R,
  STICK_PITCH_SPEED,
  STICK_YAW_SPEED,
  WALK_SPEED,
} from './config'
import { createSceneBroadcastChannel } from './iframeChannel'
import { attachInputController } from './inputController'
import { buildBarcodeScanner } from './models/barcodeScanner'
import { buildCashDrawer } from './models/cashDrawer'
import { buildLightingAndFloor, buildTable } from './models/environment'
import { buildEpsonPrinter } from './models/epsonPrinter'
import { buildStationLoupes } from './models/stationLoupes'
import { buildTablets } from './models/tablets'
import { buildZebraPrinter } from './models/zebraPrinter'
import { createPrintManager } from './printers/printManager'
import type {
  Disposable,
  NavPresetId,
  SceneCallbacks,
  SceneController,
  SceneRuntimeState,
  ScreenPowerSummary,
  TargetKind,
  TouchStickRefs,
} from './types'

export interface MountSceneOptions {
  stageEl: HTMLDivElement
  cssLayerEl: HTMLDivElement
  canvasEl: HTMLCanvasElement
  touchCapable: boolean
  stickRefs: TouchStickRefs
  callbacks: SceneCallbacks
}

export function mountSceneEngine({
  stageEl,
  cssLayerEl,
  canvasEl,
  touchCapable,
  stickRefs,
  callbacks,
}: MountSceneOptions): SceneController {
  let disposed = false
  let animId = 0
  let cleanupFns: Array<() => void> = []

  let navigateImpl: ((view: NavPresetId) => void) | null = null
  let returnPrevImpl: (() => void) | null = null
  let toggleDrawerImpl: (() => void) | null = null
  let setTabletPowerImpl: ((tabletId: string, poweredOn: boolean) => void) | null =
    null
  let toggleTabletPowerImpl: ((tabletId: string) => void) | null = null
  let printZplImpl: ((zpl: string) => void) | null = null
  let printEscPosImpl:
    | ((payload: string | Uint8Array | number[]) => void)
    | null = null

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

    // 3. Environment & POS Hardware Models
    buildLightingAndFloor(THREE, webglScene, disposables)
    buildTable(THREE, webglScene, disposables)

    const {
      tabletInstances,
      cutoutTargets,
      powerTargets,
      cutoutOnMat,
      screenOffMat,
      camDotOnMat,
      camDotOffMat,
      powerIdleTex,
      powerActiveTex,
      powerOffTex,
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
    } = buildCashDrawer(THREE, webglScene, disposables)

    const { loupeInstances, plateTargets } = buildStationLoupes(
      THREE,
      webglScene,
      drawerTrayGroup,
      disposables,
    )

    const { printerNetLedMat } = buildEpsonPrinter(
      THREE,
      webglScene,
      disposables,
    )
    buildZebraPrinter(THREE, webglScene, disposables)
    buildBarcodeScanner(THREE, webglScene, disposables)

    const printManager = createPrintManager(
      THREE,
      webglScene,
      printerNetLedMat,
    )
    disposables.push(printManager)

    const raycastTargets = [
      ...powerTargets,
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
      touchMoveX: 0,
      touchMoveY: 0,
      touchAimX: 0,
      touchAimY: 0,
      moveStickEngaged: false,
      aimStickEngaged: false,
      mouseAimVisualX: 0,
      mouseAimVisualY: 0,
    }

    let drawerOpen = false
    let drawerZCurrent = 0
    let drawerZTarget = 0
    let btnPressAnim = 0
    let cashBtnHover = 0

    let keyStickVisualX = 0
    let keyStickVisualY = 0
    let mouseStickVisualX = 0
    let mouseStickVisualY = 0

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
          target.camDot.material = camDotOffMat
          target.cssObject.visible = false
          target.wrapperEl.style.visibility = 'hidden'
          target.wrapperEl.style.pointerEvents = 'none'
          target.iframeEl.style.pointerEvents = 'none'
          if (document.activeElement === target.iframeEl) {
            window.focus()
          }
          target.iframeEl.src = 'about:blank'
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
      stickRefs,
      callbacks: sceneCallbacks,
      toggleCashDrawer,
      ensureCashDrawerOpen,
      reloadTablet: handleBezelPowerButton,
    })

    const validFocusViews = new Set<NavPresetId>([
      'total',
      'left',
      'center',
      'right',
      'drawer',
    ])

    channel.attachTablets(tabletInstances, () => ({
      activeView: state.activeView,
      drawerOpen,
      pointerLocked: state.pointerLocked,
      screens: getControllableScreensMap(),
    }))

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

    channel.on('drawer:open', () => {
      setCashDrawerOpen(true)
    })
    channel.on('drawer:close', () => {
      setCashDrawerOpen(false)
    })
    channel.on('drawer:toggle', () => {
      toggleCashDrawer()
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

    setTabletPowerImpl = (tabletId: string, poweredOn: boolean) => {
      setSingleTabletPower(tabletId, poweredOn, true)
    }

    toggleTabletPowerImpl = (tabletId: string) => {
      const target = tabletInstances.find((t) => t.spec.id === tabletId)
      if (target && !target.spec.canControlScreens) {
        setSingleTabletPower(tabletId, !target.poweredOn, true)
      }
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

    const onResize = () => {
      const w = stageEl.clientWidth
      const h = Math.max(1, stageEl.clientHeight)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      webglRenderer.setSize(w, h)
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
    const tmpNormal = new THREE.Vector3()
    const tmpToCam = new THREE.Vector3()
    const tmpWorldPos = new THREE.Vector3()
    const tmpProjVec = new THREE.Vector3()
    const tmpWorldQuat = new THREE.Quaternion()
    const forwardVec = new THREE.Vector3()
    const rightVec = new THREE.Vector3()
    const moveVec = new THREE.Vector3()

    let lastTime = performance.now()
    let smoothedDt = 1 / 60

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
        l.loupeGroup.scale.setScalar(l.baseScale * (1 + 0.65 * l.hover))
        if (l.liftAxis === 'y') {
          l.loupeGroup.position.y = l.baseY + 16 * l.hover
        } else {
          l.loupeGroup.position.z = l.baseZ + 16 * l.hover
        }
        if (l.plateMesh) {
          l.plateMesh.scale.set(
            1 + 0.08 * l.hover,
            1,
            1 + 0.08 * l.hover,
          )
        }
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

      // Keyboard WASD + left-stick walking
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

      // Animate left stick knob on desktop keypresses or viewpoint flight when stick isn't manually dragged
      if (!state.moveStickEngaged) {
        let targetKx = keyRight !== 0 || keyForward !== 0 ? keyRight : tweenStickMoveX
        let targetKy = keyRight !== 0 || keyForward !== 0 ? -keyForward : tweenStickMoveY
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

      const moveForward = keyForward + state.touchMoveY
      const moveRight = keyRight + state.touchMoveX
      const hasMoveInput = Math.abs(moveForward) > 0.005 || Math.abs(moveRight) > 0.005

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
          const interactive = !state.pointerLocked && !state.dragTurning ? 'auto' : 'none'
          t.wrapperEl.style.pointerEvents = interactive
          t.iframeEl.style.pointerEvents = interactive
        }
      }

      // Raycast from crosshair when in Pointer Lock mode
      if (state.pointerLocked) {
        raycaster.setFromCamera(screenCenter, camera)
        const hits = raycaster.intersectObjects(raycastTargets, false)
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

      webglRenderer.render(webglScene, camera)
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
    setTabletPower: (tabletId: string, poweredOn: boolean) =>
      setTabletPowerImpl?.(tabletId, poweredOn),
    toggleTabletPower: (tabletId: string) => toggleTabletPowerImpl?.(tabletId),
    printZpl: (zpl: string) => printZplImpl?.(zpl),
    printEscPos: (payload: string | Uint8Array | number[]) =>
      printEscPosImpl?.(payload),
    dispose: () => {
      disposed = true
      if (animId) cancelAnimationFrame(animId)
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
