import {
  BACK_SHELF_BAYS,
  ROOM_BACK_Z,
  ROOM_FRONT_Z,
  ROOM_HALF_W,
  ROOM_HEIGHT,
  SHELF_BAY_W,
  SHELF_BOARD_THICKNESS,
  SHELF_DEPTH,
  SHELF_HEIGHT,
  SHELF_LEVEL_YS,
  SIDE_SHELF_BAYS,
  WALL_THICKNESS,
} from '../config'
import { markFocusSharp } from '../focusBlurPass'
import { createExampleBoxLabelTexture, createWoodTexture } from '../textures'
import type { Disposable, ShelfSlot, ShelfWallId, ThreeModule } from '../types'

interface ShelvingUnitSpec {
  wall: ShelfWallId
  bays: number
  originX: number
  originZ: number
  facingYaw: number
}

export function buildWallsAndShelves(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  const roomGroup = new THREE.Group()
  const surfaceMeshes: Array<InstanceType<ThreeModule['Mesh']>> = []
  const shelfSlots: ShelfSlot[] = []

  // 1. Room Walls & Trim
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#eae5dc',
    roughness: 0.92,
    metalness: 0.0,
  })
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: '#1f2937',
    roughness: 0.48,
    metalness: 0.35,
  })
  const wallCapMat = new THREE.MeshStandardMaterial({
    color: '#d6cfc2',
    roughness: 0.78,
    metalness: 0.04,
  })
  disposables.push(wallMat, baseboardMat, wallCapMat)

  const roomFullW = ROOM_HALF_W * 2 + WALL_THICKNESS * 2
  const roomDepth = ROOM_FRONT_Z - ROOM_BACK_Z
  const roomMidZ = (ROOM_BACK_Z + ROOM_FRONT_Z) / 2
  const baseboardH = 360
  const baseboardD = 48
  const capH = 140
  const capW = WALL_THICKNESS + 60

  const wallBackGeo = new THREE.BoxGeometry(roomFullW, ROOM_HEIGHT, WALL_THICKNESS)
  const wallSideGeo = new THREE.BoxGeometry(WALL_THICKNESS, ROOM_HEIGHT, roomDepth)
  const baseXGeo = new THREE.BoxGeometry(ROOM_HALF_W * 2, baseboardH, baseboardD)
  const baseZGeo = new THREE.BoxGeometry(baseboardD, baseboardH, roomDepth)
  const capXGeo = new THREE.BoxGeometry(roomFullW, capH, capW)
  const capZGeo = new THREE.BoxGeometry(capW, capH, roomDepth)
  disposables.push(wallBackGeo, wallSideGeo, baseXGeo, baseZGeo, capXGeo, capZGeo)

  const addRoomMesh = (
    geo: InstanceType<ThreeModule['BoxGeometry']>,
    mat: InstanceType<ThreeModule['Material']>,
    x: number,
    y: number,
    z: number,
    registerSurface = true,
  ) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    roomGroup.add(mesh)
    if (registerSurface) {
      surfaceMeshes.push(mesh)
    }
    return mesh
  }

  // Back, front, left, right walls
  addRoomMesh(wallBackGeo, wallMat, 0, ROOM_HEIGHT / 2, ROOM_BACK_Z - WALL_THICKNESS / 2)
  addRoomMesh(wallBackGeo, wallMat, 0, ROOM_HEIGHT / 2, ROOM_FRONT_Z + WALL_THICKNESS / 2)
  addRoomMesh(wallSideGeo, wallMat, -ROOM_HALF_W - WALL_THICKNESS / 2, ROOM_HEIGHT / 2, roomMidZ)
  addRoomMesh(wallSideGeo, wallMat, ROOM_HALF_W + WALL_THICKNESS / 2, ROOM_HEIGHT / 2, roomMidZ)

  // Baseboards
  addRoomMesh(baseXGeo, baseboardMat, 0, baseboardH / 2, ROOM_BACK_Z + baseboardD / 2, false)
  addRoomMesh(baseXGeo, baseboardMat, 0, baseboardH / 2, ROOM_FRONT_Z - baseboardD / 2, false)
  addRoomMesh(baseZGeo, baseboardMat, -ROOM_HALF_W + baseboardD / 2, baseboardH / 2, roomMidZ, false)
  addRoomMesh(baseZGeo, baseboardMat, ROOM_HALF_W - baseboardD / 2, baseboardH / 2, roomMidZ, false)

  // Top wall cap molding
  addRoomMesh(capXGeo, wallCapMat, 0, ROOM_HEIGHT + capH / 2, ROOM_BACK_Z - WALL_THICKNESS / 2, false)
  addRoomMesh(capXGeo, wallCapMat, 0, ROOM_HEIGHT + capH / 2, ROOM_FRONT_Z + WALL_THICKNESS / 2, false)
  addRoomMesh(capZGeo, wallCapMat, -ROOM_HALF_W - WALL_THICKNESS / 2, ROOM_HEIGHT + capH / 2, roomMidZ, false)
  addRoomMesh(capZGeo, wallCapMat, ROOM_HALF_W + WALL_THICKNESS / 2, ROOM_HEIGHT + capH / 2, roomMidZ, false)

  // 2. Retail Shelving Units (steel uprights + wood shelf planks)
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#1f2937',
    roughness: 0.36,
    metalness: 0.72,
  })
  const shelfWoodTex = createWoodTexture(THREE)
  const shelfWoodMat = new THREE.MeshStandardMaterial({
    map: shelfWoodTex,
    roughness: 0.56,
    metalness: 0.05,
  })
  disposables.push(steelMat, shelfWoodTex, shelfWoodMat)

  const postSize = 80
  const railH = 56
  const railD = 32
  const plankW = SHELF_BAY_W - postSize
  const plankD = SHELF_DEPTH - 24

  const postGeo = new THREE.BoxGeometry(postSize, SHELF_HEIGHT, postSize)
  const plankGeo = new THREE.BoxGeometry(plankW, SHELF_BOARD_THICKNESS, plankD)
  const railGeo = new THREE.BoxGeometry(plankW, railH, railD)
  const sideBarGeo = new THREE.BoxGeometry(36, 48, SHELF_DEPTH - postSize)
  disposables.push(postGeo, plankGeo, railGeo, sideBarGeo)

  const shelvingUnits: ShelvingUnitSpec[] = [
    {
      wall: 'back',
      bays: BACK_SHELF_BAYS,
      originX: 0,
      originZ: ROOM_BACK_Z,
      facingYaw: 0,
    },
    {
      wall: 'left',
      bays: SIDE_SHELF_BAYS,
      originX: -ROOM_HALF_W,
      originZ: 0,
      facingYaw: Math.PI / 2,
    },
    {
      wall: 'right',
      bays: SIDE_SHELF_BAYS,
      originX: ROOM_HALF_W,
      originZ: 0,
      facingYaw: -Math.PI / 2,
    },
  ]

  for (const unit of shelvingUnits) {
    const unitGroup = new THREE.Group()
    unitGroup.position.set(unit.originX, 0, unit.originZ)
    unitGroup.rotation.y = unit.facingYaw

    const totalW = unit.bays * SHELF_BAY_W
    const cosY = Math.cos(unit.facingYaw)
    const sinY = Math.sin(unit.facingYaw)

    // Vertical posts + side crossbars
    for (let i = 0; i <= unit.bays; i++) {
      const postX = -totalW / 2 + i * SHELF_BAY_W

      for (const postZ of [postSize / 2, SHELF_DEPTH - postSize / 2]) {
        const post = new THREE.Mesh(postGeo, steelMat)
        post.position.set(postX, SHELF_HEIGHT / 2, postZ)
        post.castShadow = true
        post.receiveShadow = true
        unitGroup.add(post)
      }

      for (const levelY of SHELF_LEVEL_YS) {
        const sideBar = new THREE.Mesh(sideBarGeo, steelMat)
        sideBar.position.set(
          postX,
          levelY - SHELF_BOARD_THICKNESS - 24,
          SHELF_DEPTH / 2,
        )
        sideBar.castShadow = true
        unitGroup.add(sideBar)
      }
    }

    // Shelf planks & slot metadata per bay and level
    for (let b = 0; b < unit.bays; b++) {
      const bayCenterX = -totalW / 2 + (b + 0.5) * SHELF_BAY_W

      for (let l = 0; l < SHELF_LEVEL_YS.length; l++) {
        const surfaceY = SHELF_LEVEL_YS[l]
        const nextLevelY =
          l + 1 < SHELF_LEVEL_YS.length
            ? SHELF_LEVEL_YS[l + 1] - SHELF_BOARD_THICKNESS
            : ROOM_HEIGHT
        const clearanceHeight = nextLevelY - surfaceY

        const plank = new THREE.Mesh(plankGeo, shelfWoodMat)
        plank.position.set(
          bayCenterX,
          surfaceY - SHELF_BOARD_THICKNESS / 2,
          SHELF_DEPTH / 2,
        )
        plank.castShadow = true
        plank.receiveShadow = true
        unitGroup.add(plank)
        surfaceMeshes.push(plank)

        for (const railZ of [railD / 2 + 12, SHELF_DEPTH - railD / 2 - 12]) {
          const rail = new THREE.Mesh(railGeo, steelMat)
          rail.position.set(
            bayCenterX,
            surfaceY - SHELF_BOARD_THICKNESS - railH / 2,
            railZ,
          )
          rail.castShadow = true
          unitGroup.add(rail)
        }

        const localZ = SHELF_DEPTH / 2
        shelfSlots.push({
          id: `${unit.wall}-bay${b}-lvl${l}`,
          wall: unit.wall,
          bayIndex: b,
          levelIndex: l,
          centerX: unit.originX + bayCenterX * cosY + localZ * sinY,
          surfaceY,
          centerZ: unit.originZ - bayCenterX * sinY + localZ * cosY,
          usableWidth: plankW - 80,
          usableDepth: plankD - 60,
          clearanceHeight,
          facingYaw: unit.facingYaw,
        })
      }
    }

    roomGroup.add(unitGroup)
  }

  // 3. One Example Inventory Box on Back Shelf (bay 2, level 2 -> visible above POS counter)
  const exampleSlot =
    shelfSlots.find((s) => s.id === 'back-bay2-lvl2') ?? shelfSlots[0]

  const boxW = 1120
  const boxH = 960
  const boxD = 960

  const cardboardMat = new THREE.MeshStandardMaterial({
    color: '#c49a6c',
    roughness: 0.86,
    metalness: 0.02,
  })
  const tapeMat = new THREE.MeshStandardMaterial({
    color: '#dec59d',
    roughness: 0.45,
    metalness: 0.04,
  })
  const boxLabelTex = createExampleBoxLabelTexture(THREE)
  const boxLabelMat = new THREE.MeshStandardMaterial({
    map: boxLabelTex,
    roughness: 0.55,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })

  const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD)
  const topTapeGeo = new THREE.BoxGeometry(boxW + 4, 8, 170)
  const frontTapeGeo = new THREE.BoxGeometry(170, 150, 8)
  const labelGeo = new THREE.PlaneGeometry(680, 680)

  disposables.push(
    cardboardMat,
    tapeMat,
    boxLabelTex,
    boxLabelMat,
    boxGeo,
    topTapeGeo,
    frontTapeGeo,
    labelGeo,
  )

  const exampleBoxGroup = new THREE.Group()
  exampleBoxGroup.position.set(
    exampleSlot.centerX - 320,
    exampleSlot.surfaceY,
    exampleSlot.centerZ + 40,
  )
  exampleBoxGroup.rotation.y = -0.07

  const boxMesh = new THREE.Mesh(boxGeo, cardboardMat)
  boxMesh.position.set(0, boxH / 2, 0)
  boxMesh.castShadow = true
  boxMesh.receiveShadow = true
  exampleBoxGroup.add(boxMesh)
  surfaceMeshes.push(boxMesh)

  const topTape = new THREE.Mesh(topTapeGeo, tapeMat)
  topTape.position.set(0, boxH + 2, 0)
  exampleBoxGroup.add(topTape)

  const frontTape = new THREE.Mesh(frontTapeGeo, tapeMat)
  frontTape.position.set(0, boxH - 75, boxD / 2 + 2)
  exampleBoxGroup.add(frontTape)

  const frontLabel = new THREE.Mesh(labelGeo, boxLabelMat)
  frontLabel.position.set(0, boxH * 0.46, boxD / 2 + 2)
  exampleBoxGroup.add(frontLabel)

  roomGroup.add(exampleBoxGroup)

  markFocusSharp(roomGroup)
  webglScene.add(roomGroup)

  return {
    roomGroup,
    wallAndShelfSurfaceMeshes: surfaceMeshes,
    shelfSlots,
    exampleBoxGroup,
  }
}
