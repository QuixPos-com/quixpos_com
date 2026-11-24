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
import { createShelfLedWashTexture, createWoodTexture } from '../textures'
import type {
  Disposable,
  ShelfProductInput,
  ShelfProductSummary,
  ShelfSlot,
  ShelfWallId,
  ThreeModule,
} from '../types'

interface ShelvingUnitSpec {
  wall: ShelfWallId
  bays: number
  originX: number
  originZ: number
  facingYaw: number
}

interface NormalizedProduct {
  id: string
  sku?: string
  name?: string
  imageUrl?: string
  stock: number
  slotId?: string
  wall?: ShelfWallId
  aspectRatio: number
  boxColor: string
  maxVisible?: number
}

interface CachedProductImage {
  status: 'queued' | 'loading' | 'loaded' | 'error'
  aspectRatio: number
  texture: InstanceType<ThreeModule['CanvasTexture']> | null
  callbacks: Array<() => void>
}

interface ProductPlan {
  product: NormalizedProduct
  dims: ReturnType<typeof computeBoxDimensions>
  slots: Array<{ slot: ShelfSlot; count: number }>
  targetCount: number
}

interface ProductRenderState {
  product: NormalizedProduct
  group: InstanceType<ThreeModule['Group']>
  meshes: Array<InstanceType<ThreeModule['Mesh']>>
  disposables: Disposable[]
  boxGeo: InstanceType<ThreeModule['BoxGeometry']>
  topTapeGeo: InstanceType<ThreeModule['BoxGeometry']>
  labelGeo: InstanceType<ThreeModule['PlaneGeometry']>
  cardboardMat: InstanceType<ThreeModule['MeshStandardMaterial']>
  frontLabelMat: InstanceType<ThreeModule['MeshStandardMaterial']>
  dims: ReturnType<typeof computeBoxDimensions>
  placedSlotIds: string[]
  renderedBoxes: number
}

interface PendingBoxTask {
  generation: number
  plan: ProductPlan
  slotId: string
  worldX: number
  worldY: number
  worldZ: number
  yaw: number
}

const WALL_ORDER: Record<ShelfWallId, number> = {
  back: 0,
  left: 1,
  right: 2,
}

// Eye-level and counter-level shelves first, then top and bottom
const LEVEL_ORDER: Record<number, number> = {
  2: 0,
  1: 1,
  3: 2,
  0: 3,
}

// Center-out bay ordering so first items appear right behind the POS counter
const BACK_BAY_ORDER: Record<number, number> = {
  1: 0,
  2: 1,
  0: 2,
  3: 3,
}

const MAX_CONCURRENT_IMAGE_FETCHES = 3
const BOX_SPAWN_INTERVAL_MS = 28
const SUMMARY_EMIT_INTERVAL_MS = 450

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function computeBoxDimensions(rawAspect: number) {
  const aspect = clamp(
    Number.isFinite(rawAspect) && rawAspect > 0 ? rawAspect : 1,
    0.35,
    2.4,
  )
  const baseSize = 860
  let boxW = clamp(baseSize * Math.sqrt(aspect), 460, 1460)
  let boxH = clamp(boxW / aspect, 440, 1280)
  boxW = clamp(boxH * aspect, 460, 1460)
  const boxD = clamp(Math.min(boxW, boxH) * 0.56, 380, 560)
  return { boxW, boxH, boxD, aspect }
}

function computeSlotLayoutCapacity(
  slot: ShelfSlot,
  boxW: number,
  boxH: number,
  boxD: number,
) {
  const gapX = 80
  const gapZ = 80
  const gapY = 20
  const cols = Math.max(1, Math.floor((slot.usableWidth + gapX) / (boxW + gapX)))
  const rows = Math.max(1, Math.floor((slot.usableDepth + gapZ) / (boxD + gapZ)))
  const stacks = Math.max(
    1,
    Math.floor((slot.clearanceHeight - 60 + gapY) / (boxH + gapY)),
  )
  return {
    cols,
    rows,
    stacks,
    gapX,
    gapZ,
    gapY,
    capacity: cols * rows * stacks,
  }
}

