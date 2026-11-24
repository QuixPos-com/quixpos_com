import {
  DEFAULT_ZEBRA_REEL_ID,
  getZebraReelById,
  PRINTER_SIZE,
  PRINTER_X,
  PRINTER_Z,
  TABLE_D,
  TABLE_TOP_Y,
  TABLE_Z,
  ZEBRA_DPI,
  ZEBRA_X,
  ZEBRA_Z,
} from '../config'
import { markFocusSharp } from '../focusBlurPass'
import type { Disposable, ThreeModule, ZebraMediaInfo } from '../types'
import {
  escPosBytesToBase64,
  formatEscPosReadable,
  normalizeEscPosBytes,
  renderEscPosToCanvas,
} from './escposEmulator'
import { renderZplToCanvas } from './zplEmulator'

export type PrinterKind = 'zebra' | 'epson'

export interface PrintLogMeta {
  sender: string
  origin?: string
  messageName?: string
  jobId?: string
}

interface PrinterSlotConfig {
  kind: PrinterKind
  slotX: number
  slotY: number
  slotZ: number
  paperWorldW: number
  minWorldH: number
  maxWorldH: number
  tiltX: number
  feedSpeed: number
  extraFeed: number
}

interface PlacedBackup {
  parent: InstanceType<ThreeModule['Object3D']>
  pos: InstanceType<ThreeModule['Vector3']>
  quat: InstanceType<ThreeModule['Quaternion']>
  yawOffset: number
}

interface PrintedSheet {
  id: string
  printer: PrinterKind
  mesh: InstanceType<ThreeModule['Mesh']>
  geo: InstanceType<ThreeModule['PlaneGeometry']>
  mat: InstanceType<ThreeModule['MeshStandardMaterial']>
  tex: InstanceType<ThreeModule['CanvasTexture']>
  width: number
  height: number
  tiltX: number
  feedDirX: number
  feedDirY: number
  feedDirZ: number
  slotX: number
  slotY: number
  slotZ: number
  emerged: number
  targetEmerged: number
  feedSpeed: number
  // Drop-to-floor state
  vx: number
  vy: number
  vz: number
  dropTime: number
  startDropRotX: number
  targetFloorYaw: number
  floorY: number
  // Placement state (Zebra labels)
  yawOffset: number
  placedBackup: PlacedBackup | null
}

export interface PrintJobOutcome {
  printer: PrinterKind
  droppedPrevious: boolean
  kickDrawer: boolean
  dpi: number
  widthPx: number
  heightPx: number
}

export interface PrintManagerOptions {
  maxAnisotropy?: number
  drawerTrayGroup?: InstanceType<ThreeModule['Group']>
}

export interface PrintManager extends Disposable {
  setZebraMedia: (media: ZebraMediaInfo) => void
  getZebraMedia: () => ZebraMediaInfo
  printZpl: (zpl: string, logMeta?: PrintLogMeta) => PrintJobOutcome
  printEscPos: (
    input: {
      escpos?: unknown
      base64?: unknown
      bytes?: unknown
      raw?: unknown
      data?: unknown
      encoding?: unknown
    },
    logMeta?: PrintLogMeta,
  ) => PrintJobOutcome
  getZebraLabelTargets: () => Array<InstanceType<ThreeModule['Mesh']>>
  getPlacedLabelSurfaces: () => Array<InstanceType<ThreeModule['Mesh']>>
  getAllSheetMeshes: () => Array<InstanceType<ThreeModule['Mesh']>>
  hasHeldLabel: () => boolean
  canPlaceHeldLabel: () => boolean
  pickUpLabel: (
    target: InstanceType<ThreeModule['Object3D']> | string,
  ) => boolean
  rotateHeldLabel: (deltaRad?: number) => void
  updateHeldLabelPreview: (
    raycaster: InstanceType<ThreeModule['Raycaster']>,
    camera: InstanceType<ThreeModule['PerspectiveCamera']>,
    cameraYaw: number,
    placeableSurfaces: Array<InstanceType<ThreeModule['Object3D']>>,
    dt: number,
  ) => boolean
  placeHeldLabel: () => boolean
  cancelHeldLabel: () => void
  update: (dt: number) => void
}

