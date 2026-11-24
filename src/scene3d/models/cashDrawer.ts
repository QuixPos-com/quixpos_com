import {
  DRAWER_D,
  DRAWER_H,
  DRAWER_W,
  DRAWER_X,
  DRAWER_Z,
  TABLE_THICKNESS,
  TABLE_TOP_Y,
} from '../config'
import { createCashButtonTexture } from '../textures'
import type { Disposable, ThreeModule } from '../types'

export function buildCashDrawer(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  const drawerBodyMat = new THREE.MeshStandardMaterial({
    color: '#1a202c',
    roughness: 0.42,
    metalness: 0.55,
  })
  const drawerTrayMat = new THREE.MeshStandardMaterial({
    color: '#111827',
    roughness: 0.5,
    metalness: 0.35,
  })
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.22,
    metalness: 0.88,
  })
  const openBtnTex = createCashButtonTexture(THREE, 'ÖFFNEN', '#1ec9a8')
  const closeBtnTex = createCashButtonTexture(THREE, 'SCHLIESSEN', '#f59e0b')
  const drawerBtnFaceMat = new THREE.MeshStandardMaterial({
    map: openBtnTex,
    roughness: 0.3,
    metalness: 0.15,
  })

  const drawerBottomGeo = new THREE.BoxGeometry(DRAWER_W, 28, DRAWER_D)
  const drawerTopGeo = new THREE.BoxGeometry(DRAWER_W, 32, DRAWER_D)
  const drawerSideGeo = new THREE.BoxGeometry(32, DRAWER_H - 60, DRAWER_D)
  const drawerBackGeo = new THREE.BoxGeometry(DRAWER_W - 64, DRAWER_H - 60, 28)

  const trayFrontGeo = new THREE.BoxGeometry(DRAWER_W - 72, 294, 34)
  const trayFloorGeo = new THREE.BoxGeometry(DRAWER_W - 104, 22, DRAWER_D - 90)
  const traySideGeo = new THREE.BoxGeometry(22, 165, DRAWER_D - 90)
  const trayBackWallGeo = new THREE.BoxGeometry(DRAWER_W - 148, 165, 22)
  const trayDividerGeo = new THREE.BoxGeometry(16, 145, 520)
  const trayMidWallGeo = new THREE.BoxGeometry(DRAWER_W - 148, 130, 18)
  const coinCupGeo = new THREE.BoxGeometry(16, 95, 340)
  const handleBarGeo = new THREE.BoxGeometry(440, 28, 36)
  const lockGeo = new THREE.CylinderGeometry(30, 30, 26, 20)
  const cashBtnGeo = new THREE.BoxGeometry(260, 114, 26)
  const billGeo = new THREE.BoxGeometry(210, 42, 340)
  const coinStackGeo = new THREE.CylinderGeometry(48, 48, 38, 18)

  disposables.push(
    drawerBodyMat,
    drawerTrayMat,
    chromeMat,
    openBtnTex,
    closeBtnTex,
    drawerBtnFaceMat,
    drawerBottomGeo,
    drawerTopGeo,
    drawerSideGeo,
    drawerBackGeo,
    trayFrontGeo,
    trayFloorGeo,
    traySideGeo,
    trayBackWallGeo,
    trayDividerGeo,
    trayMidWallGeo,
    coinCupGeo,
    handleBarGeo,
    lockGeo,
    cashBtnGeo,
    billGeo,
    coinStackGeo,
  )

  const drawerGroup = new THREE.Group()
  drawerGroup.position.set(
    DRAWER_X,
    TABLE_TOP_Y - TABLE_THICKNESS - DRAWER_H,
    DRAWER_Z,
  )
  webglScene.add(drawerGroup)

  const dBottom = new THREE.Mesh(drawerBottomGeo, drawerBodyMat)
  dBottom.position.set(0, 14, 0)
  dBottom.receiveShadow = true
  drawerGroup.add(dBottom)

  const dTop = new THREE.Mesh(drawerTopGeo, drawerBodyMat)
  dTop.position.set(0, DRAWER_H - 16, 0)
  dTop.castShadow = true
  dTop.receiveShadow = true
  drawerGroup.add(dTop)

  const dLeft = new THREE.Mesh(drawerSideGeo, drawerBodyMat)
  dLeft.position.set(-DRAWER_W / 2 + 16, DRAWER_H / 2, 0)
  dLeft.castShadow = true
  dLeft.receiveShadow = true
  drawerGroup.add(dLeft)

  const dRight = new THREE.Mesh(drawerSideGeo, drawerBodyMat)
  dRight.position.set(DRAWER_W / 2 - 16, DRAWER_H / 2, 0)
  dRight.castShadow = true
  dRight.receiveShadow = true
  drawerGroup.add(dRight)

  const dBack = new THREE.Mesh(drawerBackGeo, drawerBodyMat)
  dBack.position.set(0, DRAWER_H / 2, -DRAWER_D / 2 + 14)
  dBack.castShadow = true
  drawerGroup.add(dBack)

  // Sliding inner cash tray (slides along +Z over tabletop & nameplate)
  const drawerTrayGroup = new THREE.Group()
  drawerGroup.add(drawerTrayGroup)

  const trayFront = new THREE.Mesh(trayFrontGeo, drawerBodyMat)
  trayFront.position.set(0, 193, DRAWER_D / 2 - 20)
  trayFront.castShadow = true
  trayFront.receiveShadow = true
  trayFront.userData = {
    tabletTitle: 'Kassenschublade',
    tabletId: 'cash-drawer',
    kind: 'drawer',
  }
  drawerTrayGroup.add(trayFront)

  const handleBar = new THREE.Mesh(handleBarGeo, chromeMat)
  handleBar.position.set(-140, 168, DRAWER_D / 2 + 8)
  handleBar.castShadow = true
  drawerTrayGroup.add(handleBar)

  const lockCylinder = new THREE.Mesh(lockGeo, chromeMat)
  lockCylinder.rotation.x = Math.PI / 2
  lockCylinder.position.set(-500, 198, DRAWER_D / 2 + 2)
  drawerTrayGroup.add(lockCylinder)

  const cashBtnMesh = new THREE.Mesh(cashBtnGeo, [
    chromeMat,
    chromeMat,
    chromeMat,
    chromeMat,
    drawerBtnFaceMat,
    chromeMat,
  ])
  cashBtnMesh.position.set(360, 193, DRAWER_D / 2 + 8)
  cashBtnMesh.castShadow = true
  cashBtnMesh.userData = {
    tabletTitle: 'Kassenschublade',
    tabletId: 'cash-drawer',
    kind: 'drawer',
  }
  drawerTrayGroup.add(cashBtnMesh)

  const drawerTargets: Array<InstanceType<ThreeModule['Mesh']>> = [
    cashBtnMesh,
    trayFront,
  ]

  const trayFloor = new THREE.Mesh(trayFloorGeo, drawerTrayMat)
  trayFloor.position.set(0, 57, -25)
  trayFloor.receiveShadow = true
  drawerTrayGroup.add(trayFloor)

  const trayLeft = new THREE.Mesh(traySideGeo, drawerTrayMat)
  trayLeft.position.set(-(DRAWER_W - 104) / 2 + 11, 145, -25)
  drawerTrayGroup.add(trayLeft)

  const trayRight = new THREE.Mesh(traySideGeo, drawerTrayMat)
  trayRight.position.set((DRAWER_W - 104) / 2 - 11, 145, -25)
  drawerTrayGroup.add(trayRight)

  const trayBackWall = new THREE.Mesh(trayBackWallGeo, drawerTrayMat)
  trayBackWall.position.set(0, 145, -DRAWER_D / 2 + 32)
  drawerTrayGroup.add(trayBackWall)

  const trayMidWall = new THREE.Mesh(trayMidWallGeo, drawerTrayMat)
  trayMidWall.position.set(0, 130, 80)
  drawerTrayGroup.add(trayMidWall)

  const billColors = ['#9ca3af', '#f87171', '#60a5fa', '#fbbf24']
  for (let i = 0; i < 4; i++) {
    const bx = -420 + i * 280
    if (i < 3) {
      const div = new THREE.Mesh(trayDividerGeo, drawerTrayMat)
      div.position.set(bx + 140, 136, -220)
      drawerTrayGroup.add(div)
    }
    const billMat = new THREE.MeshStandardMaterial({
      color: billColors[i],
      roughness: 0.7,
    })
    disposables.push(billMat)
    const billStack = new THREE.Mesh(billGeo, billMat)
    billStack.position.set(bx, 88, -220)
    drawerTrayGroup.add(billStack)
  }

  const coinMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    roughness: 0.25,
    metalness: 0.82,
  })
  disposables.push(coinMat)
  for (let i = 0; i < 5; i++) {
    const cx = -440 + i * 220
    if (i < 4) {
      const cupDiv = new THREE.Mesh(coinCupGeo, drawerTrayMat)
      cupDiv.position.set(cx + 110, 112, 290)
      drawerTrayGroup.add(cupDiv)
    }
    const coins = new THREE.Mesh(coinStackGeo, coinMat)
    coins.position.set(cx, 86, 290)
    drawerTrayGroup.add(coins)
  }

  return {
    drawerTrayGroup,
    cashBtnMesh,
    drawerBtnFaceMat,
    openBtnTex,
    closeBtnTex,
    drawerTargets,
    drawerSurfaceMeshes: [
      dBottom,
      dTop,
      dLeft,
      dRight,
      dBack,
      trayFront,
      trayFloor,
    ],
  }
}
