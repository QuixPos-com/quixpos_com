import { applyBerlinLighting } from '../berlinSun'
import {
  ARENA_HALF,
  ROOM_BACK_Z,
  ROOM_FRONT_Z,
  ROOM_HEIGHT,
  TABLE_D,
  TABLE_THICKNESS,
  TABLE_TOP_Y,
  TABLE_W,
  TABLE_Z,
} from '../config'
import { markFocusSharp } from '../focusBlurPass'
import { createFloorTexture, createWoodTexture } from '../textures'
import type { Disposable, ThreeModule } from '../types'

export function buildLightingAndFloor(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  // 1. Berlin real-time sky & sun lighting
  const hemiLight = new THREE.HemisphereLight('#ffffff', '#9eb3c4', 1.05)
  hemiLight.position.set(0, 30000, 0)
  markFocusSharp(hemiLight)
  webglScene.add(hemiLight)

  const roomMidZ = (ROOM_BACK_Z + ROOM_FRONT_Z) / 2
  const dirLight = new THREE.DirectionalLight('#fffaf0', 1.45)
  dirLight.position.set(8000, 18000, roomMidZ + 11000)
  dirLight.target.position.set(0, 0, roomMidZ)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  dirLight.shadow.camera.near = 2000
  dirLight.shadow.camera.far = 55000
  const shadowExtent = 14800
  dirLight.shadow.camera.left = -shadowExtent
  dirLight.shadow.camera.right = shadowExtent
  dirLight.shadow.camera.top = shadowExtent
  dirLight.shadow.camera.bottom = -shadowExtent
  dirLight.shadow.bias = -0.0005
  markFocusSharp(dirLight)
  markFocusSharp(dirLight.target)
  webglScene.add(dirLight)
  webglScene.add(dirLight.target)

  // 2. Average indoor overhead room light centered for the POS table
  const tableRoomLight = new THREE.SpotLight(
    '#fff4e2',
    1.25,
    28000,
    Math.PI * 0.44,
    0.85,
    0,
  )
  tableRoomLight.position.set(350, ROOM_HEIGHT - 600, TABLE_Z + 1900)
  tableRoomLight.target.position.set(0, TABLE_TOP_Y - 800, TABLE_Z + 300)
  tableRoomLight.castShadow = true
  tableRoomLight.shadow.mapSize.width = 1024
  tableRoomLight.shadow.mapSize.height = 1024
  tableRoomLight.shadow.camera.near = 1500
  tableRoomLight.shadow.camera.far = 22000
  tableRoomLight.shadow.bias = -0.0005
  markFocusSharp(tableRoomLight)
  markFocusSharp(tableRoomLight.target)
  webglScene.add(tableRoomLight)
  webglScene.add(tableRoomLight.target)

  const roomFillLight = new THREE.PointLight('#f8efe2', 0.42, 28000, 0)
  roomFillLight.position.set(0, ROOM_HEIGHT - 1400, TABLE_Z + 2200)
  roomFillLight.castShadow = false
  markFocusSharp(roomFillLight)
  webglScene.add(roomFillLight)

  disposables.push(hemiLight, dirLight, tableRoomLight, roomFillLight)

  const updateBerlinTimeLighting = (date: Date = new Date()) =>
    applyBerlinLighting(THREE, webglScene, hemiLight, dirLight, date)

  updateBerlinTimeLighting(new Date())

  // Flat Area Floor (4-color pastel checkered carpet)
  const floorTex = createFloorTexture(THREE)
  disposables.push(floorTex)
  const floorGeo = new THREE.PlaneGeometry(ARENA_HALF * 2.4, ARENA_HALF * 2.4)
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.96,
    metalness: 0.0,
  })
  disposables.push(floorGeo, floorMat)
  const floorMesh = new THREE.Mesh(floorGeo, floorMat)
  floorMesh.rotation.x = -Math.PI / 2
  floorMesh.receiveShadow = true
  webglScene.add(floorMesh)

  return {
    floorMesh,
    updateBerlinTimeLighting,
  }
}

export function buildTable(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  const tableGroup = new THREE.Group()
  tableGroup.position.set(0, 0, TABLE_Z)
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

  const tableMeshes: Array<InstanceType<ThreeModule['Mesh']>> = [topMesh]

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
    tableMeshes.push(leg)
  }

  // Subtle under-table crossbar frame (front beam leaves opening for under-table cash drawer)
  const leftBeamW = legOffsetX - 640
  const rightBeamW = legOffsetX - 780
  const beamBackGeo = new THREE.BoxGeometry(TABLE_W - 520, 110, 120)
  const beamSideLeftGeo = new THREE.BoxGeometry(leftBeamW, 110, 120)
  const beamSideRightGeo = new THREE.BoxGeometry(rightBeamW, 110, 120)
  const beamZGeo = new THREE.BoxGeometry(120, 110, TABLE_D - 520)
  disposables.push(beamBackGeo, beamSideLeftGeo, beamSideRightGeo, beamZGeo)

  const beamBack = new THREE.Mesh(beamBackGeo, metalMat)
  beamBack.position.set(0, TABLE_TOP_Y - TABLE_THICKNESS - 55, -legOffsetZ)
  beamBack.castShadow = true
  tableGroup.add(beamBack)
  tableMeshes.push(beamBack)

  const beamFrontLeft = new THREE.Mesh(beamSideLeftGeo, metalMat)
  beamFrontLeft.position.set(
    -(legOffsetX + 640) / 2,
    TABLE_TOP_Y - TABLE_THICKNESS - 55,
    legOffsetZ,
  )
  beamFrontLeft.castShadow = true
  tableGroup.add(beamFrontLeft)
  tableMeshes.push(beamFrontLeft)

  const beamFrontRight = new THREE.Mesh(beamSideRightGeo, metalMat)
  beamFrontRight.position.set(
    (legOffsetX + 780) / 2,
    TABLE_TOP_Y - TABLE_THICKNESS - 55,
    legOffsetZ,
  )
  beamFrontRight.castShadow = true
  tableGroup.add(beamFrontRight)
  tableMeshes.push(beamFrontRight)

  for (const bx of [-legOffsetX, legOffsetX]) {
    const beam = new THREE.Mesh(beamZGeo, metalMat)
    beam.position.set(bx, TABLE_TOP_Y - TABLE_THICKNESS - 55, 0)
    beam.castShadow = true
    tableGroup.add(beam)
    tableMeshes.push(beam)
  }

  webglScene.add(tableGroup)
  return {
    tableGroup,
    tableMeshes,
  }
}