function createProductFallbackTexture(
  THREE: ThreeModule,
  title: string,
  sku?: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 6
  ctx.strokeRect(6, 6, 244, 244)

  ctx.fillStyle = '#0f766e'
  ctx.fillRect(18, 18, 220, 44)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(sku || 'PRODUKT', 128, 40, 200)

  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
  ctx.fillText(title || 'Artikel', 128, 134, 212)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function createLoadedImageTexture(
  THREE: ThreeModule,
  img: HTMLImageElement,
  aspect: number,
) {
  const maxDim = 512
  const w = aspect >= 1 ? maxDim : Math.max(96, Math.round(maxDim * aspect))
  const h = aspect >= 1 ? Math.max(96, Math.round(maxDim / aspect)) : maxDim

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function buildWallsAndShelves(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
  onBoxesChanged?: (summary: ShelfProductSummary[]) => void,
) {
  const roomGroup = new THREE.Group()
  const staticSurfaceMeshes: Array<InstanceType<ThreeModule['Mesh']>> = []
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
      staticSurfaceMeshes.push(mesh)
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

  // 2. Retail Shelving Units (steel uprights + wood shelf planks + under-shelf LED strips)
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
  const ledChannelMat = new THREE.MeshStandardMaterial({
    color: '#27303f',
    roughness: 0.42,
    metalness: 0.65,
  })
  const ledDiffuserMat = new THREE.MeshStandardMaterial({
    color: '#fff7e8',
    emissive: '#ffdfa8',
    emissiveIntensity: 1.45,
    roughness: 0.25,
    metalness: 0.0,
  })
  const ledWashTex = createShelfLedWashTexture(THREE)
  const ledWashMat = new THREE.MeshBasicMaterial({
    map: ledWashTex,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  disposables.push(
    steelMat,
    shelfWoodTex,
    shelfWoodMat,
    ledChannelMat,
    ledDiffuserMat,
    ledWashTex,
    ledWashMat,
  )

  const postSize = 80
  const railH = 56
  const railD = 32
  const plankW = SHELF_BAY_W - postSize
  const plankD = SHELF_DEPTH - 24
  const ledChannelW = plankW - 140
  const ledChannelD = 36
  const ledChannelH = 14
  const ledStripW = ledChannelW - 36
  const ledStripD = 20
  const ledStripH = 8
  const ledWashH = 820

  const postGeo = new THREE.BoxGeometry(postSize, SHELF_HEIGHT, postSize)
  const plankGeo = new THREE.BoxGeometry(plankW, SHELF_BOARD_THICKNESS, plankD)
  const railGeo = new THREE.BoxGeometry(plankW, railH, railD)
  const sideBarGeo = new THREE.BoxGeometry(36, 48, SHELF_DEPTH - postSize)
  const ledChannelGeo = new THREE.BoxGeometry(ledChannelW, ledChannelH, ledChannelD)
  const ledStripGeo = new THREE.BoxGeometry(ledStripW, ledStripH, ledStripD)
  const ledWashGeo = new THREE.PlaneGeometry(plankW - 40, ledWashH)
  disposables.push(
    postGeo,
    plankGeo,
    railGeo,
    sideBarGeo,
    ledChannelGeo,
    ledStripGeo,
    ledWashGeo,
  )

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
        staticSurfaceMeshes.push(plank)

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

        // Subtle under-shelf LED strip (aluminum profile + warm-white diffuser + soft wall wash)
        const ledY = surfaceY - SHELF_BOARD_THICKNESS
        const ledZ = SHELF_DEPTH - railD - 68

        const ledChannel = new THREE.Mesh(ledChannelGeo, ledChannelMat)
        ledChannel.position.set(bayCenterX, ledY - ledChannelH / 2, ledZ)
        unitGroup.add(ledChannel)

        const ledStrip = new THREE.Mesh(ledStripGeo, ledDiffuserMat)
        ledStrip.position.set(
          bayCenterX,
          ledY - ledChannelH - ledStripH / 2 + 2,
          ledZ,
        )
        unitGroup.add(ledStrip)

        const ledWash = new THREE.Mesh(ledWashGeo, ledWashMat)
        ledWash.position.set(bayCenterX, ledY - ledWashH / 2, 12)
        unitGroup.add(ledWash)

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

    // Subtle warm under-shelf bounce lights for upper shelf levels
    const lightXs = unit.bays >= 4 ? [-totalW / 4, totalW / 4] : [0]
    for (let l = 1; l < SHELF_LEVEL_YS.length; l++) {
      const lightY = SHELF_LEVEL_YS[l] - SHELF_BOARD_THICKNESS - 160
      for (const lx of lightXs) {
        const shelfLight = new THREE.PointLight('#ffe2b4', 0.28, 5200, 0)
        shelfLight.position.set(lx, lightY, SHELF_DEPTH * 0.62)
        shelfLight.castShadow = false
        disposables.push(shelfLight)
        unitGroup.add(shelfLight)
      }
    }

    roomGroup.add(unitGroup)
  }

  // Sort slots in visual priority for automatic inventory placement
  const orderedSlots = [...shelfSlots].sort((a, b) => {
    const wallDiff = WALL_ORDER[a.wall] - WALL_ORDER[b.wall]
    if (wallDiff !== 0) return wallDiff
    const levelDiff = (LEVEL_ORDER[a.levelIndex] ?? 9) - (LEVEL_ORDER[b.levelIndex] ?? 9)
    if (levelDiff !== 0) return levelDiff
    if (a.wall === 'back') {
      return (BACK_BAY_ORDER[a.bayIndex] ?? a.bayIndex) - (BACK_BAY_ORDER[b.bayIndex] ?? b.bayIndex)
    }
    return a.bayIndex - b.bayIndex
  })

  // 3. Dynamic Inventory Boxes Container (populated gradually via iframe API)
  const boxesContainer = new THREE.Group()
  roomGroup.add(boxesContainer)

  let activeProducts: NormalizedProduct[] = []
  let activePlans: ProductPlan[] = []
  let activeSummary: ShelfProductSummary[] = []
  let renderGeneration = 0
  let disposed = false

  const productStates = new Map<string, ProductRenderState>()
  let cachedBoxSurfaceMeshes: Array<InstanceType<ThreeModule['Mesh']>> = []
  let surfacesDirty = false

  const pendingBoxTasks: PendingBoxTask[] = []
  let lastBoxSpawnMs = 0
  let lastSummaryEmitMs = 0
  let summaryDirty = false

  const imageCache = new Map<string, CachedProductImage>()
  const imageFetchQueue: string[] = []
  let activeImageFetches = 0

  const tapeMat = new THREE.MeshStandardMaterial({
    color: '#dec59d',
    roughness: 0.45,
    metalness: 0.04,
  })
  disposables.push(tapeMat)

  const disposeProductState = (productId: string) => {
    const st = productStates.get(productId)
    if (!st) return
    boxesContainer.remove(st.group)
    for (const d of st.disposables) {
      d.dispose()
    }
    productStates.delete(productId)
    surfacesDirty = true
  }

  const disposeAllProductStates = () => {
    for (const id of [...productStates.keys()]) {
      disposeProductState(id)
    }
    cachedBoxSurfaceMeshes = []
    surfacesDirty = false
  }

  const rebuildBoxSurfaceCache = () => {
    if (!surfacesDirty) return
    const next: Array<InstanceType<ThreeModule['Mesh']>> = []
    for (const st of productStates.values()) {
      for (const m of st.meshes) next.push(m)
    }
    cachedBoxSurfaceMeshes = next
    surfacesDirty = false
  }

  const buildSummaryFromPlans = (): ShelfProductSummary[] => {
    return activePlans.map((plan) => {
      const st = productStates.get(plan.product.id)
      return {
        id: plan.product.id,
        sku: plan.product.sku,
        name: plan.product.name,
        stock: plan.product.stock,
        renderedBoxes: st?.renderedBoxes ?? 0,
        slotIds: st ? [...st.placedSlotIds] : [],
        aspectRatio: Number(plan.dims.aspect.toFixed(3)),
      }
    })
  }

  const emitSummaryNow = () => {
    activeSummary = buildSummaryFromPlans()
    summaryDirty = false
    onBoxesChanged?.(activeSummary)
  }

  const pumpImageQueue = () => {
    if (disposed) return
    while (
      activeImageFetches < MAX_CONCURRENT_IMAGE_FETCHES &&
      imageFetchQueue.length > 0
    ) {
      const url = imageFetchQueue.shift()!
      const entry = imageCache.get(url)
      if (!entry || entry.status !== 'queued') continue

      if (typeof Image === 'undefined') {
        entry.status = 'error'
        const cbs = entry.callbacks.splice(0, entry.callbacks.length)
        for (const cb of cbs) cb()
        continue
      }

      entry.status = 'loading'
      activeImageFetches++

      const img = new Image()
      img.crossOrigin = 'anonymous'
      const finishFetch = () => {
        activeImageFetches = Math.max(0, activeImageFetches - 1)
        const cbs = entry.callbacks.splice(0, entry.callbacks.length)
        if (!disposed) {
          for (const cb of cbs) cb()
          pumpImageQueue()
        }
      }

      img.onload = () => {
        const natW = img.naturalWidth || 256
        const natH = img.naturalHeight || 256
        const aspect = clamp(natW / natH, 0.35, 2.4)
        entry.aspectRatio = aspect
        try {
          entry.texture = createLoadedImageTexture(THREE, img, aspect)
          entry.status = 'loaded'
        } catch {
          entry.status = 'error'
        }
        finishFetch()
      }

      img.onerror = () => {
        entry.status = 'error'
        finishFetch()
      }

      img.src = url
    }
  }

  const requestProductImage = (
    url: string,
    onSettled: () => void,
  ): CachedProductImage => {
    const existing = imageCache.get(url)
    if (existing) {
      if (existing.status === 'queued' || existing.status === 'loading') {
        existing.callbacks.push(onSettled)
      }
      return existing
    }

    const entry: CachedProductImage = {
      status: 'queued',
      aspectRatio: 1,
      texture: null,
      callbacks: [onSettled],
    }
    imageCache.set(url, entry)
    imageFetchQueue.push(url)
    pumpImageQueue()
    return entry
  }

  const normalizeProduct = (
    raw: ShelfProductInput,
    idx: number,
  ): NormalizedProduct => {
    const id =
      raw.id !== undefined && raw.id !== null && String(raw.id).trim() !== ''
        ? String(raw.id).trim()
        : raw.sku?.trim() || `product-${idx}`
    const imageUrlRaw = raw.image ?? raw.imageUrl ?? raw.picture
    const imageUrl =
      typeof imageUrlRaw === 'string' && imageUrlRaw.trim()
        ? imageUrlRaw.trim()
        : undefined
    const stock =
      typeof raw.stock === 'number' && Number.isFinite(raw.stock)
        ? Math.max(0, Math.floor(raw.stock))
        : 0
    const rawAspect =
      typeof raw.imageAspectRatio === 'number' &&
      Number.isFinite(raw.imageAspectRatio) &&
      raw.imageAspectRatio > 0
        ? raw.imageAspectRatio
        : 1

    const cachedAspect = imageUrl ? imageCache.get(imageUrl)?.aspectRatio : undefined

    return {
      id,
      sku: typeof raw.sku === 'string' ? raw.sku.trim() : undefined,
      name:
        typeof raw.name === 'string'
          ? raw.name.trim()
          : typeof raw.title === 'string'
            ? raw.title.trim()
            : undefined,
      imageUrl,
      stock,
      slotId:
        typeof raw.slotId === 'string' && raw.slotId.trim()
          ? raw.slotId.trim()
          : undefined,
      wall:
        raw.wall === 'back' || raw.wall === 'left' || raw.wall === 'right'
          ? raw.wall
          : undefined,
      aspectRatio: cachedAspect ?? clamp(rawAspect, 0.35, 2.4),
      boxColor:
        typeof raw.boxColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.boxColor)
          ? raw.boxColor
          : '#c49a6c',
      maxVisible:
        typeof raw.maxVisible === 'number' &&
        Number.isFinite(raw.maxVisible) &&
        raw.maxVisible >= 0
          ? Math.floor(raw.maxVisible)
          : undefined,
    }
  }

  const enqueueProductBoxes = (plan: ProductPlan, generation: number) => {
    const { product, dims, slots } = plan
    const { boxW, boxH, boxD } = dims
    let idxInProduct = 0

    for (const { slot, count } of slots) {
      if (count <= 0) continue

      const layout = computeSlotLayoutCapacity(slot, boxW, boxH, boxD)
      const { cols, rows, stacks, gapX, gapZ, gapY } = layout
      const cosY = Math.cos(slot.facingYaw)
      const sinY = Math.sin(slot.facingYaw)

      let placedInSlot = 0
      for (let row = 0; row < rows && placedInSlot < count; row++) {
        const zLocal =
          rows === 1 ? 40 : (row === 0 ? 1 : -1) * ((boxD + gapZ) / 2)

        for (let stack = 0; stack < stacks && placedInSlot < count; stack++) {
          const remainingInLayer = Math.min(cols, count - placedInSlot)
          const layerWidth =
            remainingInLayer * boxW + (remainingInLayer - 1) * gapX

          for (let col = 0; col < remainingInLayer; col++) {
            const xLocal = -layerWidth / 2 + boxW / 2 + col * (boxW + gapX)
            const yWorld = slot.surfaceY + stack * (boxH + gapY)

            const seed =
              ((idxInProduct + 1) * 73856093) ^
              (product.id.charCodeAt(0) * 19349663)
            const yawJitter = (((seed & 0xff) / 255) - 0.5) * 0.05

            pendingBoxTasks.push({
              generation,
              plan,
              slotId: slot.id,
              worldX: slot.centerX + xLocal * cosY + zLocal * sinY,
              worldY: yWorld,
              worldZ: slot.centerZ - xLocal * sinY + zLocal * cosY,
              yaw: slot.facingYaw + yawJitter,
            })

            placedInSlot++
            idxInProduct++
          }
        }
      }
    }
  }

  const createProductStateForPlan = (plan: ProductPlan): ProductRenderState => {
    const { product, dims } = plan
    const { boxW, boxH, boxD } = dims
    const group = new THREE.Group()
    boxesContainer.add(group)

    const cardboardMat = new THREE.MeshStandardMaterial({
      color: product.boxColor,
      roughness: 0.86,
      metalness: 0.02,
    })

    const cachedImg = product.imageUrl
      ? imageCache.get(product.imageUrl)
      : undefined
    let frontTex: InstanceType<ThreeModule['CanvasTexture']>
    let ownsFrontTex = false
    if (cachedImg?.status === 'loaded' && cachedImg.texture) {
      frontTex = cachedImg.texture
    } else {
      frontTex = createProductFallbackTexture(
        THREE,
        product.name ?? product.id,
        product.sku,
      )
      ownsFrontTex = true
    }

    const frontLabelMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      roughness: 0.5,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })

    const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD)
    const topTapeGeo = new THREE.BoxGeometry(
      boxW + 4,
      6,
      Math.min(150, boxD * 0.28),
    )
    const labelGeo = new THREE.PlaneGeometry(boxW * 0.92, boxH * 0.92)

    const stateDisposables: Disposable[] = [
      cardboardMat,
      frontLabelMat,
      boxGeo,
      topTapeGeo,
      labelGeo,
    ]
    if (ownsFrontTex) {
      stateDisposables.push(frontTex)
    }

    const st: ProductRenderState = {
      product,
      group,
      meshes: [],
      disposables: stateDisposables,
      boxGeo,
      topTapeGeo,
      labelGeo,
      cardboardMat,
      frontLabelMat,
      dims,
      placedSlotIds: [],
      renderedBoxes: 0,
    }
    productStates.set(product.id, st)
    return st
  }

  const spawnOneBoxFromTask = (task: PendingBoxTask) => {
    const { plan } = task
    const { product, dims } = plan
    const { boxH, boxD } = dims

    let st = productStates.get(product.id)
    if (!st) {
      st = createProductStateForPlan(plan)
    }

    const boxGroup = new THREE.Group()
    boxGroup.position.set(task.worldX, task.worldY, task.worldZ)
    boxGroup.rotation.y = task.yaw

    const mesh = new THREE.Mesh(st.boxGeo, st.cardboardMat)
    mesh.position.set(0, boxH / 2, 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    boxGroup.add(mesh)

    const topTape = new THREE.Mesh(st.topTapeGeo, tapeMat)
    topTape.position.set(0, boxH + 2, 0)
    boxGroup.add(topTape)

    const frontLabel = new THREE.Mesh(st.labelGeo, st.frontLabelMat)
    frontLabel.position.set(0, boxH / 2, boxD / 2 + 2)
    boxGroup.add(frontLabel)

    markFocusSharp(boxGroup)
    st.group.add(boxGroup)
    st.meshes.push(mesh)
    st.renderedBoxes++
    if (!st.placedSlotIds.includes(task.slotId)) {
      st.placedSlotIds.push(task.slotId)
    }

    surfacesDirty = true
    summaryDirty = true
  }

  const scheduleFullShelfSync = () => {
    renderGeneration++
    const currentGen = renderGeneration
    pendingBoxTasks.length = 0
    imageFetchQueue.length = 0
    disposeAllProductStates()

    if (activeProducts.length === 0) {
      activePlans = []
      emitSummaryNow()
      return
    }

    const usedSlotIds = new Set<string>()
    const plans: ProductPlan[] = []

    const findNextAvailableSlot = (wall?: ShelfWallId): ShelfSlot | undefined => {
      if (wall) {
        const wallSlot = orderedSlots.find(
          (s) => s.wall === wall && !usedSlotIds.has(s.id),
        )
        if (wallSlot) return wallSlot
      }
      return orderedSlots.find((s) => !usedSlotIds.has(s.id))
    }

    // Pass 1: Allocate primary shelf slot per in-stock product (skipping products beyond shelf capacity)
    for (const p of activeProducts) {
      const cachedAspect = p.imageUrl
        ? imageCache.get(p.imageUrl)?.aspectRatio
        : undefined
      if (cachedAspect !== undefined) {
        p.aspectRatio = cachedAspect
      }

      const dims = computeBoxDimensions(p.aspectRatio)
      const targetCount =
        p.maxVisible !== undefined
          ? Math.min(p.stock, p.maxVisible)
          : Math.min(p.stock, 48)

      const assignedSlots: Array<{ slot: ShelfSlot; count: number }> = []
      if (targetCount > 0) {
        const explicitSlot = p.slotId
          ? shelfSlots.find((s) => s.id === p.slotId && !usedSlotIds.has(s.id))
          : undefined
        const chosenSlot = explicitSlot ?? findNextAvailableSlot(p.wall)
        if (chosenSlot) {
          usedSlotIds.add(chosenSlot.id)
          const layout = computeSlotLayoutCapacity(
            chosenSlot,
            dims.boxW,
            dims.boxH,
            dims.boxD,
          )
          assignedSlots.push({
            slot: chosenSlot,
            count: Math.min(targetCount, layout.capacity),
          })
        }
      }

      plans.push({
        product: p,
        dims,
        slots: assignedSlots,
        targetCount,
      })
    }

    // Pass 2: Overflow remaining stock into spare empty slots if any remain
    let allocatedMore = true
    while (allocatedMore) {
      allocatedMore = false
      for (const plan of plans) {
        const placedSoFar = plan.slots.reduce((acc, s) => acc + s.count, 0)
        const remaining = plan.targetCount - placedSoFar
        if (remaining <= 0 || plan.product.slotId) continue
        const extraSlot = findNextAvailableSlot(plan.product.wall)
        if (!extraSlot) continue
        usedSlotIds.add(extraSlot.id)
        const layout = computeSlotLayoutCapacity(
          extraSlot,
          plan.dims.boxW,
          plan.dims.boxH,
          plan.dims.boxD,
        )
        plan.slots.push({
          slot: extraSlot,
          count: Math.min(remaining, layout.capacity),
        })
        allocatedMore = true
      }
    }

    activePlans = plans

    // Pass 3: Enqueue images (max 3 concurrent) & box spawn tasks (drip-fed in update())
    for (const plan of plans) {
      if (plan.slots.length === 0) continue

      const { product } = plan
      if (!product.imageUrl) {
        enqueueProductBoxes(plan, currentGen)
        continue
      }

      const cached = requestProductImage(product.imageUrl, () => {
        if (disposed || currentGen !== renderGeneration) return
        const entry = imageCache.get(product.imageUrl!)
        if (entry?.status === 'loaded') {
          product.aspectRatio = entry.aspectRatio
          plan.dims = computeBoxDimensions(entry.aspectRatio)
          // Recompute slot box counts for the true image aspect ratio
          let remaining = plan.targetCount
          for (const slotAlloc of plan.slots) {
            const layout = computeSlotLayoutCapacity(
              slotAlloc.slot,
              plan.dims.boxW,
              plan.dims.boxH,
              plan.dims.boxD,
            )
            slotAlloc.count = Math.min(remaining, layout.capacity)
            remaining -= slotAlloc.count
          }
        }
        enqueueProductBoxes(plan, currentGen)
      })

      if (cached.status === 'loaded' || cached.status === 'error') {
        if (cached.status === 'loaded') {
          product.aspectRatio = cached.aspectRatio
          plan.dims = computeBoxDimensions(cached.aspectRatio)
        }
        enqueueProductBoxes(plan, currentGen)
      }
    }

    activeSummary = buildSummaryFromPlans()
    if (pendingBoxTasks.length === 0 && activeImageFetches === 0) {
      emitSummaryNow()
    }
  }

  const update = (nowMs: number) => {
    if (disposed || pendingBoxTasks.length === 0) {
      if (summaryDirty && nowMs - lastSummaryEmitMs >= SUMMARY_EMIT_INTERVAL_MS) {
        lastSummaryEmitMs = nowMs
        emitSummaryNow()
      }
      return
    }

    if (nowMs - lastBoxSpawnMs < BOX_SPAWN_INTERVAL_MS) {
      return
    }

    while (pendingBoxTasks.length > 0) {
      const task = pendingBoxTasks.shift()!
      if (task.generation !== renderGeneration) continue
      spawnOneBoxFromTask(task)
      lastBoxSpawnMs = nowMs
      break
    }

    if (
      summaryDirty &&
      (pendingBoxTasks.length === 0 ||
        nowMs - lastSummaryEmitMs >= SUMMARY_EMIT_INTERVAL_MS)
    ) {
      lastSummaryEmitMs = nowMs
      emitSummaryNow()
    }
  }

  const setProducts = (products: ShelfProductInput[]): ShelfProductSummary[] => {
    activeProducts = products.map((p, idx) => normalizeProduct(p, idx))
    scheduleFullShelfSync()
    return activeSummary
  }

  const upsertProduct = (
    raw: Partial<ShelfProductInput> & { id: string | number },
  ): ShelfProductSummary[] => {
    const idStr = String(raw.id).trim()
    if (!idStr) return activeSummary
    const idx = activeProducts.findIndex((p) => p.id === idStr)
    if (idx >= 0) {
      const prev = activeProducts[idx]
      const merged: ShelfProductInput = {
        id: prev.id,
        sku: raw.sku ?? prev.sku,
        name: raw.name ?? raw.title ?? prev.name,
        image: raw.image ?? raw.imageUrl ?? raw.picture ?? prev.imageUrl,
        stock: raw.stock !== undefined ? raw.stock : prev.stock,
        slotId: raw.slotId ?? prev.slotId,
        wall: raw.wall ?? prev.wall,
        imageAspectRatio: raw.imageAspectRatio ?? prev.aspectRatio,
        boxColor: raw.boxColor ?? prev.boxColor,
        maxVisible: raw.maxVisible ?? prev.maxVisible,
      }
      const nextProd = normalizeProduct(merged, idx)
      activeProducts[idx] = nextProd

      // Fast path: if this product already has an assigned plan and same image/slot/wall,
      // rebuild ONLY this single product instead of the entire room!
      const existingPlan = activePlans.find((pl) => pl.product.id === idStr)
      if (
        existingPlan &&
        existingPlan.slots.length > 0 &&
        prev.imageUrl === nextProd.imageUrl &&
        prev.slotId === nextProd.slotId &&
        prev.wall === nextProd.wall &&
        prev.boxColor === nextProd.boxColor &&
        existingPlan.slots.length === 1
      ) {
        const slot = existingPlan.slots[0].slot
        const dims = computeBoxDimensions(nextProd.aspectRatio)
        const targetCount =
          nextProd.maxVisible !== undefined
            ? Math.min(nextProd.stock, nextProd.maxVisible)
            : Math.min(nextProd.stock, 48)
        const layout = computeSlotLayoutCapacity(slot, dims.boxW, dims.boxH, dims.boxD)

        if (targetCount > 0 && targetCount <= layout.capacity) {
          existingPlan.product = nextProd
          existingPlan.dims = dims
          existingPlan.targetCount = targetCount
          existingPlan.slots[0].count = targetCount

          // Remove any pending tasks for this product and rebuild just its boxes
          for (let i = pendingBoxTasks.length - 1; i >= 0; i--) {
            if (pendingBoxTasks[i].plan.product.id === idStr) {
              pendingBoxTasks.splice(i, 1)
            }
          }
          disposeProductState(idStr)
          enqueueProductBoxes(existingPlan, renderGeneration)
          activeSummary = buildSummaryFromPlans()
          return activeSummary
        }
      }
    } else {
      activeProducts.push(
        normalizeProduct({ stock: 0, ...raw, id: idStr }, activeProducts.length),
      )
    }

    scheduleFullShelfSync()
    return activeSummary
  }

  const clearProducts = () => {
    activeProducts = []
    scheduleFullShelfSync()
  }

  markFocusSharp(roomGroup)
  webglScene.add(roomGroup)

  disposables.push({
    dispose: () => {
      disposed = true
      pendingBoxTasks.length = 0
      imageFetchQueue.length = 0
      disposeAllProductStates()
      for (const cached of imageCache.values()) {
        cached.texture?.dispose()
      }
      imageCache.clear()
    },
  })

  return {
    roomGroup,
    wallAndShelfSurfaceMeshes: staticSurfaceMeshes,
    getBoxSurfaceMeshes: () => {
      rebuildBoxSurfaceCache()
      return cachedBoxSurfaceMeshes
    },
    shelfSlots,
    update,
    setProducts,
    upsertProduct,
    clearProducts,
    getSummary: () => activeSummary,
  }
}
