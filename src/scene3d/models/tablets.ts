import {
  TABLETS,
  TABLET_DEPTH,
  TABLET_Z,
  TABLE_TOP_Y,
  TILT_ANGLE,
} from '../config'
import { createPowerButtonTexture } from '../textures'
import type {
  CSS3DObjectConstructor,
  Disposable,
  TabletInstance,
  ThreeModule,
} from '../types'

export function buildTablets(
  THREE: ThreeModule,
  CSS3DObject: CSS3DObjectConstructor,
  webglScene: InstanceType<ThreeModule['Scene']>,
  cssScene: InstanceType<ThreeModule['Scene']>,
  touchCapable: boolean,
  disposables: Disposable[],
) {
  const shellMat = new THREE.MeshStandardMaterial({
    color: '#1b2230',
    roughness: 0.38,
    metalness: 0.65,
  })
  const bezelMat = new THREE.MeshStandardMaterial({
    color: '#0b0f17',
    roughness: 0.22,
    metalness: 0.25,
  })
  const standMat = new THREE.MeshStandardMaterial({
    color: '#374151',
    roughness: 0.3,
    metalness: 0.8,
  })
  const powerRimMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.25,
    metalness: 0.85,
  })
  const cutoutMat = touchCapable
    ? new THREE.MeshBasicMaterial({
        color: 0x0b1220,
        side: THREE.FrontSide,
      })
    : new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0,
        transparent: true,
        blending: THREE.NoBlending,
        side: THREE.FrontSide,
      })
  const camDotMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    emissive: '#0f9f86',
    emissiveIntensity: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })

  const powerIdleTex = createPowerButtonTexture(THREE, false)
  const powerActiveTex = createPowerButtonTexture(THREE, true)

  const camDotGeo = new THREE.CircleGeometry(7, 16)
  const vesaArmGeo = new THREE.BoxGeometry(110, 70, 96)
  const vesaPlateGeo = new THREE.BoxGeometry(160, 120, 20)
  const powerBossGeo = new THREE.CylinderGeometry(26, 28, 16, 24)
  const powerBodyGeo = new THREE.CylinderGeometry(20, 20, 10, 24)
  const powerFaceGeo = new THREE.CircleGeometry(19.2, 24)

  disposables.push(
    shellMat,
    bezelMat,
    standMat,
    powerRimMat,
    cutoutMat,
    camDotMat,
    powerIdleTex,
    powerActiveTex,
    camDotGeo,
    vesaArmGeo,
    vesaPlateGeo,
    powerBossGeo,
    powerBodyGeo,
    powerFaceGeo,
  )

  const tabletInstances: TabletInstance[] = []
  const cutoutTargets: Array<InstanceType<ThreeModule['Mesh']>> = []
  const powerTargets: Array<InstanceType<ThreeModule['Mesh']>> = []

  for (const spec of TABLETS) {
    const visibleCssW = spec.crop ? spec.crop.w : spec.cssW
    const visibleCssH = spec.crop ? spec.crop.h : spec.cssH
    const screenW = Math.round(visibleCssW * spec.physicalScale)
    const screenH = Math.round(visibleCssH * spec.physicalScale)
    const tabletW = screenW + spec.bezelPad * 2
    const tabletH = screenH + spec.bezelPad * 2

    const centerYOffset = (tabletH / 2) * Math.cos(TILT_ANGLE) + spec.bottomClearance
    const centerY = TABLE_TOP_Y + centerYOffset
    const standBaseY = TABLE_TOP_Y

    const backShellGeo = new THREE.BoxGeometry(tabletW, tabletH, TABLET_DEPTH - 8)
    const bezelTopGeo = new THREE.BoxGeometry(tabletW, spec.bezelPad, 10)
    const bezelSideGeo = new THREE.BoxGeometry(spec.bezelPad, screenH, 10)
    // Extend cutout 6 units under the opaque front bezel bars so NoBlending's un-antialiased edge is hidden behind MSAA bezel geometry
    const cutoutGeo = new THREE.PlaneGeometry(screenW + 12, screenH + 12)
    const footW = Math.min(580, Math.max(280, Math.round(tabletW * 0.65)))
    const baseFootGeo = new THREE.BoxGeometry(footW, 32, 340)
    const neckH = Math.max(240, Math.round(centerY - standBaseY))
    const neckGeo = new THREE.BoxGeometry(110, neckH, 64)

    const powerFaceMat = new THREE.MeshStandardMaterial({
      map: powerIdleTex,
      emissive: '#0f9f86',
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })

    disposables.push(
      backShellGeo,
      bezelTopGeo,
      bezelSideGeo,
      cutoutGeo,
      baseFootGeo,
      neckGeo,
      powerFaceMat,
    )

    // Stand on tabletop
    const foot = new THREE.Mesh(baseFootGeo, standMat)
    foot.position.set(spec.x, standBaseY + 16, TABLET_Z - 140)
    foot.castShadow = true
    foot.receiveShadow = true
    webglScene.add(foot)

    const neck = new THREE.Mesh(neckGeo, standMat)
    neck.position.set(spec.x, standBaseY + neckH / 2 + 16, TABLET_Z - 140)
    neck.castShadow = true
    neck.receiveShadow = true
    webglScene.add(neck)

    const vesaArm = new THREE.Mesh(vesaArmGeo, standMat)
    vesaArm.position.set(spec.x, centerY, TABLET_Z - 96)
    vesaArm.castShadow = true
    webglScene.add(vesaArm)

    // Tablet body group
    const tabletGroup = new THREE.Group()
    tabletGroup.position.set(spec.x, centerY, TABLET_Z)
    tabletGroup.rotation.x = TILT_ANGLE

    // Back aluminum shell
    const backShell = new THREE.Mesh(backShellGeo, shellMat)
    backShell.position.set(0, 0, -12)
    backShell.castShadow = true
    backShell.receiveShadow = true
    tabletGroup.add(backShell)

    // Rear VESA plate flush against the back shell
    const vesaPlate = new THREE.Mesh(vesaPlateGeo, standMat)
    vesaPlate.position.set(0, 0, -28)
    vesaPlate.castShadow = true
    tabletGroup.add(vesaPlate)

    // Four bezel bars surrounding the screen cutout
    const topBezel = new THREE.Mesh(bezelTopGeo, bezelMat)
    topBezel.position.set(0, (screenH + spec.bezelPad) / 2, 3)
    topBezel.castShadow = true
    tabletGroup.add(topBezel)

    const bottomBezel = new THREE.Mesh(bezelTopGeo, bezelMat)
    bottomBezel.position.set(0, -(screenH + spec.bezelPad) / 2, 3)
    bottomBezel.castShadow = true
    tabletGroup.add(bottomBezel)

    const leftBezel = new THREE.Mesh(bezelSideGeo, bezelMat)
    leftBezel.position.set(-(screenW + spec.bezelPad) / 2, 0, 3)
    leftBezel.castShadow = true
    tabletGroup.add(leftBezel)

    const rightBezel = new THREE.Mesh(bezelSideGeo, bezelMat)
    rightBezel.position.set((screenW + spec.bezelPad) / 2, 0, 3)
    rightBezel.castShadow = true
    tabletGroup.add(rightBezel)

    // Front webcam indicator dot
    const camDot = new THREE.Mesh(camDotGeo, camDotMat)
    camDot.position.set(0, (screenH + spec.bezelPad) / 2, 9)
    tabletGroup.add(camDot)

    // Bottom-right bezel Power / Reload button (strictly outside screen cutout bounds)
    const powerBtnX = tabletW / 2 - 38
    const powerBtnY = -screenH / 2 - Math.max(spec.bezelPad / 2, 26)
    const powerBaseZ = 11

    const powerUserData = {
      tabletTitle: `${spec.title} neu laden`,
      tabletId: spec.id,
      kind: 'power' as const,
    }

    const powerBoss = new THREE.Mesh(powerBossGeo, bezelMat)
    powerBoss.rotation.x = Math.PI / 2
    powerBoss.position.set(powerBtnX, powerBtnY, 2)
    powerBoss.castShadow = true
    powerBoss.userData = powerUserData
    tabletGroup.add(powerBoss)
    powerTargets.push(powerBoss)

    const powerBtnGroup = new THREE.Group()
    powerBtnGroup.position.set(powerBtnX, powerBtnY, powerBaseZ)
    tabletGroup.add(powerBtnGroup)

    const powerBody = new THREE.Mesh(powerBodyGeo, powerRimMat)
    powerBody.rotation.x = Math.PI / 2
    powerBody.castShadow = true
    powerBody.userData = powerUserData
    powerBtnGroup.add(powerBody)

    const powerFace = new THREE.Mesh(powerFaceGeo, powerFaceMat)
    powerFace.position.set(0, 0, 5.2)
    powerFace.userData = powerUserData
    powerBtnGroup.add(powerFace)

    powerTargets.push(powerBody, powerFace)

    // Transparent NoBlending cutout plane for CSS3D iframe visibility + occlusion
    const cutoutMesh = new THREE.Mesh(cutoutGeo, cutoutMat)
    cutoutMesh.position.set(0, 0, 2)
    cutoutMesh.userData = {
      tabletTitle: spec.title,
      tabletId: spec.id,
      kind: 'screen',
    }
    tabletGroup.add(cutoutMesh)

    webglScene.add(tabletGroup)
    tabletGroup.updateMatrixWorld(true)

    // Real DOM iframe inside CSS3DObject
    const wrapperEl = document.createElement('div')
    wrapperEl.className = 'tablet-screen-frame'
    wrapperEl.style.width = `${visibleCssW}px`
    wrapperEl.style.height = `${visibleCssH}px`

    const iframeEl = document.createElement('iframe')
    iframeEl.className = 'tablet-screen-iframe'
    iframeEl.style.width = `${spec.cssW}px`
    iframeEl.style.height = `${spec.cssH}px`
    iframeEl.src = spec.url
    iframeEl.title = `${spec.title} (${spec.subtitle})`
    iframeEl.loading = 'eager'
    iframeEl.allow = 'clipboard-read; clipboard-write'

    if (spec.crop) {
      const cropEl = document.createElement('div')
      cropEl.className = 'tablet-screen-crop'
      iframeEl.style.position = 'relative'
      iframeEl.style.left = `${-spec.crop.x}px`
      iframeEl.style.top = `${-spec.crop.y}px`
      cropEl.appendChild(iframeEl)
      wrapperEl.appendChild(cropEl)
    } else {
      wrapperEl.appendChild(iframeEl)
    }

    const cssObject = new CSS3DObject(wrapperEl)
    cutoutMesh.getWorldPosition(cssObject.position)
    cutoutMesh.getWorldQuaternion(cssObject.quaternion)
    cssObject.scale.set(spec.physicalScale, spec.physicalScale, 1)
    cssScene.add(cssObject)

    tabletInstances.push({
      spec,
      cutoutMesh,
      powerBtnGroup,
      powerFaceMat,
      powerBaseZ,
      powerHover: 0,
      powerPressAnim: 0,
      reloadFlash: 0,
      cssObject,
      wrapperEl,
      iframeEl,
      tabletW,
      tabletH,
      centerY,
    })
    cutoutTargets.push(cutoutMesh)
  }

  return {
    tabletInstances,
    cutoutTargets,
    powerTargets,
    powerIdleTex,
    powerActiveTex,
  }
}
