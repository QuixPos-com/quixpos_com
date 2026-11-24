import { SCANNER_X, SCANNER_Z, TABLE_TOP_Y } from '../config'
import type { Disposable, ThreeModule } from '../types'

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

  disposables.push(
    scannerGreyMat,
    scannerRubberMat,
    scannerLensMat,
    scannerBeamMat,
    scannerStatusLedMat,
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
  )

  const scannerGroup = new THREE.Group()
  scannerGroup.position.set(SCANNER_X, TABLE_TOP_Y, SCANNER_Z)
  scannerGroup.rotation.y = -0.36
  webglScene.add(scannerGroup)

  const sFoot = new THREE.Mesh(footOvalGeo, scannerRubberMat)
  sFoot.scale.set(0.92, 1, 1.38)
  sFoot.position.set(0, 17, 16)
  sFoot.castShadow = true
  sFoot.receiveShadow = true
  scannerGroup.add(sFoot)

  const sLowerGrip = new THREE.Mesh(lowerGripGeo, scannerRubberMat)
  sLowerGrip.scale.set(0.9, 1, 1.15)
  sLowerGrip.position.set(0, 136, 0)
  sLowerGrip.rotation.x = 0.08
  sLowerGrip.castShadow = true
  scannerGroup.add(sLowerGrip)

  const sRearSpine = new THREE.Mesh(rearSpineGeo, scannerGreyMat)
  sRearSpine.position.set(0, 148, -32)
  sRearSpine.rotation.x = 0.08
  sRearSpine.castShadow = true
  scannerGroup.add(sRearSpine)

  const sUpperNeck = new THREE.Mesh(upperNeckGeo, scannerGreyMat)
  sUpperNeck.scale.set(0.95, 1, 1.24)
  sUpperNeck.position.set(0, 336, 22)
  sUpperNeck.rotation.x = 0.24
  sUpperNeck.castShadow = true
  scannerGroup.add(sUpperNeck)

  const sTrigger = new THREE.Mesh(triggerGeo, scannerRubberMat)
  sTrigger.position.set(0, 368, 76)
  sTrigger.rotation.x = -0.22
  sTrigger.castShadow = true
  scannerGroup.add(sTrigger)

  const sTriggerBump = new THREE.Mesh(triggerBumpGeo, scannerRubberMat)
  sTriggerBump.rotation.z = Math.PI / 2
  sTriggerBump.position.set(0, 366, 98)
  scannerGroup.add(sTriggerBump)

  const scannerHeadGroup = new THREE.Group()
  scannerHeadGroup.position.set(0, 474, 72)
  scannerHeadGroup.rotation.x = 0.18
  scannerGroup.add(scannerHeadGroup)

  const sHeadCore = new THREE.Mesh(headCoreGeo, scannerGreyMat)
  sHeadCore.position.set(0, 4, -52)
  sHeadCore.castShadow = true
  scannerHeadGroup.add(sHeadCore)

  const sHeadCap = new THREE.Mesh(hoodGeo, scannerRubberMat)
  sHeadCap.position.set(0, 0, -24)
  sHeadCap.castShadow = true
  scannerHeadGroup.add(sHeadCap)

  const sHoodRib = new THREE.Mesh(hoodRibGeo, scannerRubberMat)
  sHoodRib.position.set(0, 6, 32)
  sHoodRib.castShadow = true
  scannerHeadGroup.add(sHoodRib)

  const sScanLens = new THREE.Mesh(scanLensGeo, scannerLensMat)
  sScanLens.position.set(0, 0, 14)
  scannerHeadGroup.add(sScanLens)

  const sScanBeam = new THREE.Mesh(scanBeamGeo, scannerBeamMat)
  sScanBeam.position.set(0, 0, 18)
  scannerHeadGroup.add(sScanBeam)

  const sStatusLed = new THREE.Mesh(statusLedGeo, scannerStatusLedMat)
  sStatusLed.rotation.x = -Math.PI / 2
  sStatusLed.position.set(0, 66, -78)
  scannerHeadGroup.add(sStatusLed)
}
