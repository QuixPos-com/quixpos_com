import {
  DRAWER_D,
  DRAWER_H,
  DRAWER_W,
  DRAWER_X,
  DRAWER_Z,
  TABLE_THICKNESS,
  TABLE_TOP_Y,
} from '../config'
import {
  createCashButtonTexture,
  createEuroCoinTexture,
  createEuroNoteTexture,
  type EuroCoinVisualStyle,
  type EuroNoteDenom,
} from '../textures'
import type { Disposable, EuroCashBreakdown, ThreeModule } from '../types'

interface NoteSlotSpec {
  denom: EuroNoteDenom
  cents: number
  key: keyof EuroCashBreakdown['notes']
  width: number
  length: number
}

interface CoinCupSpec {
  cents: number
  key: keyof EuroCashBreakdown['coins']
  label: string
  subLabel: 'EURO' | 'CENT'
  style: EuroCoinVisualStyle
  radius: number
  thickness: number
  rimColor: string
}

// 5 Euro banknote compartments (left -> right: €5, €10, €20, €50, €100)
const NOTE_SLOTS: readonly NoteSlotSpec[] = [
  { denom: 5, cents: 500, key: '5', width: 192, length: 344 },
  { denom: 10, cents: 1000, key: '10', width: 196, length: 364 },
  { denom: 20, cents: 2000, key: '20', width: 200, length: 382 },
  { denom: 50, cents: 5000, key: '50', width: 204, length: 400 },
  { denom: 100, cents: 10000, key: '100', width: 208, length: 420 },
]

// 8 Euro coin cups (left -> right: €2, €1, 50c, 20c, 10c, 5c, 2c, 1c)
// Real Euro diameters scaled (~4 world units = 1 mm) to fit cleanly in 151-unit cups
const COIN_CUPS: readonly CoinCupSpec[] = [
  {
    cents: 200,
    key: '200',
    label: '2',
    subLabel: 'EURO',
    style: 'bimetallic-2',
    radius: 49,
    thickness: 8.8,
    rimColor: '#cbd5e1',
  },
  {
    cents: 100,
    key: '100',
    label: '1',
    subLabel: 'EURO',
    style: 'bimetallic-1',
    radius: 45,
    thickness: 9.2,
    rimColor: '#d9b24c',
  },
  {
    cents: 50,
    key: '50',
    label: '50',
    subLabel: 'CENT',
    style: 'gold',
    radius: 47,
    thickness: 9.4,
    rimColor: '#dfb549',
  },
  {
    cents: 20,
    key: '20',
    label: '20',
    subLabel: 'CENT',
    style: 'gold',
    radius: 43,
    thickness: 8.6,
    rimColor: '#dfb549',
  },
  {
    cents: 10,
    key: '10',
    label: '10',
    subLabel: 'CENT',
    style: 'gold',
    radius: 38,
    thickness: 8.0,
    rimColor: '#dfb549',
  },
  {
    cents: 5,
    key: '5',
    label: '5',
    subLabel: 'CENT',
    style: 'copper',
    radius: 41,
    thickness: 7.2,
    rimColor: '#c8754b',
  },
  {
    cents: 2,
    key: '2',
    label: '2',
    subLabel: 'CENT',
    style: 'copper',
    radius: 36,
    thickness: 7.0,
    rimColor: '#c8754b',
  },
  {
    cents: 1,
    key: '1',
    label: '1',
    subLabel: 'CENT',
    style: 'copper',
    radius: 32,
    thickness: 6.8,
    rimColor: '#c8754b',
  },
]

const INITIAL_DEMO_CASH_CENTS = 18888 // €188.88 (1 of every Euro note & coin)
const MAX_VISUAL_NOTES_PER_SLOT = 38
const MAX_VISUAL_COINS_PER_CUP = 42
const NOTE_THICKNESS = 4.2

