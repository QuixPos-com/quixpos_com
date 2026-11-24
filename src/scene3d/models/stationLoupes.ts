import { DRAWER_X, TABLET_Z, TABLE_D, TABLE_TOP_Y, TABLE_Z } from '../config'
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
  disposables: Disposable[],
) {
  const standMat = new THREE.MeshStandardMaterial({
    color: '#374151',
    roughness: 0.3,
    metalness: 0.8,
  })
  const loupeFrameMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    emissive: '#334155',
    emissiveIntensity: 0.22,
    roughness: 0.22,
    metalness: 0.55,
  })
  const loupeChromeMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    emissive: '#94a3b8',
    emissiveIntensity: 0.24,
    roughness: 0.14,
    metalness: 0.62,
  })
  const loupeGripMat = new THREE.MeshStandardMaterial({
    color: '#3b4c63',
    emissive: '#162235',
    emissiveIntensity: 0.28,
    roughness: 0.45,
    metalness: 0.22,
  })
  const loupeLensMat = new THREE.MeshPhysicalMaterial({
    color: '#d9fff7',
    emissive: '#1ec9a8',
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.48,
    roughness: 0.04,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.52,
    reflectivity: 0.95,
    depthWrite: false,
  })
  const loupeGlintMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  })
  const drawerBadgeSocketMat = new THREE.MeshStandardMaterial({
    color: '#111b2e',
    roughness: 0.32,
    metalness: 0.3,
  })

  // Machined chamfered optical bezel (CCW profile in r-y plane for outward normals)
  const bezelProfile = [
    new THREE.Vector2(21.0, -3.8),
    new THREE.Vector2(22.3, -5.2),
    new THREE.Vector2(25.2, -5.2),
    new THREE.Vector2(26.6, -3.8),
    new THREE.Vector2(26.6, 3.8),
    new THREE.Vector2(25.1, 5.2),
    new THREE.Vector2(22.2, 5.2),
    new THREE.Vector2(21.0, 3.9),
    new THREE.Vector2(21.0, -3.8),
  ]
  const loupeBezelGeo = new THREE.LatheGeometry(bezelProfile, 40)
  const loupeInnerTrimGeo = new THREE.TorusGeometry(21.2, 1.15, 12, 36)

  // Biconvex optical glass lens + curved specular glint arc
  const loupeLensGeo = new THREE.SphereGeometry(21.0, 32, 16)
  const loupeGlintGeo = new THREE.TorusGeometry(13.8, 0.9, 8, 18, Math.PI * 0.42)

  // Tapered chrome ferrule connecting bezel to handle (along +Y, rotated to +X in handleGroup)
  const ferruleProfile = [
    new THREE.Vector2(0.0, 24.4),
    new THREE.Vector2(5.1, 24.4),
    new THREE.Vector2(4.4, 27.6),
    new THREE.Vector2(4.6, 30.2),
    new THREE.Vector2(5.5, 31.4),
    new THREE.Vector2(5.5, 33.2),
    new THREE.Vector2(0.0, 33.2),
  ]
  const loupeFerruleGeo = new THREE.LatheGeometry(ferruleProfile, 24)
  const loupeCollarBandGeo = new THREE.CylinderGeometry(5.65, 5.65, 2.0, 24)

  // Ergonomic contoured soft-touch grip
  const gripProfile = [
    new THREE.Vector2(0.0, 33.2),
    new THREE.Vector2(5.3, 33.2),
    new THREE.Vector2(5.8, 38.0),
    new THREE.Vector2(6.35, 45.5),
    new THREE.Vector2(6.15, 52.5),
    new THREE.Vector2(5.45, 57.6),
    new THREE.Vector2(0.0, 57.6),
  ]
  const loupeGripGeo = new THREE.LatheGeometry(gripProfile, 24)
  const loupeGripTrimGeo = new THREE.TorusGeometry(5.95, 0.42, 8, 24)

  // Domed chrome pommel end-cap
  const pommelProfile = [
    new THREE.Vector2(0.0, 57.5),
    new THREE.Vector2(5.45, 57.5),
    new THREE.Vector2(5.1, 59.3),
    new THREE.Vector2(3.8, 60.8),
    new THREE.Vector2(1.9, 61.6),
    new THREE.Vector2(0.0, 61.9),
  ]
  const loupePommelGeo = new THREE.LatheGeometry(pommelProfile, 24)

  // Beveled circular dock pedestal for the cash drawer loupe
  const drawerSocketProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(74.0, 0.0),
    new THREE.Vector2(74.0, 10.0),
    new THREE.Vector2(69.0, 14.0),
    new THREE.Vector2(0.0, 14.0),
  ]
  const drawerSocketGeo = new THREE.LatheGeometry(drawerSocketProfile, 36)

  disposables.push(
    standMat,
    loupeFrameMat,
    loupeChromeMat,
    loupeGripMat,
    loupeLensMat,
    loupeGlintMat,
    drawerBadgeSocketMat,
    loupeBezelGeo,
    loupeInnerTrimGeo,
    loupeLensGeo,
    loupeGlintGeo,
    loupeFerruleGeo,
    loupeCollarBandGeo,
    loupeGripGeo,
    loupeGripTrimGeo,
    loupePommelGeo,
    drawerSocketGeo,
  )

  const loupeInstances: LoupeInstance[] = []
  const plateTargets: Array<InstanceType<ThreeModule['Mesh']>> = []

  const buildLoupeGroup = (
    userData: {
      tabletTitle: string
      tabletId: NavPresetId
      kind: 'label'
    },
  ) => {
    const loupeGroup = new THREE.Group()

    const bezel = new THREE.Mesh(loupeBezelGeo, loupeFrameMat)
    bezel.castShadow = true
    bezel.receiveShadow = true
    bezel.userData = userData
    loupeGroup.add(bezel)

    const innerTrim = new THREE.Mesh(loupeInnerTrimGeo, loupeChromeMat)
    innerTrim.rotation.x = Math.PI / 2
    innerTrim.position.y = 2.9
    innerTrim.userData = userData
    loupeGroup.add(innerTrim)

    const lens = new THREE.Mesh(loupeLensGeo, loupeLensMat)
    lens.scale.set(1, 0.22, 1)
    lens.userData = userData
    loupeGroup.add(lens)

    const glint = new THREE.Mesh(loupeGlintGeo, loupeGlintMat)
    glint.rotation.x = Math.PI / 2
    glint.rotation.z = Math.PI * 0.72
    glint.position.set(0, 3.65, 0)
    glint.userData = userData
    loupeGroup.add(glint)

    // Handle sub-group oriented along the (+X, +Z) 45° diagonal
    const handleGroup = new THREE.Group()
    handleGroup.rotation.y = -Math.PI / 4

    const ferrule = new THREE.Mesh(loupeFerruleGeo, loupeChromeMat)
    ferrule.rotation.z = -Math.PI / 2
    ferrule.castShadow = true
    ferrule.userData = userData
    handleGroup.add(ferrule)

    const collarBand = new THREE.Mesh(loupeCollarBandGeo, loupeChromeMat)
    collarBand.rotation.z = -Math.PI / 2
    collarBand.position.x = 32.6
    collarBand.userData = userData
    handleGroup.add(collarBand)

    const grip = new THREE.Mesh(loupeGripGeo, loupeGripMat)
    grip.rotation.z = -Math.PI / 2
    grip.castShadow = true
    grip.receiveShadow = true
    grip.userData = userData
    handleGroup.add(grip)

    const gripTrimUpper = new THREE.Mesh(loupeGripTrimGeo, loupeChromeMat)
    gripTrimUpper.rotation.y = Math.PI / 2
    gripTrimUpper.position.x = 38.4
    gripTrimUpper.scale.setScalar(0.98)
    gripTrimUpper.userData = userData
    handleGroup.add(gripTrimUpper)

    const gripTrimLower = new THREE.Mesh(loupeGripTrimGeo, loupeChromeMat)
    gripTrimLower.rotation.y = Math.PI / 2
    gripTrimLower.position.x = 53.8
    gripTrimLower.scale.setScalar(0.99)
    gripTrimLower.userData = userData
    handleGroup.add(gripTrimLower)

    const pommel = new THREE.Mesh(loupePommelGeo, loupeChromeMat)
    pommel.rotation.z = -Math.PI / 2
    pommel.castShadow = true
    pommel.userData = userData
    handleGroup.add(pommel)

    loupeGroup.add(handleGroup)

    plateTargets.push(
      bezel,
      innerTrim,
      lens,
      ferrule,
      collarBand,
      grip,
      pommel,
    )

    return loupeGroup
  }

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

    const baseScale = (nameplateD / 145) * 1.95
    const baseY = TABLE_TOP_Y + 42
    const baseZ = TABLET_Z + 422
    const loupeGroup = buildLoupeGroup(userData)
    loupeGroup.position.set(station.x + nameplateW * 0.372, baseY, baseZ)
    loupeGroup.scale.setScalar(baseScale)

    markFocusSharp(loupeGroup)
    webglScene.add(loupeGroup)

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

  // 2. Cash Drawer 3D loupe badge mounted on the tabletop above the drawer (stationary)
  const drawerUserData = {
    tabletTitle: 'Kassenschublade',
    tabletId: 'drawer' as NavPresetId,
    kind: 'label' as const,
  }

  const drawerLoupeX = DRAWER_X + 460
  const drawerLoupeZ = TABLE_Z + TABLE_D / 2 - 90

  const drawerSocket = new THREE.Mesh(drawerSocketGeo, drawerBadgeSocketMat)
  drawerSocket.position.set(drawerLoupeX, TABLE_TOP_Y, drawerLoupeZ)
  drawerSocket.castShadow = true
  drawerSocket.receiveShadow = true
  drawerSocket.userData = drawerUserData

  markFocusSharp(drawerSocket)
  webglScene.add(drawerSocket)
  plateTargets.push(drawerSocket)

  const drawerLoupeBaseScale = 2.0
  const drawerBaseY = TABLE_TOP_Y + 34
  const drawerBaseZ = drawerLoupeZ
  const drawerLoupeGroup = buildLoupeGroup(drawerUserData)
  drawerLoupeGroup.position.set(drawerLoupeX, drawerBaseY, drawerBaseZ)
  drawerLoupeGroup.scale.setScalar(drawerLoupeBaseScale)

  markFocusSharp(drawerLoupeGroup)
  webglScene.add(drawerLoupeGroup)

  loupeInstances.push({
    viewId: 'drawer',
    loupeGroup: drawerLoupeGroup,
    plateMesh: drawerSocket,
    baseScale: drawerLoupeBaseScale,
    baseY: drawerBaseY,
    baseZ: drawerBaseZ,
    liftAxis: 'y',
    hover: 0,
  })

  return {
    loupeInstances,
    plateTargets,
  }
}
