import { SCANNER_X, SCANNER_Z, TABLE_TOP_Y } from '../config'
import { markFocusSharp } from '../focusBlurPass'
import type { Disposable, ThreeModule } from '../types'

export interface ScannerPoseUpdate {
  held: boolean
  dt: number
  camera: InstanceType<ThreeModule['PerspectiveCamera']>
  aspect: number
  aimWorldPoint: InstanceType<ThreeModule['Vector3']> | null
  hitNormal: InstanceType<ThreeModule['Vector3']> | null
  hoverAmount: number
  dockHoverAmount: number
  triggerAnim: number
  successFlash: number
  moveSpeedNorm: number
  timeSec: number
}

export function buildBarcodeScanner(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  const scannerGreyMat = new THREE.MeshStandardMaterial({
    color: '#c4c8ce',
    roughness: 0.45,
    metalness: 0.08,
  })
  const scannerRubberMat = new THREE.MeshStandardMaterial({
    color: '#1b1f26',
    roughness: 0.62,
    metalness: 0.08,
  })
  const scannerLensMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.1,
    metalness: 0.4,
  })
  const scannerBeamMat = new THREE.MeshStandardMaterial({
    color: '#ef4444',
    emissive: '#ef4444',
    emissiveIntensity: 0.9,
  })
  const scannerStatusLedMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    emissive: '#1ec9a8',
    emissiveIntensity: 0.9,
  })

  // Subtle tabletop cradle pad so the user can also click the stand spot to return the scanner
  const dockPadMat = new THREE.MeshStandardMaterial({
    color: '#141923',
    roughness: 0.72,
    metalness: 0.12,
  })
  const dockRingMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    emissive: '#0f9f86',
    emissiveIntensity: 0.15,
    roughness: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const dockPadGeo = new THREE.CylinderGeometry(88, 96, 8, 28)
  const dockRingGeo = new THREE.RingGeometry(74, 86, 28)

  const footOvalGeo = new THREE.CylinderGeometry(72, 78, 34, 24)
  const lowerGripGeo = new THREE.CylinderGeometry(52, 60, 225, 22)
  const rearSpineGeo = new THREE.BoxGeometry(68, 225, 52)
  const upperNeckGeo = new THREE.CylinderGeometry(64, 52, 220, 22)
  const triggerGeo = new THREE.BoxGeometry(44, 98, 56)
  const triggerBumpGeo = new THREE.CylinderGeometry(24, 24, 44, 16)
  const headCoreGeo = new THREE.BoxGeometry(168, 122, 160)
  const hoodRibGeo = new THREE.BoxGeometry(232, 26, 165)
  const scanLensGeo = new THREE.PlaneGeometry(156, 94)
  const scanBeamGeo = new THREE.BoxGeometry(106, 5, 4)
  const statusLedGeo = new THREE.CircleGeometry(7, 14)

  // Rounded oval hood with recessed front cavity (matching BCST-70 front mouth)
  const hoodOuter = new THREE.Shape()
  hoodOuter.absellipse(0, 0, 108, 74, 0, Math.PI * 2, false, 0)
  const hoodHole = new THREE.Path()
  hoodHole.absellipse(0, 0, 76, 44, 0, Math.PI * 2, true, 0)
  hoodOuter.holes.push(hoodHole)

  const hoodGeo = new THREE.ExtrudeGeometry(hoodOuter, {
    depth: 130,
    bevelEnabled: true,
    bevelThickness: 14,
    bevelSize: 12,
    bevelSegments: 4,
  })

  // 3D laser beam & surface laser crosshair visuals (hidden during optical spot screenshot!)
  const laserRayGeo = new THREE.CylinderGeometry(1.5, 3.2, 1, 8, 1, true)
  laserRayGeo.translate(0, 0.5, 0)
  laserRayGeo.rotateX(Math.PI / 2)
  const laserRayMat = new THREE.MeshBasicMaterial({
    color: '#ef4444',
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const laserLineHGeo = new THREE.PlaneGeometry(110, 5)
  const laserLineVGeo = new THREE.PlaneGeometry(4, 38)
  const laserCoreDotGeo = new THREE.CircleGeometry(7, 16)
  const laserSpotMat = new THREE.MeshBasicMaterial({
    color: '#ff3b3b',
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })
  const laserCoreMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  })

  disposables.push(
    scannerGreyMat,
    scannerRubberMat,
    scannerLensMat,
    scannerBeamMat,
    scannerStatusLedMat,
    dockPadMat,
    dockRingMat,
    dockPadGeo,
    dockRingGeo,
    footOvalGeo,
    lowerGripGeo,
    rearSpineGeo,
    upperNeckGeo,
    triggerGeo,
    triggerBumpGeo,
    headCoreGeo,
    hoodRibGeo,
    scanLensGeo,
    scanBeamGeo,
    statusLedGeo,
    hoodGeo,
    laserRayGeo,
    laserRayMat,
    laserLineHGeo,
    laserLineVGeo,
    laserCoreDotGeo,
    laserSpotMat,
    laserCoreMat,
  )

  // Tabletop dock pad
  const dockGroup = new THREE.Group()
  dockGroup.position.set(SCANNER_X, TABLE_TOP_Y, SCANNER_Z)
  dockGroup.rotation.y = -0.36
  webglScene.add(dockGroup)

  const dockUserData = {
    tabletTitle: 'Scanner-Ablage',
    tabletId: 'scanner-dock',
    kind: 'scanner-dock' as const,
  }

  const dockPadMesh = new THREE.Mesh(dockPadGeo, dockPadMat)
  dockPadMesh.scale.set(0.92, 1, 1.38)
  dockPadMesh.position.set(0, 4, 16)
  dockPadMesh.receiveShadow = true
  dockPadMesh.userData = dockUserData
  dockGroup.add(dockPadMesh)

  const dockRingMesh = new THREE.Mesh(dockRingGeo, dockRingMat)
  dockRingMesh.rotation.x = -Math.PI / 2
  dockRingMesh.scale.set(0.92, 1.38, 1)
  dockRingMesh.position.set(0, 8.4, 16)
  dockRingMesh.userData = dockUserData
  dockGroup.add(dockRingMesh)
  markFocusSharp(dockGroup)

  const scannerDockTargets: Array<InstanceType<ThreeModule['Mesh']>> = [
    dockPadMesh,
    dockRingMesh,
  ]

  // Handheld scanner body
  const scannerGroup = new THREE.Group()
  scannerGroup.position.set(SCANNER_X, TABLE_TOP_Y + 6, SCANNER_Z)
  scannerGroup.rotation.y = -0.36
  webglScene.add(scannerGroup)

  const scannerUserData = {
    tabletTitle: 'Barcode-Scanner',
    tabletId: 'barcode-scanner',
    kind: 'scanner' as const,
  }

  const sFoot = new THREE.Mesh(footOvalGeo, scannerRubberMat)
  sFoot.scale.set(0.92, 1, 1.38)
  sFoot.position.set(0, 17, 16)
  sFoot.castShadow = true
  sFoot.receiveShadow = true
  sFoot.userData = scannerUserData
  scannerGroup.add(sFoot)

  const sLowerGrip = new THREE.Mesh(lowerGripGeo, scannerRubberMat)
  sLowerGrip.scale.set(0.9, 1, 1.15)
  sLowerGrip.position.set(0, 136, 0)
  sLowerGrip.rotation.x = 0.08
  sLowerGrip.castShadow = true
  sLowerGrip.userData = scannerUserData
  scannerGroup.add(sLowerGrip)

  const sRearSpine = new THREE.Mesh(rearSpineGeo, scannerGreyMat)
  sRearSpine.position.set(0, 148, -32)
  sRearSpine.rotation.x = 0.08
  sRearSpine.castShadow = true
  sRearSpine.userData = scannerUserData
  scannerGroup.add(sRearSpine)

  const sUpperNeck = new THREE.Mesh(upperNeckGeo, scannerGreyMat)
  sUpperNeck.scale.set(0.95, 1, 1.24)
  sUpperNeck.position.set(0, 336, 22)
  sUpperNeck.rotation.x = 0.24
  sUpperNeck.castShadow = true
  sUpperNeck.userData = scannerUserData
  scannerGroup.add(sUpperNeck)

  const sTrigger = new THREE.Mesh(triggerGeo, scannerRubberMat)
  sTrigger.position.set(0, 368, 76)
  sTrigger.rotation.x = -0.22
  sTrigger.castShadow = true
  sTrigger.userData = scannerUserData
  scannerGroup.add(sTrigger)

  const sTriggerBump = new THREE.Mesh(triggerBumpGeo, scannerRubberMat)
  sTriggerBump.rotation.z = Math.PI / 2
  sTriggerBump.position.set(0, 366, 98)
  sTriggerBump.userData = scannerUserData
  scannerGroup.add(sTriggerBump)

  const scannerHeadGroup = new THREE.Group()
  scannerHeadGroup.position.set(0, 474, 72)
  scannerHeadGroup.rotation.x = 0.18
  scannerGroup.add(scannerHeadGroup)

  const sHeadCore = new THREE.Mesh(headCoreGeo, scannerGreyMat)
  sHeadCore.position.set(0, 4, -52)
  sHeadCore.castShadow = true
  sHeadCore.userData = scannerUserData
  scannerHeadGroup.add(sHeadCore)

  const sHeadCap = new THREE.Mesh(hoodGeo, scannerRubberMat)
  sHeadCap.position.set(0, 0, -24)
  sHeadCap.castShadow = true
  sHeadCap.userData = scannerUserData
  scannerHeadGroup.add(sHeadCap)

  const sHoodRib = new THREE.Mesh(hoodRibGeo, scannerRubberMat)
  sHoodRib.position.set(0, 6, 32)
  sHoodRib.castShadow = true
  sHoodRib.userData = scannerUserData
  scannerHeadGroup.add(sHoodRib)

  const sScanLens = new THREE.Mesh(scanLensGeo, scannerLensMat)
  sScanLens.position.set(0, 0, 14)
  sScanLens.userData = scannerUserData
  scannerHeadGroup.add(sScanLens)

  const sScanBeam = new THREE.Mesh(scanBeamGeo, scannerBeamMat)
  sScanBeam.position.set(0, 0, 18)
  scannerHeadGroup.add(sScanBeam)

  const sStatusLed = new THREE.Mesh(statusLedGeo, scannerStatusLedMat)
  sStatusLed.rotation.x = -Math.PI / 2
  sStatusLed.position.set(0, 66, -78)
  scannerHeadGroup.add(sStatusLed)

  markFocusSharp(scannerGroup)

  const scannerTargets: Array<InstanceType<ThreeModule['Mesh']>> = [
    sFoot,
    sLowerGrip,
    sRearSpine,
    sUpperNeck,
    sTrigger,
    sTriggerBump,
    sHeadCore,
    sHeadCap,
    sHoodRib,
    sScanLens,
  ]

  // 3D laser beam + surface laser crosshair group
  const laserVisualsGroup = new THREE.Group()
  laserVisualsGroup.visible = false
  webglScene.add(laserVisualsGroup)

  const laserRayMesh = new THREE.Mesh(laserRayGeo, laserRayMat)
  laserVisualsGroup.add(laserRayMesh)

  const laserSpotGroup = new THREE.Group()
  laserVisualsGroup.add(laserSpotGroup)

  const laserLineH = new THREE.Mesh(laserLineHGeo, laserSpotMat)
  const laserLineV = new THREE.Mesh(laserLineVGeo, laserSpotMat)
  const laserCoreDot = new THREE.Mesh(laserCoreDotGeo, laserCoreMat)
  laserSpotGroup.add(laserLineH, laserLineV, laserCoreDot)

  markFocusSharp(laserVisualsGroup)

  // Reusable math temporaries
  const restPos = new THREE.Vector3(SCANNER_X, TABLE_TOP_Y + 6, SCANNER_Z)
  const restQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, -0.36, 0, 'YXZ'),
  )
  const tmpHandLocal = new THREE.Vector3()
  const tmpTargetPos = new THREE.Vector3()
  const tmpNozzleWorld = new THREE.Vector3()
  const tmpAimDir = new THREE.Vector3()
  const tmpLocalAim = new THREE.Vector3()
  const tmpCamInvQuat = new THREE.Quaternion()
  const tmpWristEuler = new THREE.Euler(0, Math.PI, 0, 'YXZ')
  const tmpWristQuat = new THREE.Quaternion()
  const tmpTargetQuat = new THREE.Quaternion()
  const tmpSpotUp = new THREE.Vector3()
  const tmpSpotRight = new THREE.Vector3()
  const tmpSpotMat = new THREE.Matrix4()
  const worldUp = new THREE.Vector3(0, 1, 0)

  let handBlend = 0

  const updateScannerPose = ({
    held,
    dt,
    camera,
    aspect,
    aimWorldPoint,
    hitNormal,
    hoverAmount,
    dockHoverAmount,
    triggerAnim,
    successFlash,
    moveSpeedNorm,
    timeSec,
  }: ScannerPoseUpdate) => {
    const blendTarget = held ? 1 : 0
    const blendRate = 1 - Math.exp(-16 * dt)
    handBlend += (blendTarget - handBlend) * blendRate
    if (Math.abs(handBlend - blendTarget) < 0.002) {
      handBlend = blendTarget
    }

    // Trigger squeeze animation
    const squeeze = Math.sin(triggerAnim * Math.PI) * 11
    sTrigger.position.z = 76 - squeeze
    sTriggerBump.position.z = 98 - squeeze

    // Dock ring highlight when scanner is in hand
    const dockTargetIntensity = held
      ? 0.45 + dockHoverAmount * 0.75
      : 0.1 + hoverAmount * 0.35
    dockRingMat.emissiveIntensity +=
      (dockTargetIntensity - dockRingMat.emissiveIntensity) * blendRate
    const dockScale = 1 + (held ? dockHoverAmount * 0.09 : 0)
    dockGroup.scale.set(dockScale, 1, dockScale)

    // Scanner status LED & beam colors (emerald flash on successful decode)
    if (successFlash > 0.01) {
      scannerBeamMat.color.set('#22c55e')
      scannerBeamMat.emissive.set('#22c55e')
      scannerBeamMat.emissiveIntensity = 1.6
      scannerStatusLedMat.color.set('#22c55e')
      scannerStatusLedMat.emissive.set('#22c55e')
      scannerStatusLedMat.emissiveIntensity = 1.9
      laserRayMat.color.set('#22c55e')
      laserRayMat.opacity = 0.78
      laserSpotMat.color.set('#22c55e')
    } else {
      scannerBeamMat.color.set('#ef4444')
      scannerBeamMat.emissive.set('#ef4444')
      scannerBeamMat.emissiveIntensity = held ? 1.25 : 0.6 + hoverAmount * 0.55
      scannerStatusLedMat.color.set('#1ec9a8')
      scannerStatusLedMat.emissive.set('#1ec9a8')
      scannerStatusLedMat.emissiveIntensity = held ? 1.15 : 0.8
      laserRayMat.color.set('#ef4444')
      laserRayMat.opacity = 0.5
      laserSpotMat.color.set('#ff3b3b')
    }

    if (handBlend <= 0.002 && !held) {
      scannerGroup.position.set(
        restPos.x,
        restPos.y + hoverAmount * 18,
        restPos.z,
      )
      scannerGroup.quaternion.copy(restQuat)
      const hoverScale = 1 + hoverAmount * 0.045
      scannerGroup.scale.setScalar(hoverScale)
      sFoot.castShadow = true
      sLowerGrip.castShadow = true
      sUpperNeck.castShadow = true
      sHeadCore.castShadow = true
      sHeadCap.castShadow = true
      laserVisualsGroup.visible = false
      return
    }

    // Disable viewmodel shadow-casting while held near the camera so it doesn't cast giant shadows across the room
    const castWorldShadows = !held && handBlend < 0.25
    sFoot.castShadow = castWorldShadows
    sLowerGrip.castShadow = castWorldShadows
    sUpperNeck.castShadow = castWorldShadows
    sHeadCore.castShadow = castWorldShadows
    sHeadCap.castShadow = castWorldShadows
    scannerGroup.scale.setScalar(1)

    // Compute right-hand viewmodel pose in camera space
    const walkBobX = Math.sin(timeSec * 7.2) * 8 * moveSpeedNorm
    const walkBobY = Math.abs(Math.cos(timeSec * 7.2)) * -10 * moveSpeedNorm
    const idleBreathY = Math.sin(timeSec * 2.1) * 3.5
    const recoilZ =
      Math.sin(triggerAnim * Math.PI) * 18 +
      Math.sin(Math.min(1, successFlash) * Math.PI) * 14

    const handX = Math.min(250, Math.max(116, 192 * Math.min(aspect, 1.45)))
    tmpHandLocal.set(
      handX + walkBobX,
      -528 + walkBobY + idleBreathY,
      -610 + recoilZ,
    )
    tmpTargetPos.copy(tmpHandLocal).applyMatrix4(camera.matrixWorld)

    // Subtle wrist pivot so the scanner nozzle tracks the 3D laser crosshair hit point
    let wristYaw = Math.PI + 0.14
    let wristPitch = 0.14
    if (aimWorldPoint) {
      tmpCamInvQuat.copy(camera.quaternion).invert()
      tmpLocalAim
        .copy(aimWorldPoint)
        .sub(tmpTargetPos)
        .applyQuaternion(tmpCamInvQuat)
      if (tmpLocalAim.z < -60) {
        const horizYaw = Math.atan2(-tmpLocalAim.x, -tmpLocalAim.z)
        const vertPitch = Math.atan2(
          tmpLocalAim.y - 380,
          Math.hypot(tmpLocalAim.x, tmpLocalAim.z),
        )
        wristYaw = Math.PI + Math.max(-0.48, Math.min(0.48, horizYaw))
        wristPitch = 0.16 - Math.max(-0.42, Math.min(0.42, vertPitch))
      }
    }

    tmpWristEuler.set(wristPitch, wristYaw, -0.05, 'YXZ')
    tmpWristQuat.setFromEuler(tmpWristEuler)
    tmpTargetQuat.copy(camera.quaternion).multiply(tmpWristQuat)

    if (handBlend >= 0.998) {
      scannerGroup.position.copy(tmpTargetPos)
      scannerGroup.quaternion.copy(tmpTargetQuat)
    } else {
      scannerGroup.position.lerpVectors(restPos, tmpTargetPos, handBlend)
      scannerGroup.quaternion.slerpQuaternions(
        restQuat,
        tmpTargetQuat,
        handBlend,
      )
    }
    scannerGroup.updateMatrixWorld(true)

    // Update 3D laser ray & surface crosshair when held
    if (held && handBlend > 0.65 && aimWorldPoint) {
      sScanBeam.getWorldPosition(tmpNozzleWorld)
      tmpAimDir.copy(aimWorldPoint).sub(tmpNozzleWorld)
      const rayLen = tmpAimDir.length()
      if (rayLen > 25) {
        laserVisualsGroup.visible = true
        laserRayMesh.position.copy(tmpNozzleWorld)
        laserRayMesh.lookAt(aimWorldPoint)
        laserRayMesh.scale.set(1, 1, rayLen)

        if (hitNormal) {
          laserSpotGroup.visible = true
          laserSpotGroup.position
            .copy(aimWorldPoint)
            .addScaledVector(hitNormal, 2.5)
          if (Math.abs(hitNormal.y) > 0.92) {
            const cy = camera.rotation.y
            tmpSpotUp.set(-Math.sin(cy), 0, -Math.cos(cy)).normalize()
          } else {
            tmpSpotUp
              .copy(worldUp)
              .addScaledVector(hitNormal, -hitNormal.y)
              .normalize()
          }
          tmpSpotRight.crossVectors(tmpSpotUp, hitNormal).normalize()
          tmpSpotUp.crossVectors(hitNormal, tmpSpotRight).normalize()
          tmpSpotMat.makeBasis(tmpSpotRight, tmpSpotUp, hitNormal)
          laserSpotGroup.quaternion.setFromRotationMatrix(tmpSpotMat)

          // Scale surface spot gently with distance so it stays legible up close and across the desk
          const spotScale = Math.min(2.2, Math.max(0.55, rayLen / 2800))
          laserSpotGroup.scale.setScalar(spotScale)
        } else {
          laserSpotGroup.visible = false
        }
      } else {
        laserVisualsGroup.visible = false
      }
    } else {
      laserVisualsGroup.visible = false
    }
  }

  return {
    scannerGroup,
    laserVisualsGroup,
    scannerTargets,
    scannerDockTargets,
    updateScannerPose,
  }
}
