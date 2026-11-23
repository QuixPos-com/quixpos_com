import { useEffect, useRef, useState } from 'preact/hooks'
import { Link } from '../components/Router'
import '../threeD.css'

interface TabletSpec {
  id: string
  title: string
  subtitle: string
  url: string
  x: number
  cssW: number
  cssH: number
  physicalScale: number
  bezelPad: number
  bottomClearance: number
  crop?: {
    x: number
    y: number
    w: number
    h: number
  }
}

// Scale: 1 world unit = 0.25 mm (4000 units = 1 meter).
// 22" 4:3 (1600x1200 CSS px @ scale 1.1176 -> 1788x1341 units, 447x335mm, 22.0" diag)
// 12" 16:10 (1024x640 CSS px @ scale 1.0 -> 256x160mm, 11.9" diag)
// 8" 10:16 portrait (432x688 CSS px @ scale 1.0 -> 108x172mm, 8.0" diag)
const TABLET_DEPTH = 28

const TABLE_W = 7000 // 1.75m
const TABLE_D = 3200 // 0.80m
const TABLE_TOP_Y = 3040 // 0.76m
const TABLE_THICKNESS = 140

const EYE_HEIGHT = 4800 // 1.20m
const WALK_SPEED = 11200 // 2.8 m/s
const PLAYER_RADIUS = 650
const ARENA_HALF = 72000 // 18m

const SPAWN_POS = { x: 0, y: EYE_HEIGHT, z: 4400 }
const SPAWN_YAW = 0
const SPAWN_PITCH = -0.25

const TABLETS: TabletSpec[] = [
  {
    id: 'dash-left',
    title: 'Artikelverwaltung',
    subtitle: 'dashdemo.quixpos.com',
    url: 'https://dashdemo.quixpos.com',
    x: -2150,
    cssW: 1600,
    cssH: 1200,
    physicalScale: 1.1176,
    bezelPad: 42,
    bottomClearance: 160,
  },
  {
    id: 'pos-center',
    title: 'POS',
    subtitle: 'pos.quixpos.com',
    url: 'https://pos.quixpos.com',
    x: 74,
    cssW: 1024,
    cssH: 640,
    physicalScale: 1,
    bezelPad: 36,
    bottomClearance: 727,
  },
  {
    id: 'pos-vertical',
    title: 'Kundendisplay',
    subtitle: 'posdemo.quixpos.com',
    url: 'https://posdemo.quixpos.com',
    x: 1186,
    cssW: 432,
    cssH: 688,
    physicalScale: 1,
    bezelPad: 28,
    bottomClearance: 127,
  },
  {
    id: 'sumup-far-right',
    title: 'SumUp Virtual Solo',
    subtitle: 'virtual-solo.sumup.com',
    url: 'https://virtual-solo.sumup.com',
    x: 1684,
    cssW: 1024,
    cssH: 640,
    physicalScale: 0.85,
    bezelPad: 24,
    bottomClearance: 380,
    crop: {
      x: 304,
      y: 158,
      w: 400,
      h: 465,
    },
  },
]

