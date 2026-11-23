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

const TABLE_W = 6400 // 1.60m
const TABLE_D = 3200 // 0.80m
const TABLE_TOP_Y = 3040 // 0.76m
const TABLE_THICKNESS = 140

const EYE_HEIGHT = 4800 // 1.20m
const WALK_SPEED = 11200 // 2.8 m/s
const PLAYER_RADIUS = 650
const ARENA_HALF = 72000 // 18m

const SPAWN_POS = { x: 0, y: EYE_HEIGHT, z: 4200 }
const SPAWN_YAW = 0
const SPAWN_PITCH = -0.26

const TABLETS: TabletSpec[] = [
  {
    id: 'dash-left',
    title: 'Artikelverwaltung',
    subtitle: 'dashdemo.quixpos.com',
    url: 'https://dashdemo.quixpos.com',
    x: -1550,
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
  ctx.fillText(title, 256, 46)

  ctx.fillStyle = '#1ec9a8'
  ctx.font = '500 22px system-ui, -apple-system, sans-serif'
  ctx.fillText(subtitle, 256, 88)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function ThreeDRoute() {
  const stageRef = useRef<HTMLDivElement>(null)
  const cssLayerRef = useRef<HTMLDivElement>(null)
  const webglCanvasRef = useRef<HTMLCanvasElement>(null)

  const [isLocked, setIsLocked] = useState(false)
  const [targetedTablet, setTargetedTablet] = useState<string | null>(null)
  const [focusedTabletId, setFocusedTabletId] = useState<string | null>(null)
  const resetViewRef = useRef<(() => void) | null>(null)
  const unlockFocusRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const stageEl = stageRef.current
    const cssLayerEl = cssLayerRef.current
    const canvasEl = webglCanvasRef.current
    if (!stageEl || !cssLayerEl || !canvasEl) return

    let disposed = false
    let animId = 0

    let cleanupFns: Array<() => void> = []

    Promise.all([
      import('three'),
      import('three/examples/jsm/renderers/CSS3DRenderer.js'),
    ]).then(([THREE, { CSS3DRenderer, CSS3DObject }]) => {
      if (disposed) return

      const disposables: Array<{ dispose: () => void }> = []

      // 1. Renderers
      const webglRenderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
        alpha: true,
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

      // Subtle under-table crossbar frame
      const beamXGeo = new THREE.BoxGeometry(TABLE_W - 520, 110, 120)
      const beamZGeo = new THREE.BoxGeometry(120, 110, TABLE_D - 520)
      disposables.push(beamXGeo, beamZGeo)
      for (const bz of [-legOffsetZ, legOffsetZ]) {
        const beam = new THREE.Mesh(beamXGeo, metalMat)
        beam.position.set(0, TABLE_TOP_Y - TABLE_THICKNESS - 55, bz)
        beam.castShadow = true
        tableGroup.add(beam)
      }
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
      const cutoutMat = new THREE.MeshBasicMaterial({
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

      const TILT_ANGLE = -0.36 // ~20.6 degrees tilted back toward viewer
      const TABLET_Z = 920 // Near front edge of the table (front edge at +1600)

      for (const spec of TABLETS) {
        const visibleCssW = spec.crop ? spec.crop.w : spec.cssW
        const visibleCssH = spec.crop ? spec.crop.h : spec.cssH
        const screenW = Math.round(visibleCssW * spec.physicalScale)
        const screenH = Math.round(visibleCssH * spec.physicalScale)
        const tabletW = screenW + spec.bezelPad * 2
        const tabletH = screenH + spec.bezelPad * 2

        const centerYOffset = (tabletH / 2) * Math.cos(TILT_ANGLE) + spec.bottomClearance
        const centerY = TABLE_TOP_Y + centerYOffset

        const backShellGeo = new THREE.BoxGeometry(tabletW, tabletH, TABLET_DEPTH - 8)
        const bezelTopGeo = new THREE.BoxGeometry(tabletW, spec.bezelPad, 10)
        const bezelSideGeo = new THREE.BoxGeometry(spec.bezelPad, screenH, 10)
        const cutoutGeo = new THREE.PlaneGeometry(screenW, screenH)
        const footW = Math.min(580, Math.max(280, Math.round(tabletW * 0.65)))
        const baseFootGeo = new THREE.BoxGeometry(footW, 32, 340)
        const neckH = Math.max(240, Math.round(centerYOffset))
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

        // Stand on tabletop
        const foot = new THREE.Mesh(baseFootGeo, standMat)
        foot.position.set(spec.x, TABLE_TOP_Y + 16, TABLET_Z - 140)
        foot.castShadow = true
        foot.receiveShadow = true
        webglScene.add(foot)

        const neck = new THREE.Mesh(neckGeo, standMat)
        neck.position.set(spec.x, TABLE_TOP_Y + neckH / 2 + 16, TABLET_Z - 140)
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
        plate.userData = { tabletTitle: spec.title, tabletId: spec.id }
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
        cutoutMesh.userData = { tabletTitle: spec.title, tabletId: spec.id }
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
        if (spec.crop) {
          iframeEl.style.position = 'relative'
          iframeEl.style.left = `${-spec.crop.x}px`
          iframeEl.style.top = `${-spec.crop.y}px`
        }
        iframeEl.src = spec.url
        iframeEl.title = `${spec.title} (${spec.subtitle})`
        iframeEl.loading = 'eager'
        iframeEl.allow = 'clipboard-read; clipboard-write'
        wrapperEl.appendChild(iframeEl)

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

      // 7. Player Input (WASD flat walk + Minecraft Pointer Lock mouse look)
      const pressedKeys = new Set<string>()
      let pointerLocked = false
      let dragLooking = false
      let lastDragX = 0
      let lastDragY = 0
      let currentTargetTitle: string | null = null
      let currentTargetId: string | null = null
      let focusedId: string | null = null

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
        for (const t of tabletInstances) {
          if (id !== null && t.spec.id !== id) {
            t.wrapperEl.classList.add('is-blurred')
          } else {
            t.wrapperEl.classList.remove('is-blurred')
          }
        }
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
            if (currentTargetId) {
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
          if (hit && focusedId !== hit.spec.id) {
            focusDevice(hit.spec.id)
          }
        }, 0)
      }

      const onMouseMove = (e: MouseEvent) => {
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
        } else if (focusedId === null) {
          const hitId = hitPlateAtClient(e.clientX, e.clientY)
          stageEl.style.cursor = hitId ? 'pointer' : ''
        } else {
          stageEl.style.cursor = ''
        }
      }

      const onStageMouseDown = (e: MouseEvent) => {
        // Ignore clicks on HUD buttons/links
        const target = e.target as HTMLElement | null
        if (target && target.closest('.scene3d-hud-top, .scene3d-hud-bottom')) {
          return
        }

        if (pointerLocked) {
          if (e.button === 0 && currentTargetId) {
            focusDevice(currentTargetId)
          }
          return
        }

        if (e.button === 0) {
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

          // Clicking outside tablets and labels enters Walk/Look Mode.
          tryEnterPointerLock()
          dragLooking = true
          lastDragX = e.clientX
          lastDragY = e.clientY
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

      document.addEventListener('pointerlockchange', onPointerLockChange)
      document.addEventListener('pointerlockerror', onPointerLockError)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onWindowBlur)
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onWindowMouseUp)
      window.addEventListener('resize', onResize)
      stageEl.addEventListener('mousedown', onStageMouseDown)

      cleanupFns.push(() => {
        document.removeEventListener('pointerlockchange', onPointerLockChange)
        document.removeEventListener('pointerlockerror', onPointerLockError)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onWindowBlur)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onWindowMouseUp)
        window.removeEventListener('resize', onResize)
        stageEl.removeEventListener('mousedown', onStageMouseDown)

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

        // Flat WASD walking (no jump, sprint, or crouch)
        let moveForward = 0
        let moveRight = 0
        if (focusedId === null) {
          if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) moveForward += 1
          if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) moveForward -= 1
          if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) moveRight += 1
          if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) moveRight -= 1
        }

        if (moveForward !== 0 || moveRight !== 0) {
          cameraTween = null
          forwardVec.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize()
          rightVec.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize()

          moveVec
            .set(0, 0, 0)
            .addScaledVector(forwardVec, moveForward)
            .addScaledVector(rightVec, moveRight)
            .normalize()
            .multiplyScalar(WALK_SPEED * dt)

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
            const canInteract =
              !pointerLocked && (focusedId === null || focusedId === t.spec.id)
            const interactive = canInteract ? 'auto' : 'none'
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
          currentTargetId = nextId
          if (nextTitle !== currentTargetTitle) {
            currentTargetTitle = nextTitle
            setTargetedTablet(nextTitle)
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
    <div class="scene3d-page">
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
                  ? `Bedienmodus: ${focusedTablet.title}`
                  : 'Maus-Modus'}
            </span>
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
              onClick={() => resetViewRef.current?.()}
            >
              Position zurücksetzen
            </button>
          </div>
        </div>

        <div class="scene3d-hud-bottom">
          {isLocked && targetedTablet && (
            <div class="scene3d-target-badge">
              {targetedTablet} — Klicken oder E drücken zum Bedienen
            </div>
          )}
          <div class="scene3d-hint">
            {isLocked
              ? 'WASD: Bewegen · Maus: Umsehen · Gerät oder Schild anvisieren + Klick (oder E): Bedienen · ESC: Maus freigeben'
              : focusedTablet
                ? 'Maus & Mausrad bedienen das Gerät · Klick außerhalb oder „Entsperren“: Zurück zur Übersicht'
                : 'Schild oder Gerät anklicken: Fokus & Bedienen · Boden/Umgebung anklicken (oder E): Laufen & Umsehen · WASD: Bewegen'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ThreeDRoute
