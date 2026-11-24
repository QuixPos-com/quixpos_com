import { createCameraTween, getViewCameraPose } from './cameraPhysics'
import {
  SPAWN_PITCH,
  SPAWN_POS,
  SPAWN_YAW,
  STICK_CURVE_EXP,
  STICK_DEADZONE,
  STICK_MAX_R,
  STICK_MOVE_SENSITIVITY,
} from './config'
import type {
  FocusViewId,
  SceneCallbacks,
  SceneRuntimeState,
  TabletInstance,
  ThreeModule,
  TouchStickRefs,
} from './types'

export interface InputControllerParams {
  stageEl: HTMLDivElement
  THREE: ThreeModule
  camera: InstanceType<ThreeModule['PerspectiveCamera']>
  raycaster: InstanceType<ThreeModule['Raycaster']>
  state: SceneRuntimeState
  tabletInstances: TabletInstance[]
  plateTargets: Array<InstanceType<ThreeModule['Mesh']>>
  drawerTargets: Array<InstanceType<ThreeModule['Mesh']>>
  powerTargets: Array<InstanceType<ThreeModule['Mesh']>>
  stickRefs: TouchStickRefs
  callbacks: SceneCallbacks
  toggleCashDrawer: () => void
  ensureCashDrawerOpen: () => void
  reloadTablet: (tabletId: string) => void
}

const MAX_POSE_HISTORY = 20