function createFloorTexture(THREE: typeof import('three')) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#e7eef4'
  ctx.fillRect(0, 0, 512, 512)

  // Subtle architectural tile seams
  ctx.strokeStyle = 'rgba(11, 18, 32, 0.08)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 510, 510)

  ctx.strokeStyle = 'rgba(11, 18, 32, 0.035)'
  ctx.lineWidth = 1
  for (let i = 128; i < 512; i += 128) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 512)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(512, i)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(44, 44)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createWoodTexture(THREE: typeof import('three')) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#c89f72'
  ctx.fillRect(0, 0, 512, 512)

  for (let y = 0; y < 512; y += 4) {
    const shade = Math.sin(y * 0.09) * 10 + Math.cos(y * 0.27) * 6
    ctx.fillStyle = shade > 0 ? 'rgba(255, 240, 220, 0.06)' : 'rgba(92, 56, 28, 0.07)'
    ctx.fillRect(0, y, 512, 3)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createNameplateTexture(
  THREE: typeof import('three'),
  title: string,
  subtitle: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, 512, 128)

  ctx.strokeStyle = '#1ec9a8'
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, 504, 120)

  ctx.fillStyle = '#f7fafc'
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, 224, 46)

  ctx.fillStyle = '#1ec9a8'
  ctx.font = '500 22px system-ui, -apple-system, sans-serif'
  ctx.fillText(subtitle, 224, 88)

  // Magnifying glass (loupe) icon indicating click-to-focus
  ctx.save()
  ctx.fillStyle = 'rgba(30, 201, 168, 0.14)'
  ctx.strokeStyle = '#1ec9a8'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(446, 54, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(459, 67)
  ctx.lineTo(476, 84)
  ctx.stroke()
  ctx.restore()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createCashButtonTexture(
  THREE: typeof import('three'),
  label: string,
  accent: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 112
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, 256, 112)

  ctx.strokeStyle = accent
  ctx.lineWidth = 6
  ctx.strokeRect(5, 5, 246, 102)

  ctx.fillStyle = accent
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 128, 56)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createPrinterFrontTexture(THREE: typeof import('three')) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#181d26'
  ctx.fillRect(0, 0, 256, 128)

  ctx.fillStyle = '#9ca3af'
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('EPSON', 128, 44)

  ctx.fillStyle = '#e5e7eb'
  ctx.font = '600 22px system-ui, -apple-system, sans-serif'
  ctx.fillText('TM-m30III', 128, 84)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createReceiptTexture(THREE: typeof import('three')) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f9fafb'
  ctx.fillRect(0, 0, 256, 256)

  ctx.fillStyle = '#111827'
  ctx.font = 'bold 22px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('QuixPOS Beleg', 128, 34)

  ctx.font = '16px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('Espresso       2,80 EUR', 18, 76)
  ctx.fillText('Croissant      3,20 EUR', 18, 104)
  ctx.fillText('Orangensaft    3,50 EUR', 18, 132)
  ctx.fillText('-----------------------', 18, 158)
  ctx.font = 'bold 18px monospace'
  ctx.fillText('SUMME          9,50 EUR', 18, 186)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#4b5563'
  ctx.fillText('TSE Signatur: OK', 18, 222)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createZebraBadgeTexture(THREE: typeof import('three')) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#2b313a'
  ctx.fillRect(0, 0, 512, 256)

  ctx.strokeStyle = '#3f4754'
  ctx.lineWidth = 4
  ctx.strokeRect(4, 4, 504, 248)

  // Left white circular power button
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath()
  ctx.arc(82, 86, 30, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(82, 88, 12, -Math.PI * 0.28, Math.PI * 1.28)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(82, 72)
  ctx.lineTo(82, 86)
  ctx.stroke()

  // NFC icon below power button
  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = 3
  ctx.strokeRect(86, 166, 20, 30)
  ctx.beginPath()
  ctx.arc(76, 180, 10, -0.9, 0.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(76, 180, 17, -0.9, 0.9)
  ctx.stroke()

  // 5 status indicator icons across top row
  const statusColors = ['#10b981', '#6b7280', '#6b7280', '#6b7280', '#10b981']
  for (let i = 0; i < 5; i++) {
    const sx = 188 + i * 58
    ctx.fillStyle = statusColors[i]
    ctx.fillRect(sx - 10, 42, 20, 20)
  }

  // 3 white pill buttons (Pause, Feed, Cancel)
  const pillLabels = ['||', '•>', 'X']
  for (let i = 0; i < 3; i++) {
    const px = 176 + i * 94
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.roundRect(px, 98, 76, 44, 22)
    ctx.fill()

    ctx.fillStyle = '#111827'
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(pillLabels[i], px + 38, 121)
  }

  // ZEBRA ZD420 branding
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('ZEBRA', 238, 194)

  ctx.fillStyle = '#d1d5db'
  ctx.font = '600 22px system-ui, -apple-system, sans-serif'
  ctx.fillText('ZD420', 362, 192)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createShippingLabelTexture(THREE: typeof import('three')) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)

  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 4
  ctx.strokeRect(10, 10, 236, 236)

  ctx.fillStyle = '#111827'
  ctx.fillRect(10, 10, 236, 42)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('PAKETVERSAND', 20, 38)

  ctx.fillStyle = '#111827'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('Von: QuixPOS GmbH', 20, 78)
  ctx.font = '15px monospace'
  ctx.fillText('An:  Musterkunde', 20, 104)
  ctx.fillText('     10115 Berlin', 20, 126)

  // Shipping barcode stripes
  const widths = [4, 2, 6, 3, 2, 5, 4, 2, 6, 2, 4, 5, 3, 2, 6, 4, 3, 5, 2, 4, 6, 2, 3, 5]
  let bx = 24
  for (let i = 0; i < widths.length && bx < 228; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(bx, 152, widths[i], 68)
    }
    bx += widths[i] + 3
  }

  ctx.font = '13px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('0034 0434 1610 9281 42', 128, 236)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function ThreeDRoute() {
  const stageRef = useRef<HTMLDivElement>(null)
  const cssLayerRef = useRef<HTMLDivElement>(null)
  const webglCanvasRef = useRef<HTMLCanvasElement>(null)
  const moveStickRef = useRef<HTMLDivElement>(null)
  const moveKnobRef = useRef<HTMLDivElement>(null)
  const aimStickRef = useRef<HTMLDivElement>(null)
  const aimKnobRef = useRef<HTMLDivElement>(null)

  const [isLocked, setIsLocked] = useState(false)
  const [isTouchMode, setIsTouchMode] = useState(false)
  const [targetedTablet, setTargetedTablet] = useState<{
    title: string
    kind: 'label' | 'screen' | 'drawer'
  } | null>(null)
  const [focusedTabletId, setFocusedTabletId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const resetViewRef = useRef<(() => void) | null>(null)
  const unlockFocusRef = useRef<(() => void) | null>(null)
  const toggleDrawerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const stageEl = stageRef.current
    const cssLayerEl = cssLayerRef.current
    const canvasEl = webglCanvasRef.current
    if (!stageEl || !cssLayerEl || !canvasEl) return

    const touchCapable =
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    setIsTouchMode(touchCapable)

    let disposed = false
    let animId = 0

    let cleanupFns: Array<() => void> = []

    Promise.all([
      import('three'),
      import('three/examples/jsm/renderers/CSS3DRenderer.js'),
    ]).then(([THREE, { CSS3DRenderer, CSS3DObject }]) => {
      if (disposed) return

      const disposables: Array<{ dispose: () => void }> = []

      // 1. Renderers (on touch/mobile, CSS3D sits above opaque WebGL so cross-origin iframes composite reliably)
      const webglRenderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
        alpha: !touchCapable,
        powerPreference: 'high-performance',
      })
      webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      webglRenderer.setSize(stageEl.clientWidth, stageEl.clientHeight)
      webglRenderer.shadowMap.enabled = true
      webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap
      webglRenderer.outputColorSpace = THREE.SRGBColorSpace

      const cssRenderer = new CSS3DRenderer({ element: cssLayerEl })
      cssRenderer.setSize(stageEl.clientWidth, stageEl.clientHeight)

      // 2. Scenes & Camera
      const webglScene = new THREE.Scene()
      webglScene.background = new THREE.Color('#dce8f0')
      webglScene.fog = new THREE.Fog('#dce8f0', 48000, 150000)

      const cssScene = new THREE.Scene()

      const camera = new THREE.PerspectiveCamera(
        58,
        stageEl.clientWidth / Math.max(1, stageEl.clientHeight),
        20,
        220000,
      )
      camera.rotation.order = 'YXZ'
      camera.position.set(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z)
      camera.rotation.set(SPAWN_PITCH, SPAWN_YAW, 0, 'YXZ')

      let yaw = SPAWN_YAW
      let pitch = SPAWN_PITCH

      resetViewRef.current = () => {
        setFocused(null)
        cameraTween = null
        camera.position.set(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z)
        yaw = SPAWN_YAW
        pitch = SPAWN_PITCH
        camera.rotation.set(pitch, yaw, 0, 'YXZ')
      }

      // 3. Lighting
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

      // 4. Flat Area Floor
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

      // 5. Table
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

      // 6. Three 12" Tablets + Angled Stands + Real CSS3D Iframes
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
      })

      const camDotGeo = new THREE.CircleGeometry(7, 16)
      const vesaArmGeo = new THREE.BoxGeometry(110, 70, 96)
      const vesaPlateGeo = new THREE.BoxGeometry(160, 120, 20)

      disposables.push(
        shellMat,
        bezelMat,
        standMat,
        cutoutMat,
        camDotMat,
        camDotGeo,
        vesaArmGeo,
        vesaPlateGeo,
      )

      interface TabletInstance {
        spec: TabletSpec
        cutoutMesh: InstanceType<typeof THREE.Mesh>
        plateMesh: InstanceType<typeof THREE.Mesh>
        cssObject: InstanceType<typeof CSS3DObject>
        wrapperEl: HTMLDivElement
        iframeEl: HTMLIFrameElement
        tabletW: number
        tabletH: number
        centerY: number
      }

      const tabletInstances: TabletInstance[] = []
      const raycastTargets: Array<InstanceType<typeof THREE.Mesh>> = []
      const plateTargets: Array<InstanceType<typeof THREE.Mesh>> = []
      const drawerTargets: Array<InstanceType<typeof THREE.Mesh>> = []

      const TILT_ANGLE = -0.36 // ~20.6 degrees tilted back toward viewer
      const TABLET_Z = 920 // Near front edge of the table (front edge at +1600)
      const DRAWER_H = 380

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
        const cutoutGeo = new THREE.PlaneGeometry(screenW, screenH)
        const footW = Math.min(580, Math.max(280, Math.round(tabletW * 0.65)))
        const baseFootGeo = new THREE.BoxGeometry(footW, 32, 340)
        const neckH = Math.max(240, Math.round(centerY - standBaseY))
        const neckGeo = new THREE.BoxGeometry(110, neckH, 64)
        const nameplateW = Math.min(760, Math.max(400, tabletW - 20))
        const nameplateD = Math.max(100, Math.round(nameplateW * 0.25))
        const nameplateGeo = new THREE.BoxGeometry(nameplateW, 24, nameplateD)

        disposables.push(
          backShellGeo,
          bezelTopGeo,
          bezelSideGeo,
          cutoutGeo,
          baseFootGeo,
          neckGeo,
          nameplateGeo,
        )

        // Stand on tabletop (or on top of cash drawer for center POS)
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

        // Desk nameplate in front of tablet
        const plateTex = createNameplateTexture(THREE, spec.title, spec.subtitle)
        const plateMat = new THREE.MeshStandardMaterial({
          map: plateTex,
          roughness: 0.4,
          metalness: 0.2,
        })
        disposables.push(plateTex, plateMat)
        const plate = new THREE.Mesh(nameplateGeo, [
          standMat,
          standMat,
          plateMat,
          standMat,
          standMat,
          standMat,
        ])
        plate.position.set(spec.x, TABLE_TOP_Y + 12, TABLET_Z + 440)
        plate.castShadow = true
        plate.receiveShadow = true
        plate.userData = {
          tabletTitle: spec.title,
          tabletId: spec.id,
          kind: 'label',
        }
        webglScene.add(plate)
        plateTargets.push(plate)
        raycastTargets.push(plate)

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
          plateMesh: plate,
          cssObject,
          wrapperEl,
          iframeEl,
          tabletW,
          tabletH,
          centerY,
        })
        raycastTargets.push(cutoutMesh)
      }

      // 6b. Cash Drawer mounted under the table beneath center POS
      const DRAWER_X = 74
      const DRAWER_Z = 980
      const DRAWER_W = 1360
      const DRAWER_D = 1120
      const DRAWER_OPEN_OFFSET = 820

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
      drawerTargets.push(cashBtnMesh, trayFront)
      raycastTargets.push(cashBtnMesh, trayFront)

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

      // 6c. Epson TM-m30III Thermal Receipt Printer to the right of SumUp Virtual Solo
      const PRINTER_SIZE = 340
      const PRINTER_X = 2118
      const PRINTER_Z = 900

      const printerBodyMat = new THREE.MeshStandardMaterial({
        color: '#1b2029',
        roughness: 0.36,
        metalness: 0.35,
      })
      const printerTopMat = new THREE.MeshStandardMaterial({
        color: '#10141b',
        roughness: 0.28,
        metalness: 0.25,
      })
      const printerBadgeTex = createPrinterFrontTexture(THREE)
      const printerBadgeMat = new THREE.MeshStandardMaterial({
        map: printerBadgeTex,
        roughness: 0.35,
        metalness: 0.2,
      })
      const receiptTex = createReceiptTexture(THREE)
      const receiptMat = new THREE.MeshStandardMaterial({
        map: receiptTex,
        roughness: 0.85,
        side: THREE.DoubleSide,
      })
      const printerPowerLedMat = new THREE.MeshStandardMaterial({
        color: '#1ec9a8',
        emissive: '#1ec9a8',
        emissiveIntensity: 0.9,
      })
      const printerNetLedMat = new THREE.MeshStandardMaterial({
        color: '#3b82f6',
        emissive: '#3b82f6',
        emissiveIntensity: 0.8,
      })

      const printerBoxGeo = new THREE.BoxGeometry(PRINTER_SIZE, PRINTER_SIZE, PRINTER_SIZE)
      const printerTopCapGeo = new THREE.BoxGeometry(PRINTER_SIZE - 28, 12, PRINTER_SIZE - 28)
      const printerSlotGeo = new THREE.BoxGeometry(220, 18, 28)
      const printerBadgeGeo = new THREE.PlaneGeometry(180, 90)
      const receiptGeo = new THREE.PlaneGeometry(190, 180)
      const ledGeo = new THREE.CircleGeometry(7, 14)

      disposables.push(
        printerBodyMat,
        printerTopMat,
        printerBadgeTex,
        printerBadgeMat,
        receiptTex,
        receiptMat,
        printerPowerLedMat,
        printerNetLedMat,
        printerBoxGeo,
        printerTopCapGeo,
        printerSlotGeo,
        printerBadgeGeo,
        receiptGeo,
        ledGeo,
      )

      const printerGroup = new THREE.Group()
      printerGroup.position.set(PRINTER_X, TABLE_TOP_Y, PRINTER_Z)
      webglScene.add(printerGroup)

      const printerBody = new THREE.Mesh(printerBoxGeo, printerBodyMat)
      printerBody.position.set(0, PRINTER_SIZE / 2, 0)
      printerBody.castShadow = true
      printerBody.receiveShadow = true
      printerGroup.add(printerBody)

      const printerCap = new THREE.Mesh(printerTopCapGeo, printerTopMat)
      printerCap.position.set(0, PRINTER_SIZE + 3, 0)
      printerGroup.add(printerCap)

      const printerSlot = new THREE.Mesh(printerSlotGeo, drawerTrayMat)
      printerSlot.position.set(0, PRINTER_SIZE - 22, PRINTER_SIZE / 2 - 12)
      printerGroup.add(printerSlot)

      const receiptMesh = new THREE.Mesh(receiptGeo, receiptMat)
      receiptMesh.position.set(0, PRINTER_SIZE - 8, PRINTER_SIZE / 2 + 52)
      receiptMesh.rotation.x = -0.95
      receiptMesh.castShadow = true
      printerGroup.add(receiptMesh)

      const printerBadge = new THREE.Mesh(printerBadgeGeo, printerBadgeMat)
      printerBadge.position.set(0, PRINTER_SIZE * 0.42, PRINTER_SIZE / 2 + 2)
      printerGroup.add(printerBadge)

      const powerLed = new THREE.Mesh(ledGeo, printerPowerLedMat)
      powerLed.position.set(-112, PRINTER_SIZE - 38, PRINTER_SIZE / 2 + 2)
      printerGroup.add(powerLed)

      const netLed = new THREE.Mesh(ledGeo, printerNetLedMat)
      netLed.position.set(-84, PRINTER_SIZE - 38, PRINTER_SIZE / 2 + 2)
      printerGroup.add(netLed)

      // 6d. Zebra ZD420 Shipping Label Printer right of the 22" big monitor
      const ZEBRA_X = -844
      const ZEBRA_Z = 780
      const ZEBRA_W = 540
      const ZEBRA_D = 700

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
      const zebraBadgeTex = createZebraBadgeTexture(THREE)
      const zebraBadgeMat = new THREE.MeshStandardMaterial({
        map: zebraBadgeTex,
        roughness: 0.35,
      })
      const shippingLabelTex = createShippingLabelTexture(THREE)
      const shippingLabelMat = new THREE.MeshStandardMaterial({
        map: shippingLabelTex,
        roughness: 0.85,
        side: THREE.DoubleSide,
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
      const shippingLabelGeo = new THREE.PlaneGeometry(310, 250)

      disposables.push(
        zebraBodyMat,
        zebraPlinthMat,
        zebraLatchMat,
        zebraWindowMat,
        zebraRollMat,
        zebraBadgeTex,
        zebraBadgeMat,
        shippingLabelTex,
        shippingLabelMat,
        zebraShellGeo,
        zebraPlinthGeo,
        zebraLatchGeo,
        zebraHingeGeo,
        zebraWindowGeo,
        zebraRollGeo,
        zebraSlotGeo,
        zebraSeamGeo,
        zebraBadgeGeo,
        shippingLabelGeo,
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
      for (const lx of [-(ZEBRA_W / 2 + 2), ZEBRA_W / 2 + 2]) {
        const latch = new THREE.Mesh(zebraLatchGeo, zebraLatchMat)
        latch.position.set(lx, 185, 130)
        latch.castShadow = true
        zebraGroup.add(latch)

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

      // Front label exit slot + emerging shipping label
      const zebraSlot = new THREE.Mesh(zebraSlotGeo, drawerTrayMat)
      zebraSlot.position.set(0, 196, 338)
      zebraGroup.add(zebraSlot)

      const shippingLabelMesh = new THREE.Mesh(shippingLabelGeo, shippingLabelMat)
      shippingLabelMesh.position.set(0, 146, 412)
      shippingLabelMesh.rotation.x = -0.95
      shippingLabelMesh.castShadow = true
      zebraGroup.add(shippingLabelMesh)

      // 6e. Inateck BCST-70 Barcode Scanner right of the Epson TM-m30III printer
      const SCANNER_X = 2580
      const SCANNER_Z = 920

      const scannerGreyMat = new THREE.MeshStandardMaterial({
        color: '#c4c8ce',
        roughness: 0.45,
        metalness: 0.08,
      })
      const scannerRubberMat = new THREE.MeshStandardMaterial({
        color: '#1b1f26',
        roughness: 0.62,
        metalness: 0.08,
      })
      const scannerLensMat = new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.1,
        metalness: 0.4,
      })
      const scannerBeamMat = new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#ef4444',
        emissiveIntensity: 0.9,
      })

      const footOvalGeo = new THREE.CylinderGeometry(72, 78, 34, 24)
      const lowerGripGeo = new THREE.CylinderGeometry(52, 60, 225, 22)
      const rearSpineGeo = new THREE.BoxGeometry(68, 225, 52)
      const upperNeckGeo = new THREE.CylinderGeometry(64, 52, 220, 22)
      const triggerGeo = new THREE.BoxGeometry(44, 98, 56)
      const triggerBumpGeo = new THREE.CylinderGeometry(24, 24, 44, 16)
      const headCoreGeo = new THREE.BoxGeometry(168, 122, 160)
      const hoodRibGeo = new THREE.BoxGeometry(232, 26, 165)
      const scanLensGeo = new THREE.PlaneGeometry(156, 94)
      const scanBeamGeo = new THREE.BoxGeometry(106, 5, 4)

      // Rounded oval hood with recessed front cavity (matching BCST-70 front mouth)
      const hoodOuter = new THREE.Shape()
      hoodOuter.absellipse(0, 0, 108, 74, 0, Math.PI * 2, false, 0)
      const hoodHole = new THREE.Path()
      hoodHole.absellipse(0, 0, 76, 44, 0, Math.PI * 2, true, 0)
      hoodOuter.holes.push(hoodHole)

      const hoodGeo = new THREE.ExtrudeGeometry(hoodOuter, {
        depth: 130,
        bevelEnabled: true,
        bevelThickness: 14,
        bevelSize: 12,
        bevelSegments: 4,
      })

      disposables.push(
        scannerGreyMat,
        scannerRubberMat,
        scannerLensMat,
        scannerBeamMat,
        footOvalGeo,
        lowerGripGeo,
        rearSpineGeo,
        upperNeckGeo,
        triggerGeo,
        triggerBumpGeo,
        headCoreGeo,
        hoodRibGeo,
        scanLensGeo,
        scanBeamGeo,
        hoodGeo,
      )

      const scannerGroup = new THREE.Group()
      scannerGroup.position.set(SCANNER_X, TABLE_TOP_Y, SCANNER_Z)
      scannerGroup.rotation.y = -0.36
      webglScene.add(scannerGroup)

      const sFoot = new THREE.Mesh(footOvalGeo, scannerRubberMat)
      sFoot.scale.set(0.92, 1, 1.38)
      sFoot.position.set(0, 17, 16)
      sFoot.castShadow = true
      sFoot.receiveShadow = true
      scannerGroup.add(sFoot)

      const sLowerGrip = new THREE.Mesh(lowerGripGeo, scannerRubberMat)
      sLowerGrip.scale.set(0.9, 1, 1.15)
      sLowerGrip.position.set(0, 136, 0)
      sLowerGrip.rotation.x = 0.08
      sLowerGrip.castShadow = true
      scannerGroup.add(sLowerGrip)

      const sRearSpine = new THREE.Mesh(rearSpineGeo, scannerGreyMat)
      sRearSpine.position.set(0, 148, -32)
      sRearSpine.rotation.x = 0.08
      sRearSpine.castShadow = true
      scannerGroup.add(sRearSpine)

      const sUpperNeck = new THREE.Mesh(upperNeckGeo, scannerGreyMat)
      sUpperNeck.scale.set(0.95, 1, 1.24)
      sUpperNeck.position.set(0, 336, 22)
      sUpperNeck.rotation.x = 0.24
      sUpperNeck.castShadow = true
      scannerGroup.add(sUpperNeck)

      const sTrigger = new THREE.Mesh(triggerGeo, scannerRubberMat)
      sTrigger.position.set(0, 368, 76)
      sTrigger.rotation.x = -0.22
      sTrigger.castShadow = true
      scannerGroup.add(sTrigger)

      const sTriggerBump = new THREE.Mesh(triggerBumpGeo, scannerRubberMat)
      sTriggerBump.rotation.z = Math.PI / 2
      sTriggerBump.position.set(0, 366, 98)
      scannerGroup.add(sTriggerBump)

      const scannerHeadGroup = new THREE.Group()
      scannerHeadGroup.position.set(0, 474, 72)
      scannerHeadGroup.rotation.x = 0.18
      scannerGroup.add(scannerHeadGroup)

      const sHeadCore = new THREE.Mesh(headCoreGeo, scannerGreyMat)
      sHeadCore.position.set(0, 4, -52)
      sHeadCore.castShadow = true
      scannerHeadGroup.add(sHeadCore)

      const sHeadCap = new THREE.Mesh(hoodGeo, scannerRubberMat)
      sHeadCap.position.set(0, 0, -24)
      sHeadCap.castShadow = true
      scannerHeadGroup.add(sHeadCap)

      const sHoodRib = new THREE.Mesh(hoodRibGeo, scannerRubberMat)
      sHoodRib.position.set(0, 6, 32)
      sHoodRib.castShadow = true
      scannerHeadGroup.add(sHoodRib)

      const sScanLens = new THREE.Mesh(scanLensGeo, scannerLensMat)
      sScanLens.position.set(0, 0, 14)
      scannerHeadGroup.add(sScanLens)

      const sScanBeam = new THREE.Mesh(scanBeamGeo, scannerBeamMat)
      sScanBeam.position.set(0, 0, 18)
      scannerHeadGroup.add(sScanBeam)

      const sStatusLed = new THREE.Mesh(ledGeo, printerPowerLedMat)
      sStatusLed.rotation.x = -Math.PI / 2
      sStatusLed.position.set(0, 66, -78)
      scannerHeadGroup.add(sStatusLed)

      // 7. Player Input (WASD flat walk + Minecraft Pointer Lock mouse look)
      const pressedKeys = new Set<string>()
      let pointerLocked = false
      let dragLooking = false
      let lastDragX = 0
      let lastDragY = 0
      let currentTargetTitle: string | null = null
      let currentTargetId: string | null = null
      let currentTargetKind: 'label' | 'screen' | 'drawer' | null = null
      let focusedId: string | null = null
      let drawerOpen = false
      let drawerZCurrent = 0
      let drawerZTarget = 0
      let btnPressAnim = 0
      let hoveredTabletId: string | null = null
      let hasPointerActivity = false
      let lastTouchTime = 0
      let touchMoveX = 0
      let touchMoveY = 0
      let touchAimX = 0
      let touchAimY = 0
      let moveTouchId: number | null = null
      let aimTouchId: number | null = null
      let tapTouchId: number | null = null
      let tapStartX = 0
      let tapStartY = 0

      for (const t of tabletInstances) {
        const onEnter = () => {
          hoveredTabletId = t.spec.id
          hasPointerActivity = true
        }
        const onLeave = () => {
          if (hoveredTabletId === t.spec.id) {
            hoveredTabletId = null
          }
        }
        t.wrapperEl.addEventListener('pointerenter', onEnter)
        t.wrapperEl.addEventListener('pointermove', onEnter)
        t.wrapperEl.addEventListener('pointerleave', onLeave)
        cleanupFns.push(() => {
          t.wrapperEl.removeEventListener('pointerenter', onEnter)
          t.wrapperEl.removeEventListener('pointermove', onEnter)
          t.wrapperEl.removeEventListener('pointerleave', onLeave)
        })
      }

      interface CameraTween {
        fromX: number
        fromY: number
        fromZ: number
        fromYaw: number
        fromPitch: number
        toX: number
        toY: number
        toZ: number
        toYaw: number
        toPitch: number
        elapsed: number
        duration: number
      }

      let cameraTween: CameraTween | null = null

      const raycaster = new THREE.Raycaster()
      const screenCenter = new THREE.Vector2(0, 0)
      const pointerNdc = new THREE.Vector2(0, 0)
      const tmpNormal = new THREE.Vector3()
      const tmpToCam = new THREE.Vector3()
      const tmpWorldPos = new THREE.Vector3()
      const tmpWorldQuat = new THREE.Quaternion()
      const forwardVec = new THREE.Vector3()
      const rightVec = new THREE.Vector3()
      const moveVec = new THREE.Vector3()

      const startCameraTween = (
        toX: number,
        toY: number,
        toZ: number,
        toYaw: number,
        toPitch: number,
        duration = 0.36,
      ) => {
        let deltaYaw = (toYaw - yaw) % (Math.PI * 2)
        if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2
        if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2
        cameraTween = {
          fromX: camera.position.x,
          fromY: camera.position.y,
          fromZ: camera.position.z,
          fromYaw: yaw,
          fromPitch: pitch,
          toX,
          toY,
          toZ,
          toYaw: yaw + deltaYaw,
          toPitch,
          elapsed: 0,
          duration,
        }
      }

      const getFocusCameraPose = (t: TabletInstance) => {
        const fovRad = THREE.MathUtils.degToRad(camera.fov)
        const halfV = Math.tan(fovRad / 2)
        const aspect = Math.max(0.5, stageEl.clientWidth / Math.max(1, stageEl.clientHeight))
        const dVert = (t.tabletH / 2) / (0.74 * halfV)
        const dHoriz = (t.tabletW / 2) / (0.78 * aspect * halfV)
        const dist = Math.max(dVert, dHoriz, 680)
        const tilt = -TILT_ANGLE
        return {
          x: t.spec.x,
          y: t.centerY + dist * Math.sin(tilt),
          z: TABLET_Z + dist * Math.cos(tilt),
          yaw: 0,
          pitch: TILT_ANGLE,
        }
      }

      const setFocused = (id: string | null) => {
        focusedId = id
        setFocusedTabletId(id)
      }

      const focusDevice = (id: string) => {
        const target = tabletInstances.find((t) => t.spec.id === id)
        if (!target) return
        setFocused(id)
        stageEl.style.cursor = ''
        if (document.pointerLockElement === stageEl) {
          document.exitPointerLock()
        }
        const pose = getFocusCameraPose(target)
        startCameraTween(pose.x, pose.y, pose.z, pose.yaw, pose.pitch)
      }

      const exitFocus = () => {
        window.focus()
        setFocused(null)
        startCameraTween(
          SPAWN_POS.x,
          SPAWN_POS.y,
          SPAWN_POS.z,
          SPAWN_YAW,
          SPAWN_PITCH,
        )
      }

      const hitPlateAtClient = (clientX: number, clientY: number) => {
        const rect = stageEl.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        pointerNdc.set(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointerNdc, camera)
        const hits = raycaster.intersectObjects(plateTargets, false)
        if (hits.length === 0) return null
        return (hits[0].object.userData.tabletId as string) ?? null
      }

      const hitDrawerAtClient = (clientX: number, clientY: number) => {
        const rect = stageEl.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        pointerNdc.set(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointerNdc, camera)
        return raycaster.intersectObjects(drawerTargets, false).length > 0
      }

      const toggleCashDrawer = () => {
        drawerOpen = !drawerOpen
        drawerZTarget = drawerOpen ? DRAWER_OPEN_OFFSET : 0
        btnPressAnim = 1
        drawerBtnFaceMat.map = drawerOpen ? closeBtnTex : openBtnTex
        drawerBtnFaceMat.needsUpdate = true
        setIsDrawerOpen(drawerOpen)
      }

      toggleDrawerRef.current = () => {
        toggleCashDrawer()
      }

      const syncPointerMode = (locked: boolean) => {
        pointerLocked = locked
        if (locked) {
          dragLooking = false
          cameraTween = null
          stageEl.style.cursor = ''
          setFocused(null)
        }
        setIsLocked(locked)
        if (!locked) {
          setTargetedTablet(null)
          currentTargetTitle = null
          currentTargetId = null
          currentTargetKind = null
        }
      }

      const tryEnterPointerLock = () => {
        window.focus()
        if (document.pointerLockElement === stageEl) return
        try {
          const maybePromise = stageEl.requestPointerLock() as unknown as Promise<void> | undefined
          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {
              // Fallback drag-to-look remains available if Pointer Lock is blocked
            })
          }
        } catch {
          // Ignore if blocked
        }
      }

      unlockFocusRef.current = () => {
        exitFocus()
      }

      const onPointerLockChange = () => {
        syncPointerMode(document.pointerLockElement === stageEl)
      }

      const onPointerLockError = () => {
        syncPointerMode(false)
      }

      const onKeyDown = (e: KeyboardEvent) => {
        const code = e.code
        if (
          code === 'KeyW' ||
          code === 'KeyA' ||
          code === 'KeyS' ||
          code === 'KeyD' ||
          code === 'ArrowUp' ||
          code === 'ArrowDown' ||
          code === 'ArrowLeft' ||
          code === 'ArrowRight'
        ) {
          pressedKeys.add(code)
        } else if (code === 'Escape' && focusedId !== null && !pointerLocked) {
          exitFocus()
        } else if (code === 'KeyE' || code === 'Tab') {
          e.preventDefault()
          if (document.pointerLockElement === stageEl) {
            if (currentTargetKind === 'drawer') {
              toggleCashDrawer()
            } else if (currentTargetId && currentTargetKind === 'label') {
              focusDevice(currentTargetId)
            } else {
              document.exitPointerLock()
            }
          } else if (focusedId !== null) {
            exitFocus()
          } else {
            tryEnterPointerLock()
          }
        }
      }

      const onKeyUp = (e: KeyboardEvent) => {
        pressedKeys.delete(e.code)
      }

      const onWindowBlur = () => {
        pressedKeys.clear()
        dragLooking = false
        window.setTimeout(() => {
          if (disposed || pointerLocked) return
          const activeEl = document.activeElement
          const hit = tabletInstances.find((t) => t.iframeEl === activeEl)
          if (!hit) return
          if (!(hasPointerActivity && hoveredTabletId === hit.spec.id) && focusedId === null) {
            window.focus()
          }
        }, 0)
      }

      const onMouseMove = (e: MouseEvent) => {
        if (Date.now() - lastTouchTime < 700) return
        const sensitivity = 0.0022
        if (pointerLocked) {
          cameraTween = null
          yaw -= e.movementX * sensitivity
          pitch -= e.movementY * sensitivity
          const maxPitch = Math.PI * 0.46
          pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch))
          camera.rotation.set(pitch, yaw, 0, 'YXZ')
        } else if (dragLooking) {
          cameraTween = null
          const dx = e.clientX - lastDragX
          const dy = e.clientY - lastDragY
          lastDragX = e.clientX
          lastDragY = e.clientY
          yaw -= dx * sensitivity * 1.3
          pitch -= dy * sensitivity * 1.3
          const maxPitch = Math.PI * 0.46
          pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch))
          camera.rotation.set(pitch, yaw, 0, 'YXZ')
        } else {
          const hitDrawer = hitDrawerAtClient(e.clientX, e.clientY)
          const hitPlate = focusedId === null ? hitPlateAtClient(e.clientX, e.clientY) : null
          stageEl.style.cursor = hitDrawer || hitPlate ? 'pointer' : ''
        }
      }

      const onStageMouseDown = (e: MouseEvent) => {
        if (Date.now() - lastTouchTime < 700) return
        // Ignore clicks on HUD buttons/links or virtual sticks
        const target = e.target as HTMLElement | null
        if (
          target &&
          target.closest('.scene3d-hud-top, .scene3d-hud-bottom, .scene3d-stick')
        ) {
          return
        }

        if (pointerLocked) {
          if (e.button === 0 && currentTargetId) {
            if (currentTargetKind === 'drawer') {
              toggleCashDrawer()
            } else if (currentTargetKind === 'label') {
              focusDevice(currentTargetId)
            } else {
              document.exitPointerLock()
            }
          }
          return
        }

        if (e.button === 0) {
          if (hitDrawerAtClient(e.clientX, e.clientY)) {
            e.preventDefault()
            toggleCashDrawer()
            return
          }

          if (focusedId !== null) {
            exitFocus()
            return
          }

          const plateId = hitPlateAtClient(e.clientX, e.clientY)
          if (plateId) {
            e.preventDefault()
            focusDevice(plateId)
            return
          }

          // Clicking outside tablets and labels enters Walk/Look Mode on desktop.
          if (!touchCapable) {
            tryEnterPointerLock()
          }
          dragLooking = true
          lastDragX = e.clientX
          lastDragY = e.clientY
        }
      }

      // Mobile dual-stick touch handlers & tap-to-click
      const STICK_MAX_R = 38
      const updateStickVector = (
        stickEl: HTMLDivElement | null,
        knobEl: HTMLDivElement | null,
        clientX: number,
        clientY: number,
        isMove: boolean,
      ) => {
        if (!stickEl) return
        const rect = stickEl.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        let dx = clientX - cx
        let dy = clientY - cy
        const len = Math.hypot(dx, dy)
        if (len > STICK_MAX_R) {
          dx = (dx / len) * STICK_MAX_R
          dy = (dy / len) * STICK_MAX_R
        }
        if (knobEl) {
          knobEl.style.transform = `translate(${dx}px, ${dy}px)`
        }
        const nx = dx / STICK_MAX_R
        const ny = dy / STICK_MAX_R
        if (isMove) {
          touchMoveX = nx
          touchMoveY = -ny
        } else {
          touchAimX = Math.abs(nx) < 0.1 ? 0 : nx
          touchAimY = Math.abs(ny) < 0.1 ? 0 : ny
        }
      }

      const resetStick = (knobEl: HTMLDivElement | null, isMove: boolean) => {
        if (knobEl) {
          knobEl.style.transform = 'translate(0px, 0px)'
        }
        if (isMove) {
          touchMoveX = 0
          touchMoveY = 0
          moveTouchId = null
        } else {
          touchAimX = 0
          touchAimY = 0
          aimTouchId = null
        }
      }

      const onStageTouchStart = (e: TouchEvent) => {
        lastTouchTime = Date.now()
        const target = e.target as HTMLElement | null
        if (target && target.closest('.scene3d-hud-top, .scene3d-hud-bottom')) {
          return
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i]
          const touchTarget = touch.target as HTMLElement | null
          if (touchTarget && moveStickRef.current?.contains(touchTarget)) {
            if (moveTouchId === null) {
              moveTouchId = touch.identifier
              updateStickVector(
                moveStickRef.current,
                moveKnobRef.current,
                touch.clientX,
                touch.clientY,
                true,
              )
            }
            e.preventDefault()
          } else if (touchTarget && aimStickRef.current?.contains(touchTarget)) {
            if (aimTouchId === null) {
              aimTouchId = touch.identifier
              updateStickVector(
                aimStickRef.current,
                aimKnobRef.current,
                touch.clientX,
                touch.clientY,
                false,
              )
            }
            e.preventDefault()
          } else if (tapTouchId === null) {
            tapTouchId = touch.identifier
            tapStartX = touch.clientX
            tapStartY = touch.clientY
          }
        }
      }

      const onWindowTouchMove = (e: TouchEvent) => {
        lastTouchTime = Date.now()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i]
          if (touch.identifier === moveTouchId) {
            updateStickVector(
              moveStickRef.current,
              moveKnobRef.current,
              touch.clientX,
              touch.clientY,
              true,
            )
            e.preventDefault()
          } else if (touch.identifier === aimTouchId) {
            updateStickVector(
              aimStickRef.current,
              aimKnobRef.current,
              touch.clientX,
              touch.clientY,
              false,
            )
            e.preventDefault()
          }
        }
      }

      const onWindowTouchEnd = (e: TouchEvent) => {
        lastTouchTime = Date.now()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i]
          if (touch.identifier === moveTouchId) {
            resetStick(moveKnobRef.current, true)
          } else if (touch.identifier === aimTouchId) {
            resetStick(aimKnobRef.current, false)
          } else if (touch.identifier === tapTouchId) {
            tapTouchId = null
            const dist = Math.hypot(touch.clientX - tapStartX, touch.clientY - tapStartY)
            if (dist < 14) {
              if (hitDrawerAtClient(touch.clientX, touch.clientY)) {
                toggleCashDrawer()
              } else if (focusedId !== null) {
                exitFocus()
              } else {
                const plateId = hitPlateAtClient(touch.clientX, touch.clientY)
                if (plateId) {
                  focusDevice(plateId)
                }
              }
            }
          }
        }
      }

      const onWindowMouseUp = () => {
        dragLooking = false
      }

      const onResize = () => {
        const w = stageEl.clientWidth
        const h = Math.max(1, stageEl.clientHeight)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        webglRenderer.setSize(w, h)
        cssRenderer.setSize(w, h)
      }

      const resizeObserver =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
      resizeObserver?.observe(stageEl)

      document.addEventListener('pointerlockchange', onPointerLockChange)
      document.addEventListener('pointerlockerror', onPointerLockError)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onWindowBlur)
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onWindowMouseUp)
      window.addEventListener('resize', onResize)
      window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
      window.addEventListener('touchend', onWindowTouchEnd)
      window.addEventListener('touchcancel', onWindowTouchEnd)
      stageEl.addEventListener('mousedown', onStageMouseDown)
      stageEl.addEventListener('touchstart', onStageTouchStart, { passive: false })

      cleanupFns.push(() => {
        resizeObserver?.disconnect()
        document.removeEventListener('pointerlockchange', onPointerLockChange)
        document.removeEventListener('pointerlockerror', onPointerLockError)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onWindowBlur)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onWindowMouseUp)
        window.removeEventListener('resize', onResize)
        window.removeEventListener('touchmove', onWindowTouchMove)
        window.removeEventListener('touchend', onWindowTouchEnd)
        window.removeEventListener('touchcancel', onWindowTouchEnd)
        stageEl.removeEventListener('mousedown', onStageMouseDown)
        stageEl.removeEventListener('touchstart', onStageTouchStart)

        if (document.pointerLockElement === stageEl) {
          document.exitPointerLock()
        }

        for (const item of tabletInstances) {
          item.wrapperEl.remove()
        }
        for (const d of disposables) {
          d.dispose()
        }
        webglRenderer.dispose()
      })

      // 8. Animation Loop
      let lastTime = performance.now()

      const resolveTableCollision = (px: number, pz: number): [number, number] => {
        const halfW = TABLE_W / 2 + PLAYER_RADIUS
        const halfD = TABLE_D / 2 + PLAYER_RADIUS
        if (Math.abs(px) < halfW && Math.abs(pz) < halfD) {
          const overlapX = halfW - Math.abs(px)
          const overlapZ = halfD - Math.abs(pz)
          if (overlapX < overlapZ) {
            px = px >= 0 ? halfW : -halfW
          } else {
            pz = pz >= 0 ? halfD : -halfD
          }
        }
        px = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, px))
        pz = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, pz))
        return [px, pz]
      }

      const tick = (now: number) => {
        if (disposed) return
        const dt = Math.min(0.05, (now - lastTime) / 1000)
        lastTime = now

        // Cash drawer slide & button press animation
        if (Math.abs(drawerZTarget - drawerZCurrent) > 0.5) {
          const lerp = 1 - Math.exp(-12 * dt)
          drawerZCurrent += (drawerZTarget - drawerZCurrent) * lerp
        } else {
          drawerZCurrent = drawerZTarget
        }
        drawerTrayGroup.position.z = drawerZCurrent

        if (btnPressAnim > 0) {
          btnPressAnim = Math.max(0, btnPressAnim - dt * 5)
          cashBtnMesh.position.z = DRAWER_D / 2 + 8 - Math.sin(btnPressAnim * Math.PI) * 14
        } else {
          cashBtnMesh.position.z = DRAWER_D / 2 + 8
        }

        // Smooth focus / return-to-overview camera transition
        if (cameraTween) {
          cameraTween.elapsed += dt
          const p = Math.min(1, cameraTween.elapsed / cameraTween.duration)
          const ease = 1 - Math.pow(1 - p, 3)
          camera.position.set(
            cameraTween.fromX + (cameraTween.toX - cameraTween.fromX) * ease,
            cameraTween.fromY + (cameraTween.toY - cameraTween.fromY) * ease,
            cameraTween.fromZ + (cameraTween.toZ - cameraTween.fromZ) * ease,
          )
          yaw = cameraTween.fromYaw + (cameraTween.toYaw - cameraTween.fromYaw) * ease
          pitch = cameraTween.fromPitch + (cameraTween.toPitch - cameraTween.fromPitch) * ease
          camera.rotation.set(pitch, yaw, 0, 'YXZ')
          if (p >= 1) {
            cameraTween = null
          }
        }

        // Mobile right-stick aim rotation
        if (focusedId === null && (touchAimX !== 0 || touchAimY !== 0)) {
          cameraTween = null
          yaw -= touchAimX * 1.9 * dt
          pitch -= touchAimY * 1.35 * dt
          const maxPitch = Math.PI * 0.46
          pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch))
          camera.rotation.set(pitch, yaw, 0, 'YXZ')
        }

        // Flat WASD + mobile left-stick walking (no jump, sprint, or crouch)
        let moveForward = 0
        let moveRight = 0
        if (focusedId === null) {
          if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) moveForward += 1
          if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) moveForward -= 1
          if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) moveRight += 1
          if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) moveRight -= 1
          moveForward += touchMoveY
          moveRight += touchMoveX
        }

        if (Math.abs(moveForward) > 0.01 || Math.abs(moveRight) > 0.01) {
          cameraTween = null
          forwardVec.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize()
          rightVec.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize()

          moveVec
            .set(0, 0, 0)
            .addScaledVector(forwardVec, moveForward)
            .addScaledVector(rightVec, moveRight)
          if (moveVec.length() > 1) {
            moveVec.normalize()
          }
          moveVec.multiplyScalar(WALK_SPEED * dt)

          const nextX = camera.position.x + moveVec.x
          const nextZ = camera.position.z + moveVec.z
          const [resolvedX, resolvedZ] = resolveTableCollision(nextX, nextZ)
          camera.position.set(resolvedX, EYE_HEIGHT, resolvedZ)
        }

        // Front-face check & pointer-events routing for the real iframes
        for (const t of tabletInstances) {
          t.cutoutMesh.getWorldPosition(tmpWorldPos)
          t.cutoutMesh.getWorldQuaternion(tmpWorldQuat)
          tmpNormal.set(0, 0, 1).applyQuaternion(tmpWorldQuat)
          tmpToCam.copy(camera.position).sub(tmpWorldPos)

          const isFrontFacing = tmpNormal.dot(tmpToCam) > 0
          if (!isFrontFacing) {
            t.wrapperEl.style.visibility = 'hidden'
            t.wrapperEl.style.pointerEvents = 'none'
            t.iframeEl.style.pointerEvents = 'none'
          } else {
            t.wrapperEl.style.visibility = 'visible'
            const interactive = !pointerLocked ? 'auto' : 'none'
            t.wrapperEl.style.pointerEvents = interactive
            t.iframeEl.style.pointerEvents = interactive
          }
        }

        // Raycast from crosshair when in Pointer Lock mode
        if (pointerLocked) {
          raycaster.setFromCamera(screenCenter, camera)
          const hits = raycaster.intersectObjects(raycastTargets, false)
          const hasHit = hits.length > 0 && hits[0].distance <= 24000
          const nextTitle = hasHit
            ? (hits[0].object.userData.tabletTitle as string)
            : null
          const nextId = hasHit ? (hits[0].object.userData.tabletId as string) : null
          const nextKind = hasHit
            ? ((hits[0].object.userData.kind as 'label' | 'screen' | 'drawer') ?? 'screen')
            : null
          currentTargetId = nextId
          if (nextTitle !== currentTargetTitle || nextKind !== currentTargetKind) {
            currentTargetTitle = nextTitle
            currentTargetKind = nextKind
            setTargetedTablet(
              nextTitle && nextKind ? { title: nextTitle, kind: nextKind } : null,
            )
          }
        }

        webglRenderer.render(webglScene, camera)
        cssRenderer.render(cssScene, camera)
        animId = requestAnimationFrame(tick)
      }

      animId = requestAnimationFrame(tick)
    })

    return () => {
      disposed = true
      if (animId) cancelAnimationFrame(animId)
      for (const fn of cleanupFns) fn()
      cleanupFns = []
    }
  }, [])

  const focusedTablet = focusedTabletId
    ? TABLETS.find((t) => t.id === focusedTabletId) ?? null
    : null

  return (
    <div class={`scene3d-page ${isTouchMode ? 'is-touch' : ''}`}>
      <div
        ref={stageRef}
        class={`scene3d-stage ${isLocked ? '' : 'is-cursor-mode'}`}
      >
        <div ref={cssLayerRef} class="scene3d-css-layer" />
        <canvas
          ref={webglCanvasRef}
          class={`scene3d-webgl-layer ${focusedTablet ? 'is-blurred' : ''}`}
        />

        <div
          class={`scene3d-crosshair ${isLocked ? 'is-visible' : ''} ${targetedTablet ? 'is-targeting' : ''
            }`}
          aria-hidden="true"
        />

        <div class="scene3d-hud-top">
          <div class="scene3d-hud-group">
            <Link class="scene3d-pill" href="/">
              ← Startseite
            </Link>
            <span class="scene3d-pill">
              <span class={`scene3d-pill-dot ${isLocked ? '' : 'is-cursor'}`} />
              {isLocked
                ? 'Lauf-Modus'
                : focusedTablet
                  ? `Fokus: ${focusedTablet.title}`
                  : isTouchMode
                    ? 'Touch-Modus'
                    : 'Maus-Modus'}
            </span>
            {focusedTablet && (
              <a
                class="scene3d-pill scene3d-pill-url"
                href={focusedTablet.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {focusedTablet.url} ↗
              </a>
            )}
          </div>

          <div class="scene3d-hud-group">
            {focusedTablet && (
              <button
                type="button"
                class="scene3d-pill scene3d-pill-unlock"
                onClick={() => unlockFocusRef.current?.()}
              >
                Entsperren
              </button>
            )}
            <button
              type="button"
              class="scene3d-pill"
              onClick={() => toggleDrawerRef.current?.()}
            >
              {isDrawerOpen ? 'Kasse schließen' : 'Kasse öffnen'}
            </button>
            <button
              type="button"
              class="scene3d-pill"
              onClick={() => resetViewRef.current?.()}
            >
              Position zurücksetzen
            </button>
          </div>
        </div>

        <div class="scene3d-hud-bottom">
          {isLocked && targetedTablet && (
            <div class="scene3d-target-badge">
              {targetedTablet.title} —{' '}
              {targetedTablet.kind === 'drawer'
                ? isDrawerOpen
                  ? 'Klicken oder E drücken zum Schließen'
                  : 'Klicken oder E drücken zum Öffnen'
                : targetedTablet.kind === 'label'
                  ? 'Klicken oder E drücken zum Fokussieren'
                  : 'Klicken oder E drücken zum Bedienen'}
            </div>
          )}
          <div class="scene3d-hint">
            {isLocked
              ? 'WASD: Bewegen · Maus: Umsehen · Schild anvisieren + Klick (E): Fokussieren · Bildschirm + Klick (E): Bedienen · ESC: Maus freigeben'
              : focusedTablet
                ? isTouchMode
                  ? 'Auf das Gerät tippen & wischen · Tippen außerhalb oder „Entsperren“: Zurück zur Übersicht'
                  : 'Maus & Mausrad bedienen das Gerät · Klick außerhalb oder „Entsperren“: Zurück zur Übersicht'
                : isTouchMode
                  ? 'Linker Stick: Bewegen · Rechter Stick: Umsehen · Tippen: Bildschirm bedienen / Schild fokussieren'
                  : 'Schild mit Lupe anklicken: Fokussieren · Bildschirm direkt bedienen · Boden anklicken (oder E): Laufen & Umsehen'}
          </div>
        </div>

        {isTouchMode && !focusedTablet && (
          <>
            <div ref={moveStickRef} class="scene3d-stick is-left" aria-label="Bewegungs-Stick">
              <span class="scene3d-stick-label">Bewegen</span>
              <div ref={moveKnobRef} class="scene3d-stick-knob" />
            </div>
            <div ref={aimStickRef} class="scene3d-stick is-right" aria-label="Umsehen-Stick">
              <span class="scene3d-stick-label">Umsehen</span>
              <div ref={aimKnobRef} class="scene3d-stick-knob" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ThreeDRoute
