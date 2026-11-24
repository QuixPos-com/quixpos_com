import { TABLE_TOP_Y, ZEBRA_D, ZEBRA_W, ZEBRA_X, ZEBRA_Z } from '../config'
import { markFocusSharp } from '../focusBlurPass'
import { createZebraBadgeTexture } from '../textures'
import type { Disposable, ThreeModule } from '../types'

export function buildZebraPrinter(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  const zebraBodyMat = new THREE.MeshStandardMaterial({
    color: '#23272e',
    roughness: 0.42,
    metalness: 0.2,
  })
  const zebraPlinthMat = new THREE.MeshStandardMaterial({
    color: '#171a20',
    roughness: 0.5,
    metalness: 0.2,
  })
  const zebraLatchMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    roughness: 0.32,
    metalness: 0.1,
  })
  const zebraWindowMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.12,
    metalness: 0.3,
    transparent: true,
    opacity: 0.46,
  })
  const zebraRollMat = new THREE.MeshStandardMaterial({
    color: '#f3f4f6',
    roughness: 0.75,
  })
  const zebraSlotMat = new THREE.MeshStandardMaterial({
    color: '#111827',
    roughness: 0.5,
    metalness: 0.35,
  })
  const zebraBadgeTex = createZebraBadgeTexture(THREE)
  const zebraBadgeMat = new THREE.MeshStandardMaterial({
    map: zebraBadgeTex,
    roughness: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })

  // Side-profile clamshell silhouette matching Zebra ZD420/ZD421
  const zebraShape = new THREE.Shape()
  zebraShape.moveTo(-332, 26)
  zebraShape.lineTo(332, 26)
  zebraShape.lineTo(332, 206)
  zebraShape.quadraticCurveTo(332, 240, 304, 262)
  zebraShape.lineTo(94, 424)
  zebraShape.quadraticCurveTo(-70, 460, -252, 418)
  zebraShape.quadraticCurveTo(-342, 368, -342, 205)
  zebraShape.lineTo(-332, 26)

  const zebraShellGeo = new THREE.ExtrudeGeometry(zebraShape, {
    depth: ZEBRA_W - 24,
    bevelEnabled: true,
    bevelThickness: 12,
    bevelSize: 12,
    bevelSegments: 4,
  })
  zebraShellGeo.translate(0, 0, -(ZEBRA_W - 24) / 2)

  const zebraPlinthGeo = new THREE.BoxGeometry(ZEBRA_W - 36, 28, ZEBRA_D - 56)
  const zebraLatchGeo = new THREE.BoxGeometry(22, 54, 66)
  const zebraHingeGeo = new THREE.CylinderGeometry(28, 28, 18, 20)
  const zebraWindowGeo = new THREE.BoxGeometry(340, 20, 150)
  const zebraRollGeo = new THREE.CylinderGeometry(74, 74, 300, 24)
  const zebraSlotGeo = new THREE.BoxGeometry(430, 14, 26)
  const zebraSeamGeo = new THREE.BoxGeometry(ZEBRA_W + 2, 6, 440)
  const zebraBadgeGeo = new THREE.PlaneGeometry(300, 150)

  disposables.push(
    zebraBodyMat,
    zebraPlinthMat,
    zebraLatchMat,
    zebraWindowMat,
    zebraRollMat,
    zebraSlotMat,
    zebraBadgeTex,
    zebraBadgeMat,
    zebraShellGeo,
    zebraPlinthGeo,
    zebraLatchGeo,
    zebraHingeGeo,
    zebraWindowGeo,
    zebraRollGeo,
    zebraSlotGeo,
    zebraSeamGeo,
    zebraBadgeGeo,
  )

  const zebraGroup = new THREE.Group()
  zebraGroup.position.set(ZEBRA_X, TABLE_TOP_Y, ZEBRA_Z)
  webglScene.add(zebraGroup)

  const zebraPlinth = new THREE.Mesh(zebraPlinthGeo, zebraPlinthMat)
  zebraPlinth.position.set(0, 14, 0)
  zebraPlinth.castShadow = true
  zebraPlinth.receiveShadow = true
  zebraGroup.add(zebraPlinth)

  const zebraShell = new THREE.Mesh(zebraShellGeo, zebraBodyMat)
  zebraShell.rotation.y = -Math.PI / 2
  zebraShell.castShadow = true
  zebraShell.receiveShadow = true
  zebraGroup.add(zebraShell)

  // White label roll visible through translucent smoked top window
  const zebraRoll = new THREE.Mesh(zebraRollGeo, zebraRollMat)
  zebraRoll.rotation.z = Math.PI / 2
  zebraRoll.position.set(0, 355, -80)
  zebraGroup.add(zebraRoll)

  const zebraWindow = new THREE.Mesh(zebraWindowGeo, zebraWindowMat)
  zebraWindow.position.set(0, 440, -80)
  zebraWindow.rotation.x = 0.08
  zebraGroup.add(zebraWindow)

  // Yellow-orange clamshell release latches + side seam + rear hinge caps
  const zebraTargets: Array<InstanceType<ThreeModule['Mesh']>> = []
  for (const lx of [-(ZEBRA_W / 2 + 2), ZEBRA_W / 2 + 2]) {
    const latch = new THREE.Mesh(zebraLatchGeo, zebraLatchMat)
    latch.position.set(lx, 185, 130)
    latch.castShadow = true
    latch.userData = {
      tabletTitle: 'Zebra ZD420',
      tabletId: 'zebra-latch',
      kind: 'zebra-latch' as const,
    }
    zebraGroup.add(latch)
    zebraTargets.push(latch)

    const hinge = new THREE.Mesh(zebraHingeGeo, zebraPlinthMat)
    hinge.rotation.z = Math.PI / 2
    hinge.position.set(lx, 326, -315)
    zebraGroup.add(hinge)
  }

  const zebraSeam = new THREE.Mesh(zebraSeamGeo, zebraPlinthMat)
  zebraSeam.position.set(0, 198, -70)
  zebraGroup.add(zebraSeam)

  // Sloped control panel matching front clamshell slope
  const zebraBadge = new THREE.Mesh(zebraBadgeGeo, zebraBadgeMat)
  zebraBadge.position.set(0, 354, 211)
  zebraBadge.rotation.x = -0.914
  zebraGroup.add(zebraBadge)

  // Front label exit slot
  const zebraSlot = new THREE.Mesh(zebraSlotGeo, zebraSlotMat)
  zebraSlot.position.set(0, 196, 338)
  zebraGroup.add(zebraSlot)

  markFocusSharp(zebraGroup)

  const setZebraReelVisual = (widthMm: number) => {
    const widthRatio = Math.max(0.24, Math.min(1, widthMm / 101))
    zebraRoll.scale.set(1, widthRatio, 1)
  }

  return {
    zebraTargets,
    zebraLatchMat,
    setZebraReelVisual,
  }
}
