import { DRAWER_D, TABLET_Z, TABLE_TOP_Y } from '../config'
import { markFocusSharp } from '../focusBlurPass'
import { createNameplateTexture } from '../textures'
import type {
  Disposable,
  LoupeInstance,
  NavPresetId,
  ThreeModule,
} from '../types'

interface TabletopStationSpec {
  viewId: NavPresetId
  title: string
  subtitle: string
  x: number
  width: number
}

const TABLETOP_STATIONS: TabletopStationSpec[] = [
  {
    viewId: 'left',
    title: 'Büro',
    subtitle: 'Artikelverwaltung · Etikettendruck',
    x: -2150,
    width: 700,
  },
  {
    viewId: 'center',
    title: 'Kasse',
    subtitle: 'POS · pos.quixpos.com',
    x: 74,
    width: 640,
  },
  {
    viewId: 'right',
    title: 'Kunde',
    subtitle: 'Kundendisplay · SumUp · Beleg',
    x: 1825,
    width: 700,
  },
]

export function buildStationLoupes(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  drawerTrayGroup: InstanceType<ThreeModule['Group']>,
  disposables: Disposable[],
) {
  const standMat = new THREE.MeshStandardMaterial({
    color: '#374151',
    roughness: 0.3,
    metalness: 0.8,
  })
  const loupeRingMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    emissive: '#0f9f86',
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.35,
  })
  const loupeLensMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    transparent: true,
    opacity: 0.26,
    roughness: 0.12,
    metalness: 0.2,
  })
  const drawerBadgeSocketMat = new THREE.MeshStandardMaterial({
    color: '#0b1220',
    roughness: 0.35,
    metalness: 0.25,
  })

  const loupeRingGeo = new THREE.TorusGeometry(24, 5.5, 12, 28)
  const loupeLensGeo = new THREE.CircleGeometry(21, 22)
  const loupeHandleGeo = new THREE.CylinderGeometry(5.5, 5.5, 34, 12)
  const drawerSocketGeo = new THREE.CylinderGeometry(48, 48, 12, 24)

  disposables.push(
    standMat,
    loupeRingMat,
    loupeLensMat,
    drawerBadgeSocketMat,
    loupeRingGeo,
    loupeLensGeo,
    loupeHandleGeo,
    drawerSocketGeo,
  )

  const loupeInstances: LoupeInstance[] = []
  const plateTargets: Array<InstanceType<ThreeModule['Mesh']>> = []

  // 1. Three tabletop station nameplates + 3D loupes matching Linke Seite, Mitte, Rechte Gruppe
  for (const station of TABLETOP_STATIONS) {
    const nameplateW = station.width
    const nameplateD = Math.round(nameplateW * 0.25)
    const nameplateGeo = new THREE.BoxGeometry(nameplateW, 24, nameplateD)
    const plateTex = createNameplateTexture(THREE, station.title, station.subtitle)
    const plateMat = new THREE.MeshStandardMaterial({
      map: plateTex,
      roughness: 0.4,
      metalness: 0.2,
    })
    disposables.push(nameplateGeo, plateTex, plateMat)

    const userData = {
      tabletTitle: station.title,
      tabletId: station.viewId,
      kind: 'label' as const,
    }

    const plate = new THREE.Mesh(nameplateGeo, [
      standMat,
      standMat,
      plateMat,
      standMat,
      standMat,
      standMat,
    ])
    plate.position.set(station.x, TABLE_TOP_Y + 12, TABLET_Z + 440)
    plate.castShadow = true
    plate.receiveShadow = true
    plate.userData = userData
    markFocusSharp(plate)
    webglScene.add(plate)
    plateTargets.push(plate)

    const baseScale = nameplateD / 145
    const baseY = TABLE_TOP_Y + 34
    const baseZ = TABLET_Z + 432
    const loupeGroup = new THREE.Group()
    loupeGroup.position.set(station.x + nameplateW * 0.372, baseY, baseZ)
    loupeGroup.scale.setScalar(baseScale)

    const lRing = new THREE.Mesh(loupeRingGeo, loupeRingMat)
    lRing.rotation.x = Math.PI / 2
    lRing.castShadow = true
    lRing.userData = userData
    loupeGroup.add(lRing)

    const lLens = new THREE.Mesh(loupeLensGeo, loupeLensMat)
    lLens.rotation.x = -Math.PI / 2
    lLens.userData = userData
    loupeGroup.add(lLens)

    const lHandle = new THREE.Mesh(loupeHandleGeo, loupeRingMat)
    lHandle.rotation.z = Math.PI / 2
    lHandle.rotation.y = -Math.PI / 4
    lHandle.position.set(27, 0, 27)
    lHandle.castShadow = true
    lHandle.userData = userData
    loupeGroup.add(lHandle)

    markFocusSharp(loupeGroup)
    webglScene.add(loupeGroup)
    plateTargets.push(lRing, lLens, lHandle)

    loupeInstances.push({
      viewId: station.viewId,
      loupeGroup,
      plateMesh: plate,
      baseScale,
      baseY,
      baseZ,
      liftAxis: 'y',
      hover: 0,
    })
  }

  // 2. Cash Drawer 3D loupe badge matching Kassenschublade in top navigation
  const drawerUserData = {
    tabletTitle: 'Kassenschublade',
    tabletId: 'drawer' as NavPresetId,
    kind: 'label' as const,
  }

  const drawerSocket = new THREE.Mesh(drawerSocketGeo, drawerBadgeSocketMat)
  drawerSocket.rotation.x = Math.PI / 2
  drawerSocket.position.set(568, 193, DRAWER_D / 2 + 4)
  drawerSocket.castShadow = true
  drawerSocket.userData = drawerUserData
  markFocusSharp(drawerSocket)
  drawerTrayGroup.add(drawerSocket)
  plateTargets.push(drawerSocket)

  const drawerLoupeBaseScale = 1.15
  const drawerBaseY = 193
  const drawerBaseZ = DRAWER_D / 2 + 16
  const drawerLoupeGroup = new THREE.Group()
  drawerLoupeGroup.position.set(568, drawerBaseY, drawerBaseZ)
  drawerLoupeGroup.scale.setScalar(drawerLoupeBaseScale)

  const dRing = new THREE.Mesh(loupeRingGeo, loupeRingMat)
  dRing.castShadow = true
  dRing.userData = drawerUserData
  drawerLoupeGroup.add(dRing)

  const dLens = new THREE.Mesh(loupeLensGeo, loupeLensMat)
  dLens.userData = drawerUserData
  drawerLoupeGroup.add(dLens)

  const dHandle = new THREE.Mesh(loupeHandleGeo, loupeRingMat)
  dHandle.rotation.z = Math.PI / 4
  dHandle.position.set(27, -27, 0)
  dHandle.castShadow = true
  dHandle.userData = drawerUserData
  drawerLoupeGroup.add(dHandle)

  markFocusSharp(drawerLoupeGroup)
  drawerTrayGroup.add(drawerLoupeGroup)
  plateTargets.push(dRing, dLens, dHandle)

  loupeInstances.push({
    viewId: 'drawer',
    loupeGroup: drawerLoupeGroup,
    plateMesh: drawerSocket,
    baseScale: drawerLoupeBaseScale,
    baseY: drawerBaseY,
    baseZ: drawerBaseZ,
    liftAxis: 'z',
    hover: 0,
  })

  return {
    loupeInstances,
    plateTargets,
  }
}