const MAX_FLOOR_SHEETS = 32
const MAX_PLACED_LABELS = 64
const GRAVITY = -9800

const SLOT_CONFIGS: Record<PrinterKind, PrinterSlotConfig> = {
  zebra: {
    kind: 'zebra',
    slotX: ZEBRA_X,
    slotY: TABLE_TOP_Y + 196,
    slotZ: ZEBRA_Z + 338,
    paperWorldW: 320,
    minWorldH: 180,
    maxWorldH: 540,
    tiltX: -1.24,
    feedSpeed: 460,
    extraFeed: 28,
  },
  epson: {
    kind: 'epson',
    slotX: PRINTER_X,
    slotY: TABLE_TOP_Y + PRINTER_SIZE - 22,
    slotZ: PRINTER_Z + PRINTER_SIZE / 2 + 2,
    paperWorldW: 220,
    minWorldH: 150,
    maxWorldH: 700,
    tiltX: -1.18,
    feedSpeed: 520,
    extraFeed: 12,
  },
}

export function createPrintManager(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  epsonNetLedMat?: InstanceType<ThreeModule['MeshStandardMaterial']>,
  options: PrintManagerOptions = {},
): PrintManager {
  let disposed = false
  let sheetIdCounter = 0
  let floorStackCounter = 0
  let placedStackCounter = 0
  let ledBlinkPhase = 0
  let activeZebraMedia: ZebraMediaInfo = getZebraReelById(DEFAULT_ZEBRA_REEL_ID)
  const maxAniso = Math.max(4, Math.min(16, options.maxAnisotropy ?? 8))
  const drawerTrayGroup = options.drawerTrayGroup ?? null

  const clipPlanes: Record<
    PrinterKind,
    InstanceType<ThreeModule['Plane']>
  > = {
    zebra: createSlotClipPlane(THREE, SLOT_CONFIGS.zebra),
    epson: createSlotClipPlane(THREE, SLOT_CONFIGS.epson),
  }

  const activeSheets: Record<PrinterKind, PrintedSheet | null> = {
    zebra: null,
    epson: null,
  }
  const droppingSheets: PrintedSheet[] = []
  const landedSheets: PrintedSheet[] = []
  const placedLabels: PrintedSheet[] = []

  let heldLabel: PrintedSheet | null = null
  let heldSurfaceValid = false
  const heldCommitPoint = new THREE.Vector3()
  const heldCommitNormal = new THREE.Vector3(0, 1, 0)
  const heldCommitQuat = new THREE.Quaternion()
  let heldCommitObject: InstanceType<ThreeModule['Object3D']> | null = null

  // Subtle glowing outline frame shown around the Zebra label while placing it
  const previewBorderGeo = new THREE.EdgesGeometry(
    new THREE.PlaneGeometry(1, 1),
  )
  const previewBorderMat = new THREE.LineBasicMaterial({
    color: '#1ec9a8',
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  })
  const previewBorderLines = new THREE.LineSegments(
    previewBorderGeo,
    previewBorderMat,
  )
  previewBorderLines.visible = false
  previewBorderLines.renderOrder = 10
  markFocusSharp(previewBorderLines)

  // Math temporaries for surface alignment
  const tmpNormal = new THREE.Vector3()
  const tmpToCam = new THREE.Vector3()
  const tmpUp = new THREE.Vector3()
  const tmpRight = new THREE.Vector3()
  const tmpRotQuat = new THREE.Quaternion()
  const tmpBasisMat = new THREE.Matrix4()
  const tmpTargetPos = new THREE.Vector3()
  const tmpTargetQuat = new THREE.Quaternion()
  const tmpHandLocal = new THREE.Vector3()
  const tmpHandEuler = new THREE.Euler(-0.32, 0.24, -0.06, 'YXZ')
  const tmpHandQuat = new THREE.Quaternion()
  const worldUp = new THREE.Vector3(0, 1, 0)

  function createSlotClipPlane(
    T: ThreeModule,
    cfg: PrinterSlotConfig,
  ): InstanceType<ThreeModule['Plane']> {
    const angle = -cfg.tiltX
    const normal = new T.Vector3(0, -Math.cos(angle), Math.sin(angle)).normalize()
    const point = new T.Vector3(cfg.slotX, cfg.slotY, cfg.slotZ)
    return new T.Plane().setFromNormalAndCoplanarPoint(normal, point)
  }

  function disposeSheet(sheet: PrintedSheet) {
    if (previewBorderLines.parent === sheet.mesh) {
      sheet.mesh.remove(previewBorderLines)
      previewBorderLines.visible = false
    }
    sheet.mesh.parent?.remove(sheet.mesh)
    sheet.geo.dispose()
    sheet.mat.dispose()
    sheet.tex.dispose()
  }

  function detachSheetToFloor(sheet: PrintedSheet) {
    webglScene.attach(sheet.mesh)
    sheet.mat.clippingPlanes = null
    sheet.mat.polygonOffset = false
    sheet.mat.needsUpdate = true
    sheet.placedBackup = null

    sheet.vx = (Math.random() - 0.5) * 380
    sheet.vy = -140
    sheet.vz = 1580 + Math.random() * 280
    sheet.dropTime = 0
    sheet.startDropRotX = sheet.mesh.rotation.x
    sheet.targetFloorYaw = (Math.random() - 0.5) * 0.58
    sheet.floorY = 3 + (floorStackCounter % 24) * 1.4
    floorStackCounter++

    droppingSheets.push(sheet)
  }

  function spawnSheetFromCanvas(
    printer: PrinterKind,
    canvas: HTMLCanvasElement,
  ): boolean {
    if (disposed) return false

    const prev = activeSheets[printer]
    const droppedPrevious = prev !== null
    if (prev) {
      detachSheetToFloor(prev)
      activeSheets[printer] = null
    }

    const cfg = SLOT_CONFIGS[printer]
    const aspect = canvas.height / Math.max(1, canvas.width)
    let paperW = cfg.paperWorldW
    let paperH = Math.min(
      cfg.maxWorldH,
      Math.max(cfg.minWorldH, Math.round(paperW * aspect)),
    )
    if (printer === 'zebra') {
      // Physical 1:1 scale (4 world units = 1 mm), capped to the Zebra exit slot width
      paperW = Math.min(412, Math.max(96, Math.round(activeZebraMedia.widthMm * 4)))
      paperH = Math.min(640, Math.max(48, Math.round(paperW * aspect)))
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = maxAniso

    const geo = new THREE.PlaneGeometry(paperW, paperH)
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.82,
      metalness: 0.02,
      side: THREE.DoubleSide,
      clippingPlanes: [clipPlanes[printer]],
    })

    const id = `${printer}-sheet-${++sheetIdCounter}`
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.rotation.order = 'YXZ'
    mesh.rotation.set(cfg.tiltX, 0, 0)

    if (printer === 'zebra') {
      mesh.userData = {
        tabletTitle: 'Zebra-Etikett',
        tabletId: id,
        labelId: id,
        kind: 'zebra-label' as const,
      }
    }

    const angle = -cfg.tiltX
    const feedDirX = 0
    const feedDirY = -Math.cos(angle)
    const feedDirZ = Math.sin(angle)

    const initialEmerged = 6
    const offset = initialEmerged - paperH / 2
    mesh.position.set(
      cfg.slotX + feedDirX * offset,
      cfg.slotY + feedDirY * offset,
      cfg.slotZ + feedDirZ * offset,
    )
    markFocusSharp(mesh)

    webglScene.add(mesh)

    activeSheets[printer] = {
      id,
      printer,
      mesh,
      geo,
      mat,
      tex,
      width: paperW,
      height: paperH,
      tiltX: cfg.tiltX,
      feedDirX,
      feedDirY,
      feedDirZ,
      slotX: cfg.slotX,
      slotY: cfg.slotY,
      slotZ: cfg.slotZ,
      emerged: initialEmerged,
      targetEmerged: Math.max(36, paperH + cfg.extraFeed),
      feedSpeed: cfg.feedSpeed,
      vx: 0,
      vy: 0,
      vz: 0,
      dropTime: 0,
      startDropRotX: cfg.tiltX,
      targetFloorYaw: 0,
      floorY: 3,
      yawOffset: 0,
      placedBackup: null,
    }

    return droppedPrevious
  }

  const getZebraLabelTargets = (): Array<InstanceType<ThreeModule['Mesh']>> => {
    const targets: Array<InstanceType<ThreeModule['Mesh']>> = []
    if (activeSheets.zebra && activeSheets.zebra !== heldLabel) {
      targets.push(activeSheets.zebra.mesh)
    }
    for (const s of placedLabels) {
      if (s !== heldLabel) targets.push(s.mesh)
    }
    for (const s of droppingSheets) {
      if (s.printer === 'zebra' && s !== heldLabel) targets.push(s.mesh)
    }
    for (const s of landedSheets) {
      if (s.printer === 'zebra' && s !== heldLabel) targets.push(s.mesh)
    }
    return targets
  }

  const getPlacedLabelSurfaces = (): Array<
    InstanceType<ThreeModule['Mesh']>
  > => {
    const surfaces: Array<InstanceType<ThreeModule['Mesh']>> = []
    for (const s of placedLabels) {
      if (s !== heldLabel) surfaces.push(s.mesh)
    }
    return surfaces
  }

  const getAllSheetMeshes = (): Array<InstanceType<ThreeModule['Mesh']>> => {
    const meshes: Array<InstanceType<ThreeModule['Mesh']>> = []
    if (activeSheets.zebra && activeSheets.zebra !== heldLabel) {
      meshes.push(activeSheets.zebra.mesh)
    }
    if (activeSheets.epson) {
      meshes.push(activeSheets.epson.mesh)
    }
    for (const s of placedLabels) {
      if (s !== heldLabel) meshes.push(s.mesh)
    }
    for (const s of droppingSheets) {
      if (s !== heldLabel) meshes.push(s.mesh)
    }
    for (const s of landedSheets) {
      if (s !== heldLabel) meshes.push(s.mesh)
    }
    return meshes
  }

  const hasHeldLabel = () => heldLabel !== null
  const canPlaceHeldLabel = () => heldLabel !== null && heldSurfaceValid

  const attachPreviewBorder = (sheet: PrintedSheet) => {
    previewBorderLines.scale.set(sheet.width + 10, sheet.height + 10, 1)
    previewBorderLines.position.set(0, 0, 1.2)
    previewBorderLines.visible = true
    sheet.mesh.add(previewBorderLines)
  }

  const detachPreviewBorder = (sheet: PrintedSheet) => {
    if (previewBorderLines.parent === sheet.mesh) {
      sheet.mesh.remove(previewBorderLines)
    }
    previewBorderLines.visible = false
  }

  const pickUpLabel = (
    target: InstanceType<ThreeModule['Object3D']> | string,
  ): boolean => {
    if (disposed || heldLabel !== null) return false

    const matches = (s: PrintedSheet) =>
      typeof target === 'string'
        ? s.id === target || s.mesh.userData.tabletId === target
        : s.mesh === target

    let picked: PrintedSheet | null = null
    let backup: PlacedBackup | null = null

    if (activeSheets.zebra && matches(activeSheets.zebra)) {
      picked = activeSheets.zebra
      activeSheets.zebra = null
    } else {
      const placedIdx = placedLabels.findIndex(matches)
      if (placedIdx >= 0) {
        picked = placedLabels.splice(placedIdx, 1)[0]
        backup = {
          parent: picked.mesh.parent ?? webglScene,
          pos: picked.mesh.position.clone(),
          quat: picked.mesh.quaternion.clone(),
          yawOffset: picked.yawOffset,
        }
      } else {
        const dropIdx = droppingSheets.findIndex(
          (s) => s.printer === 'zebra' && matches(s),
        )
        if (dropIdx >= 0) {
          picked = droppingSheets.splice(dropIdx, 1)[0]
        } else {
          const landIdx = landedSheets.findIndex(
            (s) => s.printer === 'zebra' && matches(s),
          )
          if (landIdx >= 0) {
            picked = landedSheets.splice(landIdx, 1)[0]
          }
        }
      }
    }

    if (!picked) return false

    webglScene.attach(picked.mesh)
    picked.mat.clippingPlanes = null
    picked.mat.polygonOffset = true
    picked.mat.polygonOffsetFactor = -3
    picked.mat.polygonOffsetUnits = -3
    picked.mat.needsUpdate = true
    picked.mesh.castShadow = false
    picked.placedBackup = backup
    if (!backup) {
      picked.yawOffset = 0
    }

    attachPreviewBorder(picked)
    heldLabel = picked
    heldSurfaceValid = false
    heldCommitObject = null
    return true
  }

  const rotateHeldLabel = (deltaRad = Math.PI / 4) => {
    if (!heldLabel) return
    heldLabel.yawOffset = (heldLabel.yawOffset + deltaRad) % (Math.PI * 2)
  }

  const isDescendantOf = (
    obj: InstanceType<ThreeModule['Object3D']> | null,
    ancestor: InstanceType<ThreeModule['Object3D']> | null,
  ): boolean => {
    if (!obj || !ancestor) return false
    let cur: InstanceType<ThreeModule['Object3D']> | null = obj
    while (cur) {
      if (cur === ancestor) return true
      cur = cur.parent
    }
    return false
  }

  const updateHeldLabelPreview = (
    raycaster: InstanceType<ThreeModule['Raycaster']>,
    camera: InstanceType<ThreeModule['PerspectiveCamera']>,
    cameraYaw: number,
    placeableSurfaces: Array<InstanceType<ThreeModule['Object3D']>>,
    dt: number,
  ): boolean => {
    if (!heldLabel) {
      heldSurfaceValid = false
      return false
    }

    const lerp = 1 - Math.exp(-22 * dt)
    const hits = raycaster.intersectObjects(placeableSurfaces, false)
    const hit = hits.find(
      (h) => h.object !== heldLabel?.mesh && h.distance <= 28000 && Boolean(h.face),
    )

    if (hit && hit.face) {
      tmpNormal
        .copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld)
        .normalize()
      tmpToCam.copy(camera.position).sub(hit.point)
      if (tmpNormal.dot(tmpToCam) < 0) {
        tmpNormal.negate()
      }

      if (Math.abs(tmpNormal.y) > 0.85) {
        // Horizontal surface (e.g. tabletop): orient top of label away from viewer so text reads right-side up
        tmpUp.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
        tmpUp.addScaledVector(tmpNormal, -tmpUp.dot(tmpNormal))
        if (tmpUp.lengthSq() < 1e-5) {
          tmpUp.set(0, 0, -1)
        } else {
          tmpUp.normalize()
        }
      } else {
        // Vertical / sloped surface: orient top of label upward
        tmpUp.copy(worldUp).addScaledVector(tmpNormal, -tmpNormal.y).normalize()
      }

      if (heldLabel.yawOffset !== 0) {
        tmpRotQuat.setFromAxisAngle(tmpNormal, -heldLabel.yawOffset)
        tmpUp.applyQuaternion(tmpRotQuat).normalize()
      }

      // Exact right-handed orthonormal basis (X = Y × Z -> det = +1, never mirrors barcodes/QR!)
      tmpRight.crossVectors(tmpUp, tmpNormal).normalize()
      tmpUp.crossVectors(tmpNormal, tmpRight).normalize()
      tmpBasisMat.makeBasis(tmpRight, tmpUp, tmpNormal)
      tmpTargetQuat.setFromRotationMatrix(tmpBasisMat)

      tmpTargetPos.copy(hit.point).addScaledVector(tmpNormal, 8)
      heldLabel.mesh.position.lerp(tmpTargetPos, lerp)
      heldLabel.mesh.quaternion.slerp(tmpTargetQuat, lerp)

      heldCommitPoint.copy(hit.point)
      heldCommitNormal.copy(tmpNormal)
      heldCommitQuat.copy(tmpTargetQuat)
      heldCommitObject = hit.object
      heldSurfaceValid = true
      previewBorderMat.color.set('#1ec9a8')
      return true
    }

    // No surface hit under cursor: hold label in lower-left view so user sees it clearly
    heldSurfaceValid = false
    heldCommitObject = null
    previewBorderMat.color.set('#f59e0b')

    const handX = -Math.min(260, Math.max(120, 195 * Math.min(camera.aspect, 1.45)))
    tmpHandLocal.set(handX, -220, -680)
    tmpTargetPos.copy(tmpHandLocal).applyMatrix4(camera.matrixWorld)
    tmpHandQuat.setFromEuler(tmpHandEuler)
    tmpTargetQuat.copy(camera.quaternion).multiply(tmpHandQuat)

    heldLabel.mesh.position.lerp(tmpTargetPos, lerp)
    heldLabel.mesh.quaternion.slerp(tmpTargetQuat, lerp)
    return false
  }

  const placeHeldLabel = (): boolean => {
    if (!heldLabel || !heldSurfaceValid) return false
    const sheet = heldLabel
    heldLabel = null
    heldSurfaceValid = false

    detachPreviewBorder(sheet)

    // Slight incremental normal offset (1.8 .. 3.4 units = ~0.5 mm) prevents Z-fighting even when overlapping labels
    const stackLift = 1.8 + (placedStackCounter % 16) * 0.12
    placedStackCounter++

    sheet.mesh.position
      .copy(heldCommitPoint)
      .addScaledVector(heldCommitNormal, stackLift)
    sheet.mesh.quaternion.copy(heldCommitQuat)
    sheet.mesh.updateMatrixWorld(true)

    if (drawerTrayGroup && isDescendantOf(heldCommitObject, drawerTrayGroup)) {
      drawerTrayGroup.attach(sheet.mesh)
    } else {
      webglScene.attach(sheet.mesh)
    }

    sheet.mat.polygonOffset = true
    sheet.mat.polygonOffsetFactor = -2
    sheet.mat.polygonOffsetUnits = -2
    sheet.mat.needsUpdate = true
    sheet.mesh.castShadow = false
    sheet.mesh.receiveShadow = true
    sheet.mesh.userData = {
      tabletTitle: 'Zebra-Etikett',
      tabletId: sheet.id,
      labelId: sheet.id,
      kind: 'zebra-label' as const,
    }
    sheet.placedBackup = null

    placedLabels.push(sheet)
    while (placedLabels.length > MAX_PLACED_LABELS) {
      const oldest = placedLabels.shift()
      if (oldest) disposeSheet(oldest)
    }

    heldCommitObject = null
    return true
  }

  const cancelHeldLabel = () => {
    if (!heldLabel) return
    const sheet = heldLabel
    heldLabel = null
    heldSurfaceValid = false
    heldCommitObject = null

    detachPreviewBorder(sheet)

    if (sheet.placedBackup) {
      const b = sheet.placedBackup
      sheet.placedBackup = null
      sheet.yawOffset = b.yawOffset
      b.parent.add(sheet.mesh)
      sheet.mesh.position.copy(b.pos)
      sheet.mesh.quaternion.copy(b.quat)
      sheet.mat.polygonOffset = true
      sheet.mat.polygonOffsetFactor = -2
      sheet.mat.polygonOffsetUnits = -2
      sheet.mat.needsUpdate = true
      placedLabels.push(sheet)
      return
    }

    // Drop gently from current desk/hand height onto the floor
    sheet.mesh.castShadow = true
    detachSheetToFloor(sheet)
  }

  const setZebraMedia = (media: ZebraMediaInfo) => {
    activeZebraMedia = media
  }

  const getZebraMedia = () => activeZebraMedia

  const printZpl = (
    zpl: string,
    logMeta?: PrintLogMeta,
  ): PrintJobOutcome => {
    const rendered = renderZplToCanvas(zpl, {
      defaultWidthDots: activeZebraMedia.widthPx,
      defaultHeightDots: activeZebraMedia.heightPx,
    })
    const droppedPrevious = spawnSheetFromCanvas('zebra', rendered.canvas)

    const metaSummary = {
      printer: 'zebra' as const,
      protocol: 'zpl' as const,
      sender: logMeta?.sender ?? 'unknown',
      origin: logMeta?.origin,
      messageName: logMeta?.messageName,
      jobId: logMeta?.jobId,
      timestamp: new Date().toISOString(),
      charLength: zpl.length,
      dpi: activeZebraMedia.dpi,
      reel: activeZebraMedia.id,
      renderedSizeDots: {
        width: rendered.widthDots,
        height: rendered.heightDots,
      },
      droppedPrevious,
      commandsUsed: rendered.commandsUsed,
      unhandledCommands: rendered.unhandledCommands,
    }

    console.group(
      `[scene3d:print] ZPL -> Zebra ZD420 (from ${metaSummary.sender}${metaSummary.jobId ? `, jobId=${metaSummary.jobId}` : ''
      })`,
    )
    console.log('meta:', metaSummary)
    console.log('zpl content:\n' + zpl)
    if (rendered.unhandledCommands.length > 0) {
      console.warn(
        'unhandled ZPL commands (candidates for emulation):',
        rendered.unhandledCommands,
      )
    }
    console.groupEnd()

    return {
      printer: 'zebra',
      droppedPrevious,
      kickDrawer: false,
      dpi: activeZebraMedia.dpi,
      widthPx: rendered.widthDots,
      heightPx: rendered.heightDots,
    }
  }

  const printEscPos: PrintManager['printEscPos'] = (input, logMeta) => {
    const bytes = normalizeEscPosBytes(input)
    const rendered = renderEscPosToCanvas(bytes)
    const droppedPrevious = spawnSheetFromCanvas('epson', rendered.canvas)

    const inputFormat =
      input.bytes instanceof Uint8Array || Array.isArray(input.bytes) || Array.isArray(input.data)
        ? 'bytes'
        : typeof input.base64 === 'string' || input.encoding === 'base64'
          ? 'base64'
          : 'string'

    const metaSummary = {
      printer: 'epson' as const,
      protocol: 'escpos' as const,
      sender: logMeta?.sender ?? 'unknown',
      origin: logMeta?.origin,
      messageName: logMeta?.messageName,
      jobId: logMeta?.jobId,
      timestamp: new Date().toISOString(),
      inputFormat,
      encoding: typeof input.encoding === 'string' ? input.encoding : undefined,
      byteLength: bytes.length,
      renderedSizeDots: {
        width: rendered.widthDots,
        height: rendered.heightDots,
      },
      kickDrawer: rendered.kickDrawer,
      droppedPrevious,
      commandsUsed: rendered.commandsUsed,
      unhandledCommands: rendered.unhandledCommands,
    }

    console.group(
      `[scene3d:print] ESC/POS -> Epson TM-m30III (from ${metaSummary.sender}, ${bytes.length} bytes${metaSummary.jobId ? `, jobId=${metaSummary.jobId}` : ''
      })`,
    )
    console.log('meta:', metaSummary)
    console.log('readable content:\n' + formatEscPosReadable(bytes))
    console.log('raw payload:', {
      base64: escPosBytesToBase64(bytes),
      bytes,
      originalData: input,
    })
    if (rendered.unhandledCommands.length > 0) {
      console.warn(
        'unhandled ESC/POS commands (candidates for emulation):',
        rendered.unhandledCommands,
      )
    }
    console.groupEnd()

    return {
      printer: 'epson',
      droppedPrevious,
      kickDrawer: rendered.kickDrawer,
      dpi: ZEBRA_DPI,
      widthPx: rendered.widthDots,
      heightPx: rendered.heightDots,
    }
  }

  const update = (dt: number) => {
    if (disposed) return

    // 1. Animate feeding sheets emerging out of the printer slots
    let epsonFeeding = false
    for (const kind of ['zebra', 'epson'] as const) {
      const sheet = activeSheets[kind]
      if (!sheet) continue

      if (sheet.emerged < sheet.targetEmerged) {
        if (kind === 'epson') epsonFeeding = true
        sheet.emerged = Math.min(
          sheet.targetEmerged,
          sheet.emerged + sheet.feedSpeed * dt,
        )
        const offset = sheet.emerged - sheet.height / 2
        sheet.mesh.position.set(
          sheet.slotX + sheet.feedDirX * offset,
          sheet.slotY + sheet.feedDirY * offset,
          sheet.slotZ + sheet.feedDirZ * offset,
        )
      }
    }

    if (epsonNetLedMat) {
      if (epsonFeeding) {
        ledBlinkPhase += dt * 28
        epsonNetLedMat.emissiveIntensity =
          Math.sin(ledBlinkPhase) > 0 ? 1.35 : 0.18
      } else if (epsonNetLedMat.emissiveIntensity !== 0.8) {
        epsonNetLedMat.emissiveIntensity = 0.8
      }
    }

    // 2. Animate previous sheets sliding off the desk front edge and fluttering to the floor
    const tableFrontEdgeZ = TABLE_Z + TABLE_D / 2
    for (let i = droppingSheets.length - 1; i >= 0; i--) {
      const s = droppingSheets[i]
      s.dropTime += dt

      const pos = s.mesh.position
      const clearOfTable = pos.z - s.height * 0.44 >= tableFrontEdgeZ + 36

        if (!clearOfTable && pos.y >= TABLE_TOP_Y - 20) {
          // Glide briskly forward off the front edge of the table without clipping into the wood
          pos.x += s.vx * 0.35 * dt
          pos.z += s.vz * dt
          pos.y = Math.max(TABLE_TOP_Y + 24, pos.y + s.vy * dt)
          const slideT = Math.min(1, s.dropTime / 0.25)
          s.mesh.rotation.x =
            s.startDropRotX + (-Math.PI * 0.44 - s.startDropRotX) * slideT
        } else {
          // Freefall with aerodynamic paper drag & gentle flutter
          s.vy += GRAVITY * dt
          // Terminal velocity of a paper receipt/label (~ 2.3 m/s = 9200 units/s)
          if (s.vy < -6200) s.vy = -6200

          const airDrag = Math.exp(-2.1 * dt)
          s.vx *= airDrag
          s.vz *= airDrag

          const flutterX = Math.sin(s.dropTime * 9.5) * 420 * dt
          pos.x += s.vx * dt + flutterX
          pos.y += s.vy * dt
          pos.z += s.vz * dt

          // Smoothly level out to face-up (-PI/2) as it approaches the floor
          const fallProgress = Math.min(
            1,
            Math.max(0, 1 - (pos.y - s.floorY) / TABLE_TOP_Y),
          )
          const flutterRoll =
            Math.sin(s.dropTime * 10.5) * 0.16 * (1 - fallProgress)
          const targetPitch = -Math.PI / 2
          s.mesh.rotation.x +=
            (targetPitch - s.mesh.rotation.x) * (1 - Math.exp(-8 * dt))
          s.mesh.rotation.y +=
            (s.targetFloorYaw - s.mesh.rotation.y) * (1 - Math.exp(-5 * dt))
          s.mesh.rotation.z = flutterRoll
        }

        if (pos.y <= s.floorY) {
          pos.y = s.floorY
          s.mesh.rotation.set(-Math.PI / 2, s.targetFloorYaw, 0, 'YXZ')
          droppingSheets.splice(i, 1)
          landedSheets.push(s)

          while (landedSheets.length > MAX_FLOOR_SHEETS) {
            const oldest = landedSheets.shift()
            if (oldest) disposeSheet(oldest)
          }
        }
      }
    }

    const dispose = () => {
      if (disposed) return
      disposed = true
      if (heldLabel) {
        disposeSheet(heldLabel)
        heldLabel = null
      }
      for (const kind of ['zebra', 'epson'] as const) {
        const s = activeSheets[kind]
        if (s) {
          disposeSheet(s)
          activeSheets[kind] = null
        }
      }
      for (const s of droppingSheets) disposeSheet(s)
      droppingSheets.length = 0
      for (const s of landedSheets) disposeSheet(s)
      landedSheets.length = 0
      for (const s of placedLabels) disposeSheet(s)
      placedLabels.length = 0
      previewBorderGeo.dispose()
      previewBorderMat.dispose()
    }

    return {
      setZebraMedia,
      getZebraMedia,
      printZpl,
      printEscPos,
      getZebraLabelTargets,
      getPlacedLabelSurfaces,
      getAllSheetMeshes,
      hasHeldLabel,
      canPlaceHeldLabel,
      pickUpLabel,
      rotateHeldLabel,
      updateHeldLabelPreview,
      placeHeldLabel,
      cancelHeldLabel,
      update,
      dispose,
    }
  }
