import {
  ARENA_HALF,
  TABLE_D,
  TABLE_THICKNESS,
  TABLE_TOP_Y,
  TABLE_W,
} from '../config'
import { createFloorTexture, createWoodTexture } from '../textures'
import type { Disposable, ThreeModule } from '../types'

export function buildLightingAndFloor(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  // Lighting
  const hemiLight = new THREE.HemisphereLight('#ffffff', '#9eb3c4', 1.15)
  hemiLight.position.set(0, 30000, 0)
  webglScene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight('#fffaf0', 1.5)
  dirLight.position.set(8000, 18000, 11000)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  dirLight.shadow.camera.near = 2000
  dirLight.shadow.camera.far = 45000
  const shadowExtent = 9000
  dirLight.shadow.camera.left = -shadowExtent
  dirLight.shadow.camera.right = shadowExtent
  dirLight.shadow.camera.top = shadowExtent
  dirLight.shadow.camera.bottom = -shadowExtent
  dirLight.shadow.bias = -0.0005
  webglScene.add(dirLight)

  // Flat Area Floor
  const floorTex = createFloorTexture(THREE)
  disposables.push(floorTex)
  const floorGeo = new THREE.PlaneGeometry(ARENA_HALF * 2.4, ARENA_HALF * 2.4)
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.85,
    metalness: 0.05,
  })
  disposables.push(floorGeo, floorMat)
  const floorMesh = new THREE.Mesh(floorGeo, floorMat)
  floorMesh.rotation.x = -Math.PI / 2
  floorMesh.receiveShadow = true
  webglScene.add(floorMesh)

  return floorMesh
}

export function buildTable(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  const tableGroup = new THREE.Group()
  const woodTex = createWoodTexture(THREE)
  disposables.push(woodTex)

  const topGeo = new THREE.BoxGeometry(TABLE_W, TABLE_THICKNESS, TABLE_D)
  const topMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.52,
    metalness: 0.06,
  })
  disposables.push(topGeo, topMat)
  const topMesh = new THREE.Mesh(topGeo, topMat)
  topMesh.position.set(0, TABLE_TOP_Y - TABLE_THICKNESS / 2, 0)
  topMesh.castShadow = true
  topMesh.receiveShadow = true
  tableGroup.add(topMesh)

  // Table steel legs & apron frame
  const metalMat = new THREE.MeshStandardMaterial({
    color: '#1f2937',
    roughness: 0.35,
    metalness: 0.75,
  })
  const legGeo = new THREE.BoxGeometry(200, TABLE_TOP_Y - TABLE_THICKNESS, 200)
  disposables.push(metalMat, legGeo)

  const legOffsetX = TABLE_W / 2 - 260
  const legOffsetZ = TABLE_D / 2 - 260
  const legCoords = [
    [-legOffsetX, -legOffsetZ],
    [legOffsetX, -legOffsetZ],
    [-legOffsetX, legOffsetZ],
    [legOffsetX, legOffsetZ],
  ]
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(legGeo, metalMat)
    leg.position.set(lx, (TABLE_TOP_Y - TABLE_THICKNESS) / 2, lz)
    leg.castShadow = true
    leg.receiveShadow = true
    tableGroup.add(leg)
  }

  // Subtle under-table crossbar frame (front beam leaves opening for under-table cash drawer)
  const beamBackGeo = new THREE.BoxGeometry(TABLE_W - 520, 110, 120)
  const beamSideLeftGeo = new THREE.BoxGeometry(2600, 110, 120)
  const beamSideRightGeo = new THREE.BoxGeometry(2460, 110, 120)
  const beamZGeo = new THREE.BoxGeometry(120, 110, TABLE_D - 520)
  disposables.push(beamBackGeo, beamSideLeftGeo, beamSideRightGeo, beamZGeo)

  const beamBack = new THREE.Mesh(beamBackGeo, metalMat)
  beamBack.position.set(0, TABLE_TOP_Y - TABLE_THICKNESS - 55, -legOffsetZ)
  beamBack.castShadow = true
  tableGroup.add(beamBack)

  const beamFrontLeft = new THREE.Mesh(beamSideLeftGeo, metalMat)
  beamFrontLeft.position.set(-1940, TABLE_TOP_Y - TABLE_THICKNESS - 55, legOffsetZ)
  beamFrontLeft.castShadow = true
  tableGroup.add(beamFrontLeft)

  const beamFrontRight = new THREE.Mesh(beamSideRightGeo, metalMat)
  beamFrontRight.position.set(2010, TABLE_TOP_Y - TABLE_THICKNESS - 55, legOffsetZ)
  beamFrontRight.castShadow = true
  tableGroup.add(beamFrontRight)

  for (const bx of [-legOffsetX, legOffsetX]) {
    const beam = new THREE.Mesh(beamZGeo, metalMat)
    beam.position.set(bx, TABLE_TOP_Y - TABLE_THICKNESS - 55, 0)
    beam.castShadow = true
    tableGroup.add(beam)
  }

  webglScene.add(tableGroup)
}
