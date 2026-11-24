import { SCANNER_X, SCANNER_Z, TABLE_TOP_Y } from '../config'
import { markFocusSharp } from '../focusBlurPass'
import type { Disposable, ThreeModule } from '../types'

export interface ScannerPoseUpdate {
  held: boolean
  dt: number
  camera: InstanceType<ThreeModule['PerspectiveCamera']>
  aspect: number
  aimWorldPoint: InstanceType<ThreeModule['Vector3']> | null
  hitNormal: InstanceType<ThreeModule['Vector3']> | null
  hoverAmount: number
  dockHoverAmount: number
  triggerAnim: number
  successFlash: number
  moveSpeedNorm: number
  timeSec: number
}

interface HandleStation {
  y: number
  z: number
  rx: number
  rzFront: number
  rzBack: number
  p: number
}

interface HoodStation {
  z: number
  y: number
  rx: number
  ryTop: number
  ryBot: number
  p: number
  visorSlant?: number
  sideGroove?: number
  rearRib?: number
}

function signedPow(val: number, exp: number): number {
  return Math.sign(val) * Math.pow(Math.abs(val), exp)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

function sampleHandleStation(stations: HandleStation[], u: number): HandleStation {
  const clamped = Math.max(0, Math.min(1, u))
  const scaled = clamped * (stations.length - 1)
  const i1 = Math.min(stations.length - 2, Math.floor(scaled))
  const t = scaled - i1
  const s0 = stations[Math.max(0, i1 - 1)]
  const s1 = stations[i1]
  const s2 = stations[i1 + 1]
  const s3 = stations[Math.min(stations.length - 1, i1 + 2)]

  return {
    y: catmullRom(s0.y, s1.y, s2.y, s3.y, t),
    z: catmullRom(s0.z, s1.z, s2.z, s3.z, t),
    rx: Math.max(6, catmullRom(s0.rx, s1.rx, s2.rx, s3.rx, t)),
    rzFront: Math.max(6, catmullRom(s0.rzFront, s1.rzFront, s2.rzFront, s3.rzFront, t)),
    rzBack: Math.max(6, catmullRom(s0.rzBack, s1.rzBack, s2.rzBack, s3.rzBack, t)),
    p: Math.max(1.8, Math.min(4.0, catmullRom(s0.p, s1.p, s2.p, s3.p, t))),
  }
}

function evalHandlePoint(
  st: HandleStation,
  theta: number,
  radialOffset = 0,
): [number, number, number] {
  const exp = 2 / st.p
  const sinT = Math.sin(theta)
  const cosT = Math.cos(theta)
  const rx = st.rx + radialOffset
  const rz = (cosT >= 0 ? st.rzFront : st.rzBack) + radialOffset
  const x = rx * signedPow(sinT, exp)
  const z = st.z + rz * signedPow(cosT, exp)
  return [x, st.y, z]
}

/**
 * Builds the continuous ergonomic lime-yellow handle + neck body with domed end caps.
 */
function createHandleCoreGeometry(
  THREE: ThreeModule,
  stations: HandleStation[],
  verticalSteps: number,
  radialSegments: number,
) {
  const rings: HandleStation[] = []
  for (let i = 0; i <= verticalSteps; i++) {
    rings.push(sampleHandleStation(stations, i / verticalSteps))
  }

  const positions: number[] = []
  const indices: number[] = []
  const stride = radialSegments + 1

  for (let r = 0; r < rings.length; r++) {
    const st = rings[r]
    for (let c = 0; c <= radialSegments; c++) {
      const theta = (c / radialSegments) * Math.PI * 2
      const [x, y, z] = evalHandlePoint(st, theta, 0)
      positions.push(x, y, z)
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    for (let c = 0; c < radialSegments; c++) {
      const a = r * stride + c
      const b = a + 1
      const d = (r + 1) * stride + c
      const e = d + 1
      indices.push(a, b, e, a, e, d)
    }
  }

  // Bottom & top center caps
  const bottomSt = rings[0]
  const bottomCenterIdx = positions.length / 3
  positions.push(0, bottomSt.y - 3, bottomSt.z)
  for (let c = 0; c < radialSegments; c++) {
    indices.push(bottomCenterIdx, c + 1, c)
  }

  const topSt = rings[rings.length - 1]
  const topRingStart = (rings.length - 1) * stride
  const topCenterIdx = positions.length / 3
  positions.push(0, topSt.y + 4, topSt.z)
  for (let c = 0; c < radialSegments; c++) {
    indices.push(topCenterIdx, topRingStart + c, topRingStart + c + 1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Builds the contoured black rubber lower-grip overmold with the iconic stepped
 * side seam exposing the lime-yellow rear spine and wrapping 360 deg around the heel.
 */
function createRubberGripOvermoldGeometry(
  THREE: ThreeModule,
  stations: HandleStation[],
  uMax: number,
  verticalSteps: number,
  radialSegments: number,
) {
  const positions: number[] = []
  const indices: number[] = []
  const stride = radialSegments + 1

  // Half-angle (in radians from +Z front) covered by the black rubber overmold at height y
  const getCoverageHalfAngle = (y: number): number => {
    // Full 360 deg wrap at bottom pommel heel (y <= 54)
    if (y <= 52) return Math.PI
    // Smoothly open up the rear lime spine above the heel
    const heelOpen = smoothstep(52, 74, y)
    // Lower back has wider lime spine (~0.56*PI coverage); mid-grip steps backward to ~0.73*PI
    const stepJog = smoothstep(144, 178, y)
    const spineHalfAngle = 0.56 * Math.PI + (0.73 * Math.PI - 0.56 * Math.PI) * stepJog
    return Math.PI * (1 - heelOpen) + spineHalfAngle * heelOpen
  }

  // Extra bottom bevel rings for a clean flat-bottomed rubber foot resting at y = 0
  const baseSt = sampleHandleStation(stations, 0)
  const rings: Array<{
    st: HandleStation
    yOverride?: number
    baseScale?: number
    topFeather: number
  }> = [
    { st: baseSt, yOverride: 0, baseScale: 0.78, topFeather: 1 },
    { st: baseSt, yOverride: 4, baseScale: 0.96, topFeather: 1 },
    { st: baseSt, yOverride: 10, baseScale: 1.01, topFeather: 1 },
  ]

  for (let i = 0; i <= verticalSteps; i++) {
    const t = i / verticalSteps
    const u = t * uMax
    const st = sampleHandleStation(stations, u)
    // Feather the top horizontal parting seam cleanly into the lime handle
    const topFeather = 1 - smoothstep(0.92, 1.0, t)
    rings.push({ st, topFeather })
  }

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]
    const st = ring.st
    const yVal = ring.yOverride ?? st.y
    const maxAngle = ring.yOverride !== undefined ? Math.PI : getCoverageHalfAngle(yVal)

    for (let c = 0; c <= radialSegments; c++) {
      // Map c from -1..1 so the mesh wraps symmetrically from -maxAngle to +maxAngle
      const frac = (c / radialSegments) * 2 - 1
      const theta = frac * maxAngle
      const edgeDist = 1 - Math.abs(frac)

      let radialOffset: number
      if (ring.yOverride !== undefined) {
        const scale = ring.baseScale ?? 1
        const [bx, , bz] = evalHandlePoint(st, theta, 2.8)
        const sx = bx * scale
        const sz = st.z + (bz - st.z) * scale
        positions.push(sx, yVal, sz)
        continue
      } else {
        // When wrapping full 360 deg at heel, no side seam feather needed
        const sideFeather =
          maxAngle >= Math.PI - 0.01 ? 1 : smoothstep(0, 0.075, edgeDist)
        const seamFactor = Math.min(sideFeather, ring.topFeather)
        // Raised +2.7 units proud of the lime core, tucking -1.4 units inside at the bevel edge
        radialOffset = -1.4 + 4.1 * seamFactor
      }

      const [x, y, z] = evalHandlePoint(st, theta, radialOffset)
      positions.push(x, y, z)
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    for (let c = 0; c < radialSegments; c++) {
      const a = r * stride + c
      const b = a + 1
      const d = (r + 1) * stride + c
      const e = d + 1
      indices.push(a, b, e, a, e, d)
    }
  }

  // Flat underside cap at y = 0
  const bottomCenterIdx = positions.length / 3
  positions.push(0, 0, baseSt.z)
  for (let c = 0; c < radialSegments; c++) {
    indices.push(bottomCenterIdx, c + 1, c)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Builds a smooth horizontal loft along Z (used for both the continuous black rubber
 * head hood + recessed mouth tunnel AND the inner lime-yellow head dome).
 */
function createHorizontalLoftGeometry(
  THREE: ThreeModule,
  stations: HoodStation[],
  radialSegments: number,
  capStart = false,
  capEnd = false,
) {
  const positions: number[] = []
  const indices: number[] = []
  const stride = radialSegments + 1

  for (let s = 0; s < stations.length; s++) {
    const st = stations[s]
    const exp = 2 / st.p
    const slant = st.visorSlant ?? 0
    const groove = st.sideGroove ?? 0
    const rib = st.rearRib ?? 0

    for (let c = 0; c <= radialSegments; c++) {
      const theta = (c / radialSegments) * Math.PI * 2
      const cosT = Math.cos(theta)
      const sinT = Math.sin(theta)
      const ry = sinT >= 0 ? st.ryTop : st.ryBot

      let rxLocal = st.rx
      // Signature horizontal recessed groove along the left & right flanks of the black bumper
      if (groove !== 0) {
        const sideBand = Math.exp(-Math.pow((sinT - 0.04) / 0.24, 2))
        const flankMask = Math.pow(Math.abs(cosT), 2.5)
        rxLocal -= groove * sideBand * flankMask
      }
      // Subtle twin-rib contour wrapping around the rear bumper band
      if (rib !== 0) {
        const beltBand = Math.exp(-Math.pow((sinT - 0.04) / 0.36, 2))
        rxLocal += rib * beltBand
      }

      const x = rxLocal * signedPow(cosT, exp)
      const yLocal = ry * signedPow(sinT, exp)
      const y = st.y + yLocal
      const z = st.z + slant * (yLocal / Math.max(1, st.ryTop))

      positions.push(x, y, z)
    }
  }

  for (let s = 0; s < stations.length - 1; s++) {
    for (let c = 0; c < radialSegments; c++) {
      const a = s * stride + c
      const b = a + 1
      const d = (s + 1) * stride + c
      const e = d + 1
      indices.push(a, b, e, a, e, d)
    }
  }

  if (capStart) {
    const first = stations[0]
    const centerIdx = positions.length / 3
    positions.push(0, first.y, first.z - 2)
    for (let c = 0; c < radialSegments; c++) {
      indices.push(centerIdx, c + 1, c)
    }
  }

  if (capEnd) {
    const last = stations[stations.length - 1]
    const lastStart = (stations.length - 1) * stride
    const centerIdx = positions.length / 3
    positions.push(0, last.y, last.z + 2)
    for (let c = 0; c < radialSegments; c++) {
      indices.push(centerIdx, lastStart + c, lastStart + c + 1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Builds a gently curved superellipse acrylic scan window that sits cleanly inside
 * the recessed optical cavity with zero protruding corners.
 */
function createCurvedLensGeometry(
  THREE: ThreeModule,
  rx: number,
  ry: number,
  p: number,
  bulgeZ: number,
  radialSegments = 40,
  rings = 6,
) {
  const positions: number[] = []
  const indices: number[] = []
  const exp = 2 / p

  // Center vertex
  positions.push(0, 0, bulgeZ)

  for (let r = 1; r <= rings; r++) {
    const frac = r / rings
    const zCurve = bulgeZ * (1 - frac * frac)
    for (let c = 0; c < radialSegments; c++) {
      const theta = (c / radialSegments) * Math.PI * 2
      const x = rx * frac * signedPow(Math.cos(theta), exp)
      const y = ry * frac * signedPow(Math.sin(theta), exp)
      positions.push(x, y, zCurve)
    }
  }

  // Inner fan
  for (let c = 0; c < radialSegments; c++) {
    const next = (c + 1) % radialSegments
    indices.push(0, 1 + c, 1 + next)
  }

  // Outer rings
  for (let r = 1; r < rings; r++) {
    const innerStart = 1 + (r - 1) * radialSegments
    const outerStart = 1 + r * radialSegments
    for (let c = 0; c < radialSegments; c++) {
      const next = (c + 1) % radialSegments
      const a = innerStart + c
      const b = innerStart + next
      const d = outerStart + c
      const e = outerStart + next
      indices.push(a, d, e, a, e, b)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Subtle dark-on-dark molded rubber logo badge for the top-front brow of the scanner hood.
 */
function createHoodEmblemTexture(THREE: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, 256, 96)

  // Molded recessed pill background
  ctx.fillStyle = '#14171c'
  ctx.beginPath()
  ctx.roundRect(10, 12, 236, 72, 36)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 3
  ctx.stroke()

  // Subtle molded relief wordmark
  ctx.fillStyle = '#323842'
  ctx.font = 'italic 800 34px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('QuixScan', 128, 49)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function buildBarcodeScanner(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  // Refined dual-shot materials matching the rugged lime-yellow & matte-black wireless scanner
  const scannerLimeMat = new THREE.MeshPhysicalMaterial({
    color: '#c9e53d',
    roughness: 0.3,
    metalness: 0.03,
    clearcoat: 0.38,
    clearcoatRoughness: 0.26,
  })
  const scannerRubberMat = new THREE.MeshPhysicalMaterial({
    color: '#191c22',
    roughness: 0.58,
    metalness: 0.06,
    clearcoat: 0.08,
    clearcoatRoughness: 0.65,
  })
  const scannerTriggerMat = new THREE.MeshPhysicalMaterial({
    color: '#14171d',
    roughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.22,
    clearcoatRoughness: 0.35,
  })
  const scannerRecessMat = new THREE.MeshStandardMaterial({
    color: '#0e1116',
    roughness: 0.75,
    metalness: 0.05,
  })
  const scannerLensMat = new THREE.MeshPhysicalMaterial({
    color: '#080c14',
    roughness: 0.05,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 0.94,
    transparent: true,
    opacity: 0.78,
  })
  const scannerOpticRingMat = new THREE.MeshStandardMaterial({
    color: '#202632',
    roughness: 0.35,
    metalness: 0.45,
  })
  const scannerBeamMat = new THREE.MeshStandardMaterial({
    color: '#ef4444',
    emissive: '#ef4444',
    emissiveIntensity: 0.9,
  })
  const scannerStatusLedMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    emissive: '#1ec9a8',
    emissiveIntensity: 0.9,
  })

  const hoodEmblemTex = createHoodEmblemTexture(THREE)
  const hoodEmblemMat = new THREE.MeshStandardMaterial({
    map: hoodEmblemTex,
    transparent: true,
    roughness: 0.46,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })

  // Subtle tabletop cradle pad so the user can also click the stand spot to return the scanner
  const dockPadMat = new THREE.MeshStandardMaterial({
    color: '#141923',
    roughness: 0.72,
    metalness: 0.12,
  })
  const dockRingMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    emissive: '#0f9f86',
    emissiveIntensity: 0.15,
    roughness: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const dockPadGeo = new THREE.CylinderGeometry(86, 94, 8, 32)
  const dockRingGeo = new THREE.RingGeometry(72, 84, 32)

  // 1. Ergonomic contoured handle spline (bottom heel -> palm grip -> upper lime neck -> head belly)
  const handleStations: HandleStation[] = [
    { y: 12, z: 16, rx: 47, rzFront: 72, rzBack: 48, p: 2.35 },
    { y: 34, z: 19, rx: 53, rzFront: 78, rzBack: 53, p: 2.35 },
    { y: 66, z: 6, rx: 48, rzFront: 56, rzBack: 49, p: 2.25 },
    { y: 124, z: -1, rx: 46, rzFront: 51, rzBack: 51, p: 2.2 },
    { y: 198, z: 1, rx: 47, rzFront: 52, rzBack: 55, p: 2.2 },
    { y: 274, z: 9, rx: 49, rzFront: 55, rzBack: 57, p: 2.25 },
    { y: 348, z: 24, rx: 54, rzFront: 61, rzBack: 61, p: 2.35 },
    { y: 412, z: 43, rx: 67, rzFront: 72, rzBack: 74, p: 2.45 },
    { y: 458, z: 58, rx: 82, rzFront: 82, rzBack: 88, p: 2.55 },
  ]

  const handleCoreGeo = createHandleCoreGeometry(THREE, handleStations, 38, 48)
  // Rubber overmold covers from bottom heel (u=0) up to ~y=264 (u=0.565)
  const rubberGripGeo = createRubberGripOvermoldGeometry(
    THREE,
    handleStations,
    0.565,
    30,
    48,
  )

  // Subtle rear-bottom lanyard/hang loop tucked into the rubber heel
  const lanyardLoopGeo = new THREE.TorusGeometry(16, 4.2, 12, 24, Math.PI * 1.25)

  // 2. Sculpted ergonomic trigger + dark recessed trigger housing
  const triggerShape = new THREE.Shape()
  triggerShape.moveTo(-20, 44)
  triggerShape.lineTo(2, 42)
  // Smooth concave index-finger sweep
  triggerShape.bezierCurveTo(6, 18, 12, -2, 24, -22)
  // Plump rounded lower lip
  triggerShape.bezierCurveTo(30, -32, 26, -46, 12, -48)
  triggerShape.lineTo(-20, -42)
  triggerShape.closePath()

  const triggerGeo = new THREE.ExtrudeGeometry(triggerShape, {
    depth: 26,
    bevelEnabled: true,
    bevelThickness: 7,
    bevelSize: 5.5,
    bevelSegments: 4,
    curveSegments: 16,
  })
  // Center width on X=0 and orient so +X of the 2D shape points toward +Z (forward)
  triggerGeo.translate(0, 0, -13)
  triggerGeo.rotateY(-Math.PI / 2)

  const triggerPocketGeo = new THREE.CapsuleGeometry(22, 62, 10, 18)

  // 3. Sculpted head: inner lime-yellow core + raised top-rear lime dome (ends behind the scan cavity)
  const headLimeStations: HoodStation[] = [
    { z: -102, y: 12, rx: 62, ryTop: 42, ryBot: 34, p: 2.4 },
    { z: -90, y: 18, rx: 80, ryTop: 55, ryBot: 46, p: 2.45 },
    { z: -64, y: 20, rx: 92, ryTop: 58, ryBot: 54, p: 2.5 },
    { z: -26, y: 14, rx: 95, ryTop: 56, ryBot: 58, p: 2.5 },
    { z: 10, y: 6, rx: 90, ryTop: 50, ryBot: 54, p: 2.5 },
    { z: 30, y: 2, rx: 76, ryTop: 42, ryBot: 44, p: 2.4 },
  ]
  const headLimeGeo = createHorizontalLoftGeometry(
    THREE,
    headLimeStations,
    44,
    true,
    true,
  )

  // 4. Continuous black rubber hood + wrap-around bumper + rounded front mouth lip + recessed optical funnel
  const hoodStations: HoodStation[] = [
    // Rear bumper wrap-around collar (sits lower on top so the lime dome peeks out above)
    { z: -106, y: 6, rx: 62, ryTop: 32, ryBot: 26, p: 2.45, rearRib: 1.5 },
    { z: -98, y: 8, rx: 88, ryTop: 40, ryBot: 34, p: 2.55, rearRib: 3.5 },
    { z: -84, y: 10, rx: 104, ryTop: 44, ryBot: 38, p: 2.6, sideGroove: 3.0, rearRib: 2.5 },
    { z: -64, y: 11, rx: 108, ryTop: 46, ryBot: 40, p: 2.6, sideGroove: 7.5, rearRib: 1.0 },
    { z: -38, y: 12, rx: 108, ryTop: 48, ryBot: 43, p: 2.6, sideGroove: 8.5 },
    { z: -12, y: 14, rx: 108, ryTop: 56, ryBot: 48, p: 2.55, sideGroove: 7.0 },
    // Rising smoothly over the lime dome to form the protective forehead hood
    { z: 14, y: 12, rx: 109, ryTop: 68, ryBot: 56, p: 2.5, sideGroove: 3.5, visorSlant: 4 },
    { z: 42, y: 8, rx: 111, ryTop: 74, ryBot: 63, p: 2.45, visorSlant: 8 },
    { z: 74, y: 4, rx: 112, ryTop: 74, ryBot: 67, p: 2.45, visorSlant: 11 },
    { z: 100, y: 1, rx: 110, ryTop: 72, ryBot: 67, p: 2.45, visorSlant: 13 },
    // Smooth thick bevelled front rubber mouth rim
    { z: 112, y: 0, rx: 104, ryTop: 67, ryBot: 63, p: 2.45, visorSlant: 14 },
    { z: 117, y: 0, rx: 95, ryTop: 60, ryBot: 57, p: 2.45, visorSlant: 13 },
    { z: 114, y: 0, rx: 86, ryTop: 53, ryBot: 50, p: 2.45, visorSlant: 11 },
    // Deep recessed black optical cavity funnel
    { z: 96, y: 0, rx: 80, ryTop: 48, ryBot: 46, p: 2.4, visorSlant: 8 },
    { z: 66, y: 0, rx: 74, ryTop: 44, ryBot: 42, p: 2.35, visorSlant: 5 },
    { z: 38, y: 0, rx: 69, ryTop: 40, ryBot: 39, p: 2.35, visorSlant: 3 },
  ]
  const headHoodGeo = createHorizontalLoftGeometry(
    THREE,
    hoodStations,
    56,
    true,
    false,
  )

  // Curved obsidian-tinted acrylic scan window & dark optical backplate inside the recessed cavity
  const scanBackplateGeo = createCurvedLensGeometry(THREE, 71, 41, 2.35, 1, 32, 3)
  const scanLensGeo = createCurvedLensGeometry(THREE, 71, 41, 2.35, 7, 44, 6)
  // Internal optical lens ring & glowing horizontal scan bar
  const opticRingGeo = new THREE.TorusGeometry(22, 3.2, 12, 28)
  const scanBeamGeo = new THREE.BoxGeometry(92, 4.5, 4)

  // Top-front subtle curved emblem plane
  const hoodEmblemGeo = new THREE.PlaneGeometry(78, 30)
  // Top-rear black button/status bezel + glowing LED strip on the lime cap
  const topBezelGeo = new THREE.CapsuleGeometry(11, 28, 8, 16)
  const statusLedGeo = new THREE.CapsuleGeometry(3.2, 14, 6, 12)
  // Acoustic buzzer/speaker vent slots on both sides of the upper lime neck
  const speakerVentGeo = new THREE.CapsuleGeometry(1.8, 12, 4, 8)

  // 3D laser beam & surface laser crosshair visuals (hidden during optical spot screenshot!)
  const laserRayGeo = new THREE.CylinderGeometry(0.9, 1.8, 1, 8, 1, true)
  laserRayGeo.translate(0, 0.5, 0)
  laserRayGeo.rotateX(Math.PI / 2)
  const laserRayMat = new THREE.MeshBasicMaterial({
    color: '#ef4444',
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const laserLineHGeo = new THREE.PlaneGeometry(64, 3)
  const laserLineVGeo = new THREE.PlaneGeometry(2.5, 22)
  const laserCoreDotGeo = new THREE.CircleGeometry(4.5, 16)
  const laserSpotMat = new THREE.MeshBasicMaterial({
    color: '#ff3b3b',
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })
  const laserCoreMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  })

  disposables.push(
    scannerLimeMat,
    scannerRubberMat,
    scannerTriggerMat,
    scannerRecessMat,
    scannerLensMat,
    scannerOpticRingMat,
    scannerBeamMat,
    scannerStatusLedMat,
    hoodEmblemTex,
    hoodEmblemMat,
    dockPadMat,
    dockRingMat,
    dockPadGeo,
    dockRingGeo,
    handleCoreGeo,
    rubberGripGeo,
    lanyardLoopGeo,
    triggerGeo,
    triggerPocketGeo,
    headLimeGeo,
    headHoodGeo,
    scanBackplateGeo,
    scanLensGeo,
    opticRingGeo,
    scanBeamGeo,
    hoodEmblemGeo,
    topBezelGeo,
    statusLedGeo,
    speakerVentGeo,
    laserRayGeo,
    laserRayMat,
    laserLineHGeo,
    laserLineVGeo,
    laserCoreDotGeo,
    laserSpotMat,
    laserCoreMat,
  )

  const SCANNER_REST_SCALE = 0.65
  const SCANNER_HAND_SCALE = 0.46

  // Tabletop dock pad
  const dockGroup = new THREE.Group()
  dockGroup.position.set(SCANNER_X, TABLE_TOP_Y, SCANNER_Z)
  dockGroup.rotation.y = -0.36
  dockGroup.scale.set(SCANNER_REST_SCALE, 1, SCANNER_REST_SCALE)
  webglScene.add(dockGroup)

  const dockUserData = {
    tabletTitle: 'Scanner-Ablage',
    tabletId: 'scanner-dock',
    kind: 'scanner-dock' as const,
  }

  const dockPadMesh = new THREE.Mesh(dockPadGeo, dockPadMat)
  dockPadMesh.scale.set(0.88, 1, 1.24)
  dockPadMesh.position.set(0, 4, 24)
  dockPadMesh.receiveShadow = true
  dockPadMesh.userData = dockUserData
  dockGroup.add(dockPadMesh)

  const dockRingMesh = new THREE.Mesh(dockRingGeo, dockRingMat)
  dockRingMesh.rotation.x = -Math.PI / 2
  dockRingMesh.scale.set(0.88, 1.24, 1)
  dockRingMesh.position.set(0, 8.4, 24)
  dockRingMesh.userData = dockUserData
  dockGroup.add(dockRingMesh)
  markFocusSharp(dockGroup)

  const scannerDockTargets: Array<InstanceType<ThreeModule['Mesh']>> = [
    dockPadMesh,
    dockRingMesh,
  ]

  // Handheld scanner body
  const scannerGroup = new THREE.Group()
  scannerGroup.position.set(SCANNER_X, TABLE_TOP_Y + 5, SCANNER_Z)
  scannerGroup.rotation.y = -0.36
  scannerGroup.scale.setScalar(SCANNER_REST_SCALE)
  webglScene.add(scannerGroup)

  const scannerUserData = {
    tabletTitle: 'Barcode-Scanner',
    tabletId: 'barcode-scanner',
    kind: 'scanner' as const,
  }

  const scannerTargets: Array<InstanceType<ThreeModule['Mesh']>> = []
  const shadowCasters: Array<InstanceType<ThreeModule['Mesh']>> = []

  const registerScannerMesh = (
    mesh: InstanceType<ThreeModule['Mesh']>,
    castShadow = true,
    interactive = true,
  ) => {
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    if (castShadow) {
      shadowCasters.push(mesh)
    }
    if (interactive) {
      mesh.userData = scannerUserData
      scannerTargets.push(mesh)
    }
    return mesh
  }

  // Ergonomic lime-yellow handle + upper neck core
  const sHandleCore = registerScannerMesh(
    new THREE.Mesh(handleCoreGeo, scannerLimeMat),
  )
  scannerGroup.add(sHandleCore)

  // Matte-black soft-touch lower rubber grip & pommel base
  const sRubberGrip = registerScannerMesh(
    new THREE.Mesh(rubberGripGeo, scannerRubberMat),
  )
  scannerGroup.add(sRubberGrip)

  // Rear-bottom lanyard loop tucked at the back of the heel
  const sLanyardLoop = registerScannerMesh(
    new THREE.Mesh(lanyardLoopGeo, scannerRubberMat),
    false,
    false,
  )
  sLanyardLoop.position.set(0, 18, -32)
  sLanyardLoop.rotation.y = Math.PI / 2
  sLanyardLoop.rotation.z = -0.45
  scannerGroup.add(sLanyardLoop)

  // Recessed dark trigger pocket on the front of the upper lime neck
  const sTriggerPocket = registerScannerMesh(
    new THREE.Mesh(triggerPocketGeo, scannerRecessMat),
    false,
    true,
  )
  sTriggerPocket.position.set(0, 366, 76)
  sTriggerPocket.rotation.x = 0.25
  sTriggerPocket.scale.set(1.05, 1.0, 0.72)
  scannerGroup.add(sTriggerPocket)

  // Animated curved ergonomic trigger
  const triggerBaseZ = 92
  const triggerGroup = new THREE.Group()
  triggerGroup.position.set(0, 368, triggerBaseZ)
  triggerGroup.rotation.x = 0.08
  scannerGroup.add(triggerGroup)

  const sTrigger = registerScannerMesh(
    new THREE.Mesh(triggerGeo, scannerTriggerMat),
  )
  triggerGroup.add(sTrigger)

  // Side acoustic buzzer vent slits (3 subtle slots on each flank of the upper lime neck)
  for (const side of [-1, 1]) {
    for (let v = 0; v < 3; v++) {
      const vent = new THREE.Mesh(speakerVentGeo, scannerRecessMat)
      vent.position.set(side * (65.5 + v * 0.6), 406 - v * 2.5, 22 + v * 8.5)
      vent.rotation.z = side * -0.18
      vent.rotation.x = 0.22
      vent.scale.set(0.7, 1 - v * 0.14, 0.7)
      scannerGroup.add(vent)
    }
  }

  // Sculpted scanner head assembly
  const scannerHeadGroup = new THREE.Group()
  scannerHeadGroup.position.set(0, 474, 72)
  scannerHeadGroup.rotation.x = 0.18
  scannerGroup.add(scannerHeadGroup)

  const sHeadLimeCore = registerScannerMesh(
    new THREE.Mesh(headLimeGeo, scannerLimeMat),
  )
  scannerHeadGroup.add(sHeadLimeCore)

  const sHeadHood = registerScannerMesh(
    new THREE.Mesh(headHoodGeo, scannerRubberMat),
  )
  scannerHeadGroup.add(sHeadHood)

  // Deep matte-black optical cavity backplate + internal sensor ring + glowing emitter behind tinted glass
  const sScanBackplate = new THREE.Mesh(scanBackplateGeo, scannerRecessMat)
  sScanBackplate.position.set(0, 0, 36)
  scannerHeadGroup.add(sScanBackplate)

  const sOpticRing = new THREE.Mesh(opticRingGeo, scannerOpticRingMat)
  sOpticRing.position.set(0, 0, 39)
  scannerHeadGroup.add(sOpticRing)

  const sScanBeam = new THREE.Mesh(scanBeamGeo, scannerBeamMat)
  sScanBeam.position.set(0, 0, 45)
  scannerHeadGroup.add(sScanBeam)

  // Recessed curved obsidian-tinted acrylic scan window
  const sScanLens = registerScannerMesh(
    new THREE.Mesh(scanLensGeo, scannerLensMat),
    false,
    true,
  )
  sScanLens.position.set(0, 0, 44)
  scannerHeadGroup.add(sScanLens)

  // Molded forehead brand badge on top of the black rubber hood
  const sHoodEmblem = new THREE.Mesh(hoodEmblemGeo, hoodEmblemMat)
  sHoodEmblem.position.set(0, 79.5, 68)
  sHoodEmblem.rotation.x = -Math.PI / 2 + 0.05
  scannerHeadGroup.add(sHoodEmblem)

  // Top-rear black status bezel + glowing indicator LED on the lime dome
  const sTopBezel = registerScannerMesh(
    new THREE.Mesh(topBezelGeo, scannerRubberMat),
    false,
    true,
  )
  sTopBezel.position.set(0, 75.5, -74)
  sTopBezel.rotation.z = Math.PI / 2
  sTopBezel.scale.set(0.55, 1.0, 0.9)
  scannerHeadGroup.add(sTopBezel)

  const sStatusLed = new THREE.Mesh(statusLedGeo, scannerStatusLedMat)
  sStatusLed.position.set(0, 81, -70)
  sStatusLed.rotation.z = Math.PI / 2
  sStatusLed.scale.set(0.6, 1.0, 0.7)
  scannerHeadGroup.add(sStatusLed)

  markFocusSharp(scannerGroup)

  // 3D laser beam + surface laser crosshair group
  const laserVisualsGroup = new THREE.Group()
  laserVisualsGroup.visible = false
  webglScene.add(laserVisualsGroup)

  const laserRayMesh = new THREE.Mesh(laserRayGeo, laserRayMat)
  laserVisualsGroup.add(laserRayMesh)

  const laserSpotGroup = new THREE.Group()
  laserVisualsGroup.add(laserSpotGroup)

  const laserLineH = new THREE.Mesh(laserLineHGeo, laserSpotMat)
  const laserLineV = new THREE.Mesh(laserLineVGeo, laserSpotMat)
  const laserCoreDot = new THREE.Mesh(laserCoreDotGeo, laserCoreMat)
  laserSpotGroup.add(laserLineH, laserLineV, laserCoreDot)

  markFocusSharp(laserVisualsGroup)

  // Reusable math temporaries
  const restPos = new THREE.Vector3(SCANNER_X, TABLE_TOP_Y + 5, SCANNER_Z)
  const restQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, -0.36, 0, 'YXZ'),
  )
  const tmpHandLocal = new THREE.Vector3()
  const tmpTargetPos = new THREE.Vector3()
  const tmpNozzleWorld = new THREE.Vector3()
  const tmpAimDir = new THREE.Vector3()
  const tmpLocalAim = new THREE.Vector3()
  const tmpCamInvQuat = new THREE.Quaternion()
  const tmpWristEuler = new THREE.Euler(0, Math.PI, 0, 'YXZ')
  const tmpWristQuat = new THREE.Quaternion()
  const tmpTargetQuat = new THREE.Quaternion()
  const tmpSpotUp = new THREE.Vector3()
  const tmpSpotRight = new THREE.Vector3()
  const tmpSpotMat = new THREE.Matrix4()
  const worldUp = new THREE.Vector3(0, 1, 0)

  let handBlend = 0

  const setWorldShadowCasting = (enabled: boolean) => {
    for (let i = 0; i < shadowCasters.length; i++) {
      shadowCasters[i].castShadow = enabled
    }
  }

  const updateScannerPose = ({
    held,
    dt,
    camera,
    aspect,
    aimWorldPoint,
    hitNormal,
    hoverAmount,
    dockHoverAmount,
    triggerAnim,
    successFlash,
    moveSpeedNorm,
    timeSec,
  }: ScannerPoseUpdate) => {
    const blendTarget = held ? 1 : 0
    const blendRate = 1 - Math.exp(-16 * dt)
    handBlend += (blendTarget - handBlend) * blendRate
    if (Math.abs(handBlend - blendTarget) < 0.002) {
      handBlend = blendTarget
    }

    // Mechanical trigger squeeze animation (translates inward and pivots slightly)
    const squeeze = Math.sin(triggerAnim * Math.PI)
    triggerGroup.position.z = triggerBaseZ - squeeze * 11
    triggerGroup.rotation.x = 0.08 + squeeze * 0.14

    // Dock ring highlight when scanner is in hand
    const dockTargetIntensity = held
      ? 0.45 + dockHoverAmount * 0.75
      : 0.1 + hoverAmount * 0.35
    dockRingMat.emissiveIntensity +=
      (dockTargetIntensity - dockRingMat.emissiveIntensity) * blendRate
    const dockScale =
      SCANNER_REST_SCALE * (1 + (held ? dockHoverAmount * 0.09 : 0))
    dockGroup.scale.set(dockScale, 1, dockScale)

    // Scanner status LED & beam colors (emerald flash on successful decode)
    if (successFlash > 0.01) {
      scannerBeamMat.color.set('#22c55e')
      scannerBeamMat.emissive.set('#22c55e')
      scannerBeamMat.emissiveIntensity = 1.6
      scannerStatusLedMat.color.set('#22c55e')
      scannerStatusLedMat.emissive.set('#22c55e')
      scannerStatusLedMat.emissiveIntensity = 1.9
      laserRayMat.color.set('#22c55e')
      laserRayMat.opacity = 0.78
      laserSpotMat.color.set('#22c55e')
    } else {
      scannerBeamMat.color.set('#ef4444')
      scannerBeamMat.emissive.set('#ef4444')
      scannerBeamMat.emissiveIntensity = held ? 1.25 : 0.6 + hoverAmount * 0.55
      scannerStatusLedMat.color.set('#1ec9a8')
      scannerStatusLedMat.emissive.set('#1ec9a8')
      scannerStatusLedMat.emissiveIntensity = held ? 1.15 : 0.8
      laserRayMat.color.set('#ef4444')
      laserRayMat.opacity = 0.5
      laserSpotMat.color.set('#ff3b3b')
    }

    if (handBlend <= 0.002 && !held) {
      scannerGroup.position.set(
        restPos.x,
        restPos.y + hoverAmount * 14,
        restPos.z,
      )
      scannerGroup.quaternion.copy(restQuat)
      const hoverScale = SCANNER_REST_SCALE * (1 + hoverAmount * 0.05)
      scannerGroup.scale.setScalar(hoverScale)
      setWorldShadowCasting(true)
      laserVisualsGroup.visible = false
      return
    }

    // Disable viewmodel shadow-casting while held near the camera so it doesn't cast giant shadows across the room
    const castWorldShadows = !held && handBlend < 0.25
    setWorldShadowCasting(castWorldShadows)
    const blendedScale =
      SCANNER_REST_SCALE +
      (SCANNER_HAND_SCALE - SCANNER_REST_SCALE) * handBlend
    scannerGroup.scale.setScalar(blendedScale)

    // Compute compact right-hand viewmodel pose in camera space
    const walkBobX = Math.sin(timeSec * 7.2) * 6 * moveSpeedNorm
    const walkBobY = Math.abs(Math.cos(timeSec * 7.2)) * -7 * moveSpeedNorm
    const idleBreathY = Math.sin(timeSec * 2.1) * 2.5
    const recoilZ =
      Math.sin(triggerAnim * Math.PI) * 14 +
      Math.sin(Math.min(1, successFlash) * Math.PI) * 10

    const handX = Math.min(265, Math.max(122, 205 * Math.min(aspect, 1.5)))
    tmpHandLocal.set(
      handX + walkBobX,
      -455 + walkBobY + idleBreathY,
      -620 + recoilZ,
    )
    tmpTargetPos.copy(tmpHandLocal).applyMatrix4(camera.matrixWorld)

    // Subtle wrist pivot so the scanner nozzle tracks the 3D laser crosshair hit point
    let wristYaw = Math.PI + 0.14
    let wristPitch = 0.12
    if (aimWorldPoint) {
      tmpCamInvQuat.copy(camera.quaternion).invert()
      tmpLocalAim
        .copy(aimWorldPoint)
        .sub(tmpTargetPos)
        .applyQuaternion(tmpCamInvQuat)
      if (tmpLocalAim.z < -60) {
        const horizYaw = Math.atan2(-tmpLocalAim.x, -tmpLocalAim.z)
        const headOffsetY = 474 * SCANNER_HAND_SCALE
        const vertPitch = Math.atan2(
          tmpLocalAim.y - headOffsetY,
          Math.hypot(tmpLocalAim.x, tmpLocalAim.z),
        )
        wristYaw = Math.PI + Math.max(-0.48, Math.min(0.48, horizYaw))
        wristPitch = 0.14 - Math.max(-0.42, Math.min(0.42, vertPitch))
      }
    }

    tmpWristEuler.set(wristPitch, wristYaw, -0.05, 'YXZ')
    tmpWristQuat.setFromEuler(tmpWristEuler)
    tmpTargetQuat.copy(camera.quaternion).multiply(tmpWristQuat)

    if (handBlend >= 0.998) {
      scannerGroup.position.copy(tmpTargetPos)
      scannerGroup.quaternion.copy(tmpTargetQuat)
    } else {
      scannerGroup.position.lerpVectors(restPos, tmpTargetPos, handBlend)
      scannerGroup.quaternion.slerpQuaternions(
        restQuat,
        tmpTargetQuat,
        handBlend,
      )
    }
    scannerGroup.updateMatrixWorld(true)

    // Update 3D laser ray & surface crosshair when held
    if (held && handBlend > 0.65 && aimWorldPoint) {
      sScanBeam.getWorldPosition(tmpNozzleWorld)
      tmpAimDir.copy(aimWorldPoint).sub(tmpNozzleWorld)
      const rayLen = tmpAimDir.length()
      if (rayLen > 25) {
        laserVisualsGroup.visible = true
        laserRayMesh.position.copy(tmpNozzleWorld)
        laserRayMesh.lookAt(aimWorldPoint)
        laserRayMesh.scale.set(1, 1, rayLen)

        if (hitNormal) {
          laserSpotGroup.visible = true
          laserSpotGroup.position
            .copy(aimWorldPoint)
            .addScaledVector(hitNormal, 2.5)
          if (Math.abs(hitNormal.y) > 0.92) {
            const cy = camera.rotation.y
            tmpSpotUp.set(-Math.sin(cy), 0, -Math.cos(cy)).normalize()
          } else {
            tmpSpotUp
              .copy(worldUp)
              .addScaledVector(hitNormal, -hitNormal.y)
              .normalize()
          }
          tmpSpotRight.crossVectors(tmpSpotUp, hitNormal).normalize()
          tmpSpotUp.crossVectors(hitNormal, tmpSpotRight).normalize()
          tmpSpotMat.makeBasis(tmpSpotRight, tmpSpotUp, hitNormal)
          laserSpotGroup.quaternion.setFromRotationMatrix(tmpSpotMat)

          // Scale surface spot gently with distance so it stays legible up close and across the desk
          const spotScale = Math.min(1.5, Math.max(0.4, rayLen / 3400))
          laserSpotGroup.scale.setScalar(spotScale)
        } else {
          laserSpotGroup.visible = false
        }
      } else {
        laserVisualsGroup.visible = false
      }
    } else {
      laserVisualsGroup.visible = false
    }
  }

  return {
    scannerGroup,
    laserVisualsGroup,
    scannerTargets,
    scannerDockTargets,
    updateScannerPose,
  }
}