export function attachInputController({
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
  callbacks,
  toggleCashDrawer,
  ensureCashDrawerOpen,
  reloadTablet,
}: InputControllerParams) {
  let disposed = false
  let dragLooking = false
  let holdPointerLocked = false
  let mouseDownOnStage = false
  let mouseDownStartX = 0
  let mouseDownStartY = 0
  let mouseDragged = false
  let lastDragX = 0
  let lastDragY = 0
  let mouseStickMode: 'move' | 'aim' | null = null

  let hoveredTabletId: string | null = null
  let hasPointerActivity = false
  let lastTouchTime = 0
  let moveTouchId: number | null = null
  let aimTouchId: number | null = null
  let tapTouchId: number | null = null
  let tapStartX = 0
  let tapStartY = 0

  const pointerNdc = new THREE.Vector2(0, 0)
  const cleanupFns: Array<() => void> = []

  for (const t of tabletInstances) {
    const onEnter = () => {
      hoveredTabletId = t.spec.id
      hasPointerActivity = true
      state.lastMouseX = -9999
      state.lastMouseY = -9999
    }
    const onLeave = () => {
      if (hoveredTabletId === t.spec.id) {
        hoveredTabletId = null
      }
    }
    t.wrapperEl.addEventListener('pointerenter', onEnter)
    t.wrapperEl.addEventListener('pointermove', onEnter)
    t.wrapperEl.addEventListener('pointerleave', onLeave)
    cleanupFns.push(() => {
      t.wrapperEl.removeEventListener('pointerenter', onEnter)
      t.wrapperEl.removeEventListener('pointermove', onEnter)
      t.wrapperEl.removeEventListener('pointerleave', onLeave)
    })
  }

  const setActiveView = (view: FocusViewId | null) => {
    state.activeView = view
    callbacks.onActiveViewChange(view)
  }

  const isFocusedWithBlur = () =>
    state.activeView !== null && state.activeView !== 'total'

  const clearActiveFocusForFreeMove = () => {
    if (state.activeView !== null) {
      setActiveView(null)
    }
  }

  const pushCurrentPoseToHistory = () => {
    const cur = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      yaw: state.yaw,
      pitch: state.pitch,
      activeView: state.activeView,
    }
    const last = state.poseHistory[state.poseHistory.length - 1]
    if (
      last &&
      Math.hypot(last.x - cur.x, last.y - cur.y, last.z - cur.z) < 25 &&
      Math.abs(last.yaw - cur.yaw) < 0.02 &&
      Math.abs(last.pitch - cur.pitch) < 0.02
    ) {
      return
    }
    state.poseHistory.push(cur)
    if (state.poseHistory.length > MAX_POSE_HISTORY) {
      state.poseHistory.shift()
    }
  }

  const navigateToFocusView = (view: FocusViewId) => {
    const pose = getViewCameraPose(
      THREE,
      camera.fov,
      stageEl.clientWidth,
      stageEl.clientHeight,
      view,
    )

    const distToTarget = Math.hypot(
      camera.position.x - pose.x,
      camera.position.y - pose.y,
      camera.position.z - pose.z,
    )
    if (
      distToTarget > 25 ||
      Math.abs(state.yaw - pose.yaw) > 0.02 ||
      Math.abs(state.pitch - pose.pitch) > 0.02
    ) {
      pushCurrentPoseToHistory()
    }

    if (view === 'drawer') {
      ensureCashDrawerOpen()
    }

    setActiveView(view)
    stageEl.style.cursor = ''
    state.velX = 0
    state.velZ = 0

    if (document.pointerLockElement === stageEl) {
      document.exitPointerLock()
    }

    state.cameraTween = createCameraTween(
      camera.position,
      state.yaw,
      state.pitch,
      pose.x,
      pose.y,
      pose.z,
      pose.yaw,
      pose.pitch,
    )
    state.targetYaw = state.cameraTween.toYaw
    state.targetPitch = pose.pitch
  }

  const returnToPreviousPose = () => {
    window.focus()
    state.velX = 0
    state.velZ = 0
    const prev = state.poseHistory.pop()
    if (prev) {
      setActiveView(prev.activeView)
      state.cameraTween = createCameraTween(
        camera.position,
        state.yaw,
        state.pitch,
        prev.x,
        prev.y,
        prev.z,
        prev.yaw,
        prev.pitch,
      )
      state.targetYaw = state.cameraTween.toYaw
      state.targetPitch = prev.pitch
    } else if (isFocusedWithBlur()) {
      setActiveView('total')
      state.cameraTween = createCameraTween(
        camera.position,
        state.yaw,
        state.pitch,
        SPAWN_POS.x,
        SPAWN_POS.y,
        SPAWN_POS.z,
        SPAWN_YAW,
        SPAWN_PITCH,
      )
      state.targetYaw = state.cameraTween.toYaw
      state.targetPitch = SPAWN_PITCH
    }
  }

  const setNdcFromClient = (clientX: number, clientY: number) => {
    const rect = stageEl.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointerNdc, camera)
    return true
  }

  const hitPowerAtClient = (clientX: number, clientY: number) => {
    if (!setNdcFromClient(clientX, clientY)) return null
    const hits = raycaster.intersectObjects(powerTargets, false)
    if (hits.length === 0) return null
    return (hits[0].object.userData.tabletId as string) ?? null
  }

  const hitPlateAtClient = (clientX: number, clientY: number) => {
    if (!setNdcFromClient(clientX, clientY)) return null
    const hits = raycaster.intersectObjects(plateTargets, false)
    if (hits.length === 0) return null
    return (hits[0].object.userData.tabletId as FocusViewId) ?? null
  }

  const hitDrawerAtClient = (clientX: number, clientY: number) => {
    if (!setNdcFromClient(clientX, clientY)) return false
    return raycaster.intersectObjects(drawerTargets, false).length > 0
  }

  const setIframeDragShield = (shielded: boolean) => {
    state.dragTurning = shielded
    const mode = shielded || state.pointerLocked ? 'none' : 'auto'
    for (const t of tabletInstances) {
      if (t.poweredOn && t.wrapperEl.style.visibility !== 'hidden') {
        t.wrapperEl.style.pointerEvents = mode
        t.iframeEl.style.pointerEvents = mode
      }
    }
  }

  const syncPointerMode = (locked: boolean) => {
    state.pointerLocked = locked
    if (!locked) {
      holdPointerLocked = false
    }
    if (locked) {
      dragLooking = false
      state.cameraTween = null
      state.targetYaw = state.yaw
      state.targetPitch = state.pitch
      stageEl.style.cursor = ''
      clearActiveFocusForFreeMove()
    }
    const showFpsCrosshair = locked && !holdPointerLocked
    callbacks.onLockChange(showFpsCrosshair)
    if (!showFpsCrosshair) {
      callbacks.onTargetChange(null)
      state.currentTargetTitle = null
      state.currentTargetId = null
      state.currentTargetKind = null
      state.currentTargetPoweredOn = null
      state.currentTargetLoginPrompt = false
    }
  }

  const tryEnterPointerLock = () => {
    window.focus()
    if (document.pointerLockElement === stageEl) return
    try {
      const maybePromise = stageEl.requestPointerLock() as unknown as
        | Promise<void>
        | undefined
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          // Fallback drag-to-look remains available
        })
      }
    } catch {
      // Ignore if blocked
    }
  }

  // Stick visual & deadzone helper (shared by touch and desktop mouse stick drag)
  const setMirrorVisibility = (isMove: boolean, visible: boolean) => {
    const stickEl = isMove ? stickRefs.moveStickRef.current : stickRefs.aimStickRef.current
    const mirrorEl = isMove
      ? stickRefs.moveMirrorRef.current
      : stickRefs.aimMirrorRef.current
    const mirrorDotEl = isMove
      ? stickRefs.moveMirrorDotRef.current
      : stickRefs.aimMirrorDotRef.current

    if (isMove) {
      state.moveStickEngaged = visible
    } else {
      state.aimStickEngaged = visible
    }

    stickEl?.classList.toggle('is-engaged', visible)
    mirrorEl?.classList.toggle('is-visible', visible)
    if (!visible) {
      mirrorEl?.classList.remove('is-outside-deadzone')
      if (mirrorDotEl) {
        mirrorDotEl.style.transform = 'translate(0px, 0px)'
        mirrorDotEl.classList.remove('is-outside-deadzone')
      }
    }
  }

  const updateStickVector = (
    stickEl: HTMLDivElement | null,
    knobEl: HTMLDivElement | null,
    mirrorEl: HTMLDivElement | null,
    mirrorDotEl: HTMLDivElement | null,
    clientX: number,
    clientY: number,
    isMove: boolean,
  ) => {
    if (!stickEl) return
    const rect = stickEl.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = clientX - cx
    let dy = clientY - cy
    const len = Math.hypot(dx, dy)
    if (len > STICK_MAX_R) {
      dx = (dx / len) * STICK_MAX_R
      dy = (dy / len) * STICK_MAX_R
    }

    const transformStr = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`
    if (knobEl) {
      knobEl.style.transform = transformStr
    }
    if (mirrorDotEl) {
      mirrorDotEl.style.transform = transformStr
    }

    const normLen = Math.min(1, len / STICK_MAX_R)
    const outsideDeadzone = normLen > STICK_DEADZONE
    mirrorEl?.classList.toggle('is-outside-deadzone', outsideDeadzone)
    mirrorDotEl?.classList.toggle('is-outside-deadzone', outsideDeadzone)

    let outX = 0
    let outY = 0
    if (outsideDeadzone && len > 0) {
      const rescaled = (normLen - STICK_DEADZONE) / (1 - STICK_DEADZONE)
      const curved = Math.pow(rescaled, STICK_CURVE_EXP)
      const ux = dx / len
      const uy = dy / len
      outX = ux * curved
      outY = uy * curved
    }

    if (isMove) {
      state.touchMoveX = outX * STICK_MOVE_SENSITIVITY
      state.touchMoveY = -outY * STICK_MOVE_SENSITIVITY
    } else {
      state.touchAimX = outX
      state.touchAimY = outY
    }
  }

  const resetStick = (isMove: boolean) => {
    const knobEl = isMove ? stickRefs.moveKnobRef.current : stickRefs.aimKnobRef.current
    if (knobEl) {
      knobEl.style.transform = 'translate(0px, 0px)'
    }
    setMirrorVisibility(isMove, false)
    if (isMove) {
      state.touchMoveX = 0
      state.touchMoveY = 0
      moveTouchId = null
    } else {
      state.touchAimX = 0
      state.touchAimY = 0
      aimTouchId = null
    }
  }

  const onPointerLockChange = () => {
    syncPointerMode(document.pointerLockElement === stageEl)
  }

  const onPointerLockError = () => {
    syncPointerMode(false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const code = e.code
    if (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      state.pressedKeys.add(code)
    } else if (code === 'Escape' && isFocusedWithBlur() && !state.pointerLocked) {
      returnToPreviousPose()
    } else if (code === 'KeyE' || code === 'Tab') {
      e.preventDefault()
      if (document.pointerLockElement === stageEl) {
        if (state.currentTargetKind === 'power' && state.currentTargetId) {
          reloadTablet(state.currentTargetId)
        } else if (state.currentTargetKind === 'drawer') {
          toggleCashDrawer()
        } else if (state.currentTargetId && state.currentTargetKind === 'label') {
          navigateToFocusView(state.currentTargetId as FocusViewId)
        } else {
          document.exitPointerLock()
        }
      } else {
        tryEnterPointerLock()
      }
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    state.pressedKeys.delete(e.code)
  }

  const onWindowBlur = () => {
    state.pressedKeys.clear()
    dragLooking = false
    mouseDownOnStage = false
    setIframeDragShield(false)
    if (holdPointerLocked && document.pointerLockElement === stageEl) {
      holdPointerLocked = false
      document.exitPointerLock()
    }
    if (mouseStickMode === 'move') resetStick(true)
    if (mouseStickMode === 'aim') resetStick(false)
    mouseStickMode = null
    window.setTimeout(() => {
      if (disposed || state.pointerLocked) return
      const activeEl = document.activeElement
      const hit = tabletInstances.find((t) => t.iframeEl === activeEl)
      if (!hit) return
      if (!(hasPointerActivity && hoveredTabletId === hit.spec.id) && !isFocusedWithBlur()) {
        window.focus()
      }
    }, 0)
  }

  const pushMouseAimVisual = (dxPx: number, dyPx: number) => {
    let vx = state.mouseAimVisualX * 0.45 + dxPx
    let vy = state.mouseAimVisualY * 0.45 + dyPx
    const mag = Math.hypot(vx, vy)
    if (mag > STICK_MAX_R) {
      vx = (vx / mag) * STICK_MAX_R
      vy = (vy / mag) * STICK_MAX_R
    }
    state.mouseAimVisualX = vx
    state.mouseAimVisualY = vy
  }

  const onMouseMove = (e: MouseEvent) => {
    if (Date.now() - lastTouchTime < 700) return
    state.lastMouseX = e.clientX
    state.lastMouseY = e.clientY

    if (mouseStickMode === 'move') {
      updateStickVector(
        stickRefs.moveStickRef.current,
        stickRefs.moveKnobRef.current,
        stickRefs.moveMirrorRef.current,
        stickRefs.moveMirrorDotRef.current,
        e.clientX,
        e.clientY,
        true,
      )
      return
    }

    if (mouseStickMode === 'aim') {
      updateStickVector(
        stickRefs.aimStickRef.current,
        stickRefs.aimKnobRef.current,
        stickRefs.aimMirrorRef.current,
        stickRefs.aimMirrorDotRef.current,
        e.clientX,
        e.clientY,
        false,
      )
      return
    }

    const sensitivity = 0.0022
    if (state.pointerLocked) {
      if (state.cameraTween) {
        state.targetYaw = state.yaw
        state.targetPitch = state.pitch
        state.cameraTween = null
      }
      const prevYaw = state.targetYaw
      const prevPitch = state.targetPitch
      state.targetYaw -= e.movementX * sensitivity
      state.targetPitch -= e.movementY * sensitivity
      const maxPitch = Math.PI * 0.46
      state.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, state.targetPitch))
      const dYaw = state.targetYaw - prevYaw
      const dPitch = state.targetPitch - prevPitch
      if (dYaw !== 0 || dPitch !== 0) {
        pushMouseAimVisual(-dYaw * 640, -dPitch * 640)
      }
    } else if (dragLooking) {
      const distFromDown = Math.hypot(
        e.clientX - mouseDownStartX,
        e.clientY - mouseDownStartY,
      )
      if (!mouseDragged && distFromDown >= 4) {
        mouseDragged = true
        clearActiveFocusForFreeMove()
        setIframeDragShield(true)
        holdPointerLocked = true
        tryEnterPointerLock()
      }
      if (mouseDragged) {
        if (state.cameraTween) {
          state.targetYaw = state.yaw
          state.targetPitch = state.pitch
          state.cameraTween = null
        }
        const prevYaw = state.targetYaw
        const prevPitch = state.targetPitch
        const dx = e.clientX - lastDragX
        const dy = e.clientY - lastDragY
        state.targetYaw -= dx * sensitivity * 1.25
        state.targetPitch -= dy * sensitivity * 1.25
        const maxPitch = Math.PI * 0.46
        state.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, state.targetPitch))
        const dYaw = state.targetYaw - prevYaw
        const dPitch = state.targetPitch - prevPitch
        if (dYaw !== 0 || dPitch !== 0) {
          pushMouseAimVisual(-dYaw * 640, -dPitch * 640)
        }
      }
      lastDragX = e.clientX
      lastDragY = e.clientY
    } else {
      const hitPower = hitPowerAtClient(e.clientX, e.clientY)
      const hitPlate = !hitPower ? hitPlateAtClient(e.clientX, e.clientY) : null
      const hitDrawer = !hitPower && !hitPlate && hitDrawerAtClient(e.clientX, e.clientY)
      stageEl.style.cursor =
        hitPower || hitDrawer || hitPlate || isFocusedWithBlur() ? 'pointer' : ''
    }
  }

  const onStageMouseDown = (e: MouseEvent) => {
    if (Date.now() - lastTouchTime < 700) return
    const target = e.target as HTMLElement | null
    if (target && target.closest('.scene3d-hud-top, .scene3d-hud-bottom')) {
      return
    }

    if (e.button === 0 && target) {
      if (stickRefs.moveStickRef.current?.contains(target)) {
        e.preventDefault()
        mouseStickMode = 'move'
        setMirrorVisibility(true, true)
        updateStickVector(
          stickRefs.moveStickRef.current,
          stickRefs.moveKnobRef.current,
          stickRefs.moveMirrorRef.current,
          stickRefs.moveMirrorDotRef.current,
          e.clientX,
          e.clientY,
          true,
        )
        return
      }
      if (stickRefs.aimStickRef.current?.contains(target)) {
        e.preventDefault()
        mouseStickMode = 'aim'
        setMirrorVisibility(false, true)
        updateStickVector(
          stickRefs.aimStickRef.current,
          stickRefs.aimKnobRef.current,
          stickRefs.aimMirrorRef.current,
          stickRefs.aimMirrorDotRef.current,
          e.clientX,
          e.clientY,
          false,
        )
        return
      }
    }

    if (state.pointerLocked) {
      if (!holdPointerLocked && e.button === 0 && state.currentTargetId) {
        if (state.currentTargetKind === 'power') {
          reloadTablet(state.currentTargetId)
        } else if (state.currentTargetKind === 'drawer') {
          toggleCashDrawer()
        } else if (state.currentTargetKind === 'label') {
          navigateToFocusView(state.currentTargetId as FocusViewId)
        } else {
          document.exitPointerLock()
        }
      }
      return
    }

    if (e.button === 0) {
      mouseDownOnStage = true
      mouseDragged = false
      mouseDownStartX = e.clientX
      mouseDownStartY = e.clientY
      dragLooking = true
      lastDragX = e.clientX
      lastDragY = e.clientY

      const hitInteractive =
        Boolean(hitPowerAtClient(e.clientX, e.clientY)) ||
        Boolean(hitPlateAtClient(e.clientX, e.clientY)) ||
        hitDrawerAtClient(e.clientX, e.clientY)
      if (!hitInteractive) {
        setIframeDragShield(true)
      }
    }
  }

  const onWindowMouseUp = (e: MouseEvent) => {
    if (mouseStickMode === 'move') {
      resetStick(true)
      mouseStickMode = null
      return
    }
    if (mouseStickMode === 'aim') {
      resetStick(false)
      mouseStickMode = null
      return
    }

    setIframeDragShield(false)

    if (holdPointerLocked && e.button === 0) {
      holdPointerLocked = false
      dragLooking = false
      mouseDownOnStage = false
      if (document.pointerLockElement === stageEl) {
        document.exitPointerLock()
      }
      return
    }

    const wasClickOnStage = mouseDownOnStage && !mouseDragged && e.button === 0
    dragLooking = false
    mouseDownOnStage = false

    if (wasClickOnStage && !state.pointerLocked && Date.now() - lastTouchTime >= 700) {
      const powerId = hitPowerAtClient(e.clientX, e.clientY)
      if (powerId) {
        reloadTablet(powerId)
        return
      }
      const plateId = hitPlateAtClient(e.clientX, e.clientY)
      if (plateId) {
        navigateToFocusView(plateId)
        return
      }
      if (hitDrawerAtClient(e.clientX, e.clientY)) {
        toggleCashDrawer()
        return
      }
      // Clicking the blurred backdrop around the focused item returns to previous position
      if (isFocusedWithBlur()) {
        returnToPreviousPose()
      }
    }
  }

  const onStageTouchStart = (e: TouchEvent) => {
    lastTouchTime = Date.now()
    const target = e.target as HTMLElement | null
    if (target && target.closest('.scene3d-hud-top, .scene3d-hud-bottom')) {
      return
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      const touchTarget = touch.target as HTMLElement | null
      if (touchTarget && stickRefs.moveStickRef.current?.contains(touchTarget)) {
        if (moveTouchId === null) {
          moveTouchId = touch.identifier
          setMirrorVisibility(true, true)
          updateStickVector(
            stickRefs.moveStickRef.current,
            stickRefs.moveKnobRef.current,
            stickRefs.moveMirrorRef.current,
            stickRefs.moveMirrorDotRef.current,
            touch.clientX,
            touch.clientY,
            true,
          )
        }
        e.preventDefault()
      } else if (touchTarget && stickRefs.aimStickRef.current?.contains(touchTarget)) {
        if (aimTouchId === null) {
          aimTouchId = touch.identifier
          setMirrorVisibility(false, true)
          updateStickVector(
            stickRefs.aimStickRef.current,
            stickRefs.aimKnobRef.current,
            stickRefs.aimMirrorRef.current,
            stickRefs.aimMirrorDotRef.current,
            touch.clientX,
            touch.clientY,
            false,
          )
        }
        e.preventDefault()
      } else if (tapTouchId === null) {
        tapTouchId = touch.identifier
        tapStartX = touch.clientX
        tapStartY = touch.clientY
      }
    }
  }

  const onWindowTouchMove = (e: TouchEvent) => {
    lastTouchTime = Date.now()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch.identifier === moveTouchId) {
        updateStickVector(
          stickRefs.moveStickRef.current,
          stickRefs.moveKnobRef.current,
          stickRefs.moveMirrorRef.current,
          stickRefs.moveMirrorDotRef.current,
          touch.clientX,
          touch.clientY,
          true,
        )
        e.preventDefault()
      } else if (touch.identifier === aimTouchId) {
        updateStickVector(
          stickRefs.aimStickRef.current,
          stickRefs.aimKnobRef.current,
          stickRefs.aimMirrorRef.current,
          stickRefs.aimMirrorDotRef.current,
          touch.clientX,
          touch.clientY,
          false,
        )
        e.preventDefault()
      }
    }
  }

  const onWindowTouchEnd = (e: TouchEvent) => {
    lastTouchTime = Date.now()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch.identifier === moveTouchId) {
        resetStick(true)
      } else if (touch.identifier === aimTouchId) {
        resetStick(false)
      } else if (touch.identifier === tapTouchId) {
        tapTouchId = null
        const dist = Math.hypot(touch.clientX - tapStartX, touch.clientY - tapStartY)
        if (dist < 14) {
          const powerId = hitPowerAtClient(touch.clientX, touch.clientY)
          if (powerId) {
            reloadTablet(powerId)
          } else {
            const plateId = hitPlateAtClient(touch.clientX, touch.clientY)
            if (plateId) {
              navigateToFocusView(plateId)
            } else if (hitDrawerAtClient(touch.clientX, touch.clientY)) {
              toggleCashDrawer()
            } else if (isFocusedWithBlur()) {
              returnToPreviousPose()
            }
          }
        }
      }
    }
  }

  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('pointerlockerror', onPointerLockError)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
  window.addEventListener('touchend', onWindowTouchEnd)
  window.addEventListener('touchcancel', onWindowTouchEnd)
  stageEl.addEventListener('mousedown', onStageMouseDown)
  stageEl.addEventListener('touchstart', onStageTouchStart, { passive: false })

  const cleanup = () => {
    disposed = true
    document.removeEventListener('pointerlockchange', onPointerLockChange)
    document.removeEventListener('pointerlockerror', onPointerLockError)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onWindowMouseUp)
    window.removeEventListener('touchmove', onWindowTouchMove)
    window.removeEventListener('touchend', onWindowTouchEnd)
    window.removeEventListener('touchcancel', onWindowTouchEnd)
    stageEl.removeEventListener('mousedown', onStageMouseDown)
    stageEl.removeEventListener('touchstart', onStageTouchStart)

    for (const fn of cleanupFns) fn()
  }

  return {
    navigateToFocusView,
    returnToPreviousPose,
    clearActiveFocusForFreeMove,
    cleanup,
  }
}