export function calculateEuroCashBreakdown(
  totalCentsInput: number,
): EuroCashBreakdown {
  let remaining = Math.max(0, Math.round(totalCentsInput))
  const totalCents = remaining

  const notes: EuroCashBreakdown['notes'] = {
    '100': 0,
    '50': 0,
    '20': 0,
    '10': 0,
    '5': 0,
  }
  const coins: EuroCashBreakdown['coins'] = {
    '200': 0,
    '100': 0,
    '50': 0,
    '20': 0,
    '10': 0,
    '5': 0,
    '2': 0,
    '1': 0,
  }

  for (const denom of [10000, 5000, 2000, 1000, 500] as const) {
    const count = Math.floor(remaining / denom)
    remaining -= count * denom
    const key = String(denom / 100) as keyof EuroCashBreakdown['notes']
    notes[key] = count
  }

  for (const denom of [200, 100, 50, 20, 10, 5, 2, 1] as const) {
    const count = Math.floor(remaining / denom)
    remaining -= count * denom
    const key = String(denom) as keyof EuroCashBreakdown['coins']
    coins[key] = count
  }

  return {
    cents: totalCents,
    amount: Math.round(totalCents) / 100,
    notes,
    coins,
  }
}

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
  const noteEdgeMat = new THREE.MeshStandardMaterial({
    color: '#e5e7eb',
    roughness: 0.78,
    metalness: 0.02,
  })
  const openBtnTex = createCashButtonTexture(THREE, 'ÖFFNEN', '#1ec9a8')
  const closeBtnTex = createCashButtonTexture(THREE, 'SCHLIESSEN', '#f59e0b')
  const drawerBtnFaceMat = new THREE.MeshStandardMaterial({
    map: openBtnTex,
    roughness: 0.3,
    metalness: 0.15,
  })

  const innerW = DRAWER_W - 148 // 1212 units
  const drawerBottomGeo = new THREE.BoxGeometry(DRAWER_W, 28, DRAWER_D)
  const drawerTopGeo = new THREE.BoxGeometry(DRAWER_W, 32, DRAWER_D)
  const drawerSideGeo = new THREE.BoxGeometry(32, DRAWER_H - 60, DRAWER_D)
  const drawerBackGeo = new THREE.BoxGeometry(DRAWER_W - 64, DRAWER_H - 60, 28)

  const trayFrontGeo = new THREE.BoxGeometry(DRAWER_W - 72, 294, 34)
  const trayFloorGeo = new THREE.BoxGeometry(DRAWER_W - 104, 22, DRAWER_D - 90)
  const traySideGeo = new THREE.BoxGeometry(22, 165, DRAWER_D - 90)
  const trayBackWallGeo = new THREE.BoxGeometry(innerW, 165, 22)
  const trayDividerGeo = new THREE.BoxGeometry(12, 145, 560)
  const trayMidWallGeo = new THREE.BoxGeometry(innerW, 130, 18)
  const coinCupGeo = new THREE.BoxGeometry(10, 95, 390)
  const handleBarGeo = new THREE.BoxGeometry(440, 28, 36)
  const lockGeo = new THREE.CylinderGeometry(30, 30, 26, 20)
  const cashBtnGeo = new THREE.BoxGeometry(260, 114, 26)

  disposables.push(
    drawerBodyMat,
    drawerTrayMat,
    chromeMat,
    noteEdgeMat,
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

      // 5 Euro banknote slot dividers (rear section)
      const noteSlotW = innerW / NOTE_SLOTS.length
  for(let i = 1; i<NOTE_SLOTS.length; i++) {
        const divX = -innerW / 2 + i * noteSlotW
    const div = new THREE.Mesh(trayDividerGeo, drawerTrayMat)
    div.position.set(divX, 136, -220)
    drawerTrayGroup.add(div)
  }

  // 8 Euro coin cup dividers (front section)
  const coinCupW = innerW / COIN_CUPS.length
  for (let i = 1; i < COIN_CUPS.length; i++) {
    const divX = -innerW / 2 + i * coinCupW
    const cupDiv = new THREE.Mesh(coinCupGeo, drawerTrayMat)
    cupDiv.position.set(divX, 112, 300)
    drawerTrayGroup.add(cupDiv)
  }

  // Pre-build shared geometries & Euro note/coin materials once (zero allocations on amount updates)
  const noteResources = NOTE_SLOTS.map((spec) => {
    const geo = new THREE.BoxGeometry(spec.width, NOTE_THICKNESS, spec.length)
    const tex = createEuroNoteTexture(THREE, spec.denom)
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.72,
      metalness: 0.04,
    })
    disposables.push(geo, tex, faceMat)
    const mats = [
      noteEdgeMat,
      noteEdgeMat,
      faceMat,
      faceMat,
      noteEdgeMat,
      noteEdgeMat,
    ]
    return { spec, geo, mats }
  })

  const coinResources = COIN_CUPS.map((spec) => {
    const geo = new THREE.CylinderGeometry(
      spec.radius,
      spec.radius,
      spec.thickness,
      20,
    )
    const tex = createEuroCoinTexture(
      THREE,
      spec.label,
      spec.subLabel,
      spec.style,
    )
    const rimMat = new THREE.MeshStandardMaterial({
      color: spec.rimColor,
      roughness: 0.28,
      metalness: 0.78,
    })
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.3,
      metalness: 0.62,
    })
    disposables.push(geo, tex, rimMat, faceMat)
    const mats = [rimMat, faceMat, faceMat]
    return { spec, geo, mats }
  })

  // Dynamic group holding the current Euro notes & coins inside the sliding tray
  const cashContentsGroup = new THREE.Group()
  drawerTrayGroup.add(cashContentsGroup)

  const TRAY_SURFACE_Y = 68.2
  let currentBreakdown: EuroCashBreakdown = calculateEuroCashBreakdown(
    INITIAL_DEMO_CASH_CENTS,
  )

  const deterministicJitter = (seed: number) => {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return (x - Math.floor(x)) * 2 - 1
  }

      const rebuildCashMeshes = (breakdown: EuroCashBreakdown) => {
        while (cashContentsGroup.children.length > 0) {
          cashContentsGroup.remove(cashContentsGroup.children[0])
        }

        // 1. Place Euro banknotes in their 5 compartments
        for (let slotIdx = 0; slotIdx < noteResources.length; slotIdx++) {
          const { spec, geo, mats } = noteResources[slotIdx]
          const count = breakdown.notes[spec.key]
          if (count <= 0) continue

          const visualCount = Math.min(count, MAX_VISUAL_NOTES_PER_SLOT)
          const slotCenterX = -innerW / 2 + (slotIdx + 0.5) * noteSlotW
          const baseZ = -216

          for (let n = 0; n < visualCount; n++) {
            const noteMesh = new THREE.Mesh(geo, mats)
            const jx = deterministicJitter(slotIdx * 131 + n * 17) * 5.5
            const jz = deterministicJitter(slotIdx * 197 + n * 29) * 8.0
            const jy = deterministicJitter(slotIdx * 251 + n * 43) * 0.032
            noteMesh.position.set(
              slotCenterX + jx,
              TRAY_SURFACE_Y + NOTE_THICKNESS * 0.5 + n * (NOTE_THICKNESS + 0.35),
              baseZ + jz,
            )
            noteMesh.rotation.y = jy
            noteMesh.receiveShadow = true
            cashContentsGroup.add(noteMesh)
          }
        }

        // 2. Place Euro coins in their 8 cups (up to 3 neat stacks per cup when count is high)
        for (let cupIdx = 0; cupIdx < coinResources.length; cupIdx++) {
          const { spec, geo, mats } = coinResources[cupIdx]
          const count = breakdown.coins[spec.key]
          if (count <= 0) continue

          const visualCount = Math.min(count, MAX_VISUAL_COINS_PER_CUP)
          const cupCenterX = -innerW / 2 + (cupIdx + 0.5) * coinCupW
          const maxPerStack = 14
          const stackZOffsets =
            visualCount <= maxPerStack
              ? [300]
              : visualCount <= maxPerStack * 2
                ? [235, 365]
                : [185, 300, 415]

          for (let c = 0; c < visualCount; c++) {
            const stackIdx = Math.min(
              stackZOffsets.length - 1,
              Math.floor(c / maxPerStack),
            )
            const levelInStack = c % maxPerStack
            const jx = deterministicJitter(cupIdx * 311 + c * 19) * 5.0
            const jz = deterministicJitter(cupIdx * 409 + c * 37) * 5.0

            const coinMesh = new THREE.Mesh(geo, mats)
            coinMesh.position.set(
              cupCenterX + jx,
              TRAY_SURFACE_Y +
              spec.thickness * 0.5 +
              levelInStack * (spec.thickness + 0.35),
              stackZOffsets[stackIdx] + jz,
            )
            coinMesh.rotation.y = deterministicJitter(cupIdx * 521 + c * 13) * Math.PI
            coinMesh.receiveShadow = true
            cashContentsGroup.add(coinMesh)
          }
        }
      }

      const setCashCents = (cents: number): EuroCashBreakdown => {
        currentBreakdown = calculateEuroCashBreakdown(cents)
        rebuildCashMeshes(currentBreakdown)
        return currentBreakdown
      }

      const setCashAmount = (amountEur: number): EuroCashBreakdown => {
        return setCashCents(Math.round(amountEur * 100))
      }

      const getCashBreakdown = (): EuroCashBreakdown => currentBreakdown

      // Render initial demo Euro float
      rebuildCashMeshes(currentBreakdown)

      return {
        drawerTrayGroup,
        cashBtnMesh,
        drawerBtnFaceMat,
        openBtnTex,
        closeBtnTex,
        drawerTargets,
        setCashAmount,
        setCashCents,
        getCashBreakdown,
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
