import {
  ARENA_HALF,
  DRAWER_X,
  PLAYER_RADIUS,
  SPAWN_PITCH,
  SPAWN_POS,
  SPAWN_YAW,
  TABLET_Z,
  TABLE_D,
  TABLE_W,
} from './config'
import type {
  CameraTween,
  FocusViewId,
  SceneRuntimeState,
  ThreeModule,
} from './types'

export function resolveTableCollision(px: number, pz: number): [number, number] {
  const halfW = TABLE_W / 2 + PLAYER_RADIUS
  const halfD = TABLE_D / 2 + PLAYER_RADIUS
  if (Math.abs(px) < halfW && Math.abs(pz) < halfD) {
    const overlapX = halfW - Math.abs(px)
    const overlapZ = halfD - Math.abs(pz)
    if (overlapX < overlapZ) {
      px = px >= 0 ? halfW : -halfW
    } else {
      pz = pz >= 0 ? halfD : -halfD
    }
  }
  px = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, px))
  pz = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, pz))
  return [px, pz]
}

function frameBoxPose(
  THREE: ThreeModule,
  cameraFov: number,
  stageWidth: number,
  stageHeight: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  boxW: number,
  boxH: number,
  pitch: number,
  minDist: number,
  fillV = 0.72,
  fillH = 0.78,
) {
  const fovRad = THREE.MathUtils.degToRad(cameraFov)
  const halfV = Math.tan(fovRad / 2)
  const aspect = Math.max(0.5, stageWidth / Math.max(1, stageHeight))
  const dVert = boxH / 2 / (fillV * halfV)
  const dHoriz = boxW / 2 / (fillH * aspect * halfV)
  const dist = Math.max(dVert, dHoriz, minDist)
  const tilt = -pitch
  return {
    x: centerX,
    y: centerY + dist * Math.sin(tilt),
    z: centerZ + dist * Math.cos(tilt),
    yaw: 0,
    pitch,
  }
}

export function getViewCameraPose(
  THREE: ThreeModule,
  cameraFov: number,
  stageWidth: number,
  stageHeight: number,
  view: FocusViewId,
) {
  if (view === 'total') {
    return {
      x: SPAWN_POS.x,
      y: SPAWN_POS.y,
      z: SPAWN_POS.z,
      yaw: SPAWN_YAW,
      pitch: SPAWN_PITCH,
    }
  }

  if (view === 'left') {
    // Frames 27" 16:9 widescreen Büro monitor (-3694..-1226) + Zebra ZD420 shipping label printer (-1114..-574)
    return frameBoxPose(
      THREE,
      cameraFov,
      stageWidth,
      stageHeight,
      -2140,
      3760,
      960,
      3140,
      1580,
      -0.33,
      1500,
      0.74,
      0.82,
    )
  }

  if (view === 'center') {
    // Frame Kasse (POS) up close while angled slightly right so Kunde stays mostly in view
    const aspect = Math.max(0.5, stageWidth / Math.max(1, stageHeight))
    const aspectScale = Math.min(1.6, Math.max(1, 1.55 / aspect))
    const dist = 1720 * aspectScale
    const yaw = -0.29
    const pitch = -0.44
    const cosPitch = Math.cos(pitch)
    const lookX = -Math.sin(yaw) * cosPitch
    const lookY = Math.sin(pitch)
    const lookZ = -Math.cos(yaw) * cosPitch
    const anchorX = 180
    const anchorY = 3750
    const anchorZ = TABLET_Z
    return {
      x: anchorX - lookX * dist,
      y: anchorY - lookY * dist,
      z: anchorZ - lookZ * dist,
      yaw,
      pitch,
    }
  }

  if (view === 'right') {
    // Frames Kundendisplay + SumUp Virtual Solo + Epson TM-m30III + Inateck BCST-70 scanner
    return frameBoxPose(
      THREE,
      cameraFov,
      stageWidth,
      stageHeight,
      1825,
      3445,
      950,
      1860,
      980,
      -0.34,
      1250,
      0.68,
      0.78,
    )
  }

  if (view === 'drawer') {
    // High eye-level view looking steeply down into the open under-table cash drawer (Euro notes, coins & button)
    return frameBoxPose(
      THREE,
      cameraFov,
      stageWidth,
      stageHeight,
      DRAWER_X,
      2660,
      1920,
      1540,
      1120,
      -0.92,
      2550,
      0.66,
      0.76,
    )
  }

  return {
    x: SPAWN_POS.x,
    y: SPAWN_POS.y,
    z: SPAWN_POS.z,
    yaw: SPAWN_YAW,
    pitch: SPAWN_PITCH,
  }
}

export function createCameraTween(
  fromPos: { x: number; y: number; z: number },
  fromYaw: number,
  fromPitch: number,
  toX: number,
  toY: number,
  toZ: number,
  toYaw: number,
  toPitch: number,
  duration = 0.46,
): CameraTween {
  let deltaYaw = (toYaw - fromYaw) % (Math.PI * 2)
  if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2
  if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2
  return {
    fromX: fromPos.x,
    fromY: fromPos.y,
    fromZ: fromPos.z,
    fromYaw,
    fromPitch,
    toX,
    toY,
    toZ,
    toYaw: fromYaw + deltaYaw,
    toPitch,
    elapsed: 0,
    duration,
  }
}

export function stepCameraTween(
  state: SceneRuntimeState,
  camera: InstanceType<ThreeModule['PerspectiveCamera']>,
  dt: number,
) {
  const tween = state.cameraTween
  if (!tween) return
  tween.elapsed += dt
  const p = Math.min(1, tween.elapsed / tween.duration)
  const ease = 1 - Math.pow(1 - p, 3)
  camera.position.set(
    tween.fromX + (tween.toX - tween.fromX) * ease,
    tween.fromY + (tween.toY - tween.fromY) * ease,
    tween.fromZ + (tween.toZ - tween.fromZ) * ease,
  )
  state.yaw = tween.fromYaw + (tween.toYaw - tween.fromYaw) * ease
  state.pitch = tween.fromPitch + (tween.toPitch - tween.fromPitch) * ease
  state.targetYaw = state.yaw
  state.targetPitch = state.pitch
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ')
  if (p >= 1) {
    state.cameraTween = null
  }
}

export function getCursorProximity(
  obj: InstanceType<ThreeModule['Object3D']>,
  radiusPx: number,
  state: SceneRuntimeState,
  stageEl: HTMLElement,
  camera: InstanceType<ThreeModule['PerspectiveCamera']>,
  tmpProjVec: InstanceType<ThreeModule['Vector3']>,
) {
  if (!state.pointerLocked && (state.lastMouseX < 0 || state.lastMouseY < 0)) {
    return 0
  }
  const rect = stageEl.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return 0
  const mx = state.pointerLocked ? rect.width / 2 : state.lastMouseX - rect.left
  const my = state.pointerLocked ? rect.height / 2 : state.lastMouseY - rect.top
  obj.getWorldPosition(tmpProjVec)
  tmpProjVec.project(camera)
  if (tmpProjVec.z <= -1 || tmpProjVec.z >= 1) return 0
  const sx = (tmpProjVec.x * 0.5 + 0.5) * rect.width
  const sy = (-tmpProjVec.y * 0.5 + 0.5) * rect.height
  const dist = Math.hypot(mx - sx, my - sy)
  const t = Math.max(0, 1 - dist / radiusPx)
  return t * t * (3 - 2 * t)
}
