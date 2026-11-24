import type { ThreeModule } from '../types'

// World scale: 4000 units = 1 meter (1 unit = 0.25 mm)
const GRAVITY = 28000 // units/s^2 — crisp metallic weight
const SUB_DT = 1 / 240
const MAX_SUBSTEPS = 12
const MAX_SPEED = 6800
const MAX_TILT = 0.82 // ~47 deg total radial tilt clamp

// Friction thresholds (mu * GRAVITY)
const TRAY_FRICTION_MU = 0.085 // slick ABS/polypropylene coin scoop
const COIN_FRICTION_MU = 0.055 // smooth metal-on-metal coin glide

export interface DrawerMotionState {
  targetOpen: boolean
  z: number
  velZ: number
  accZ: number
  settled: boolean
  bouncePhase: number
}

export interface DrawerMotionStep {
  z: number
  velZ: number
  accZ: number
  /** Instantaneous delta-v from discrete events (initial kick / hard stop) */
  impulseZ: number
  /** Mechanical floor shockwave magnitude triggered on kick / hard stop */
  shockY: number
  active: boolean
}

export function createDrawerMotionState(): DrawerMotionState {
  return {
    targetOpen: false,
    z: 0,
    velZ: 0,
    accZ: 0,
    settled: true,
    bouncePhase: 0,
  }
}

/**
 * Triggers a drawer open/close transition.
 * Opening near closed applies a crisp solenoid latch release + rear spring initial kick.
 */
export function setDrawerMotionTarget(
  state: DrawerMotionState,
  nextOpen: boolean,
  openOffset: number,
): number {
  if (state.targetOpen === nextOpen) return 0
  state.targetOpen = nextOpen
  state.settled = false
  state.bouncePhase = 0

  // Initial kick when popping open from closed / near-closed
  if (nextOpen && state.z < openOffset * 0.28) {
    const kickTargetVel = 1650
    if (state.velZ < kickTargetVel) {
      const dv = kickTargetVel - state.velZ
      state.velZ = kickTargetVel
      return dv
    }
  } else if (!nextOpen && state.z > openOffset * 0.72) {
    // Initial push impulse when slamming drawer closed
    const pushTargetVel = -950
    if (state.velZ > pushTargetVel) {
      const dv = pushTargetVel - state.velZ
      state.velZ = pushTargetVel
      return dv
    }
  }
  return 0
}

/**
 * Advances the 1D mechanical drawer rail kinematics across dt:
 * initial kick -> ejector spring acceleration -> roller deceleration -> rail hard stop.
 */
export function stepDrawerMotion(
  state: DrawerMotionState,
  dt: number,
  openOffset: number,
  pendingKickDv = 0,
): DrawerMotionStep {
  let impulseZ = pendingKickDv
  let shockY = Math.abs(pendingKickDv) > 100 ? Math.min(260, Math.abs(pendingKickDv) * 0.12) : 0

  if (state.settled && Math.abs(pendingKickDv) < 1e-3) {
    state.accZ = 0
    return {
      z: state.z,
      velZ: 0,
      accZ: 0,
      impulseZ: 0,
      shockY: 0,
      active: false,
    }
  }

  const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUB_DT)))
  const h = dt / substeps
  let accAccum = 0

  for (let s = 0; s < substeps; s++) {
    if (state.targetOpen) {
      // Opening toward openOffset
      if (state.bouncePhase > 0) {
        // Already hit hard stop and settling against rubber rail bumper
        const restZ = openOffset
        const springK = 2200
        const damperC = 58
        const acc = -springK * (state.z - restZ) - damperC * state.velZ
        state.velZ += acc * h
        state.z += state.velZ * h
        accAccum += acc
        if (state.z > openOffset) {
          const dv = -state.velZ
          state.z = openOffset
          state.velZ = 0
          impulseZ += dv
        }
        if (
          Math.abs(openOffset - state.z) < 0.25 &&
          Math.abs(state.velZ) < 12
        ) {
          state.z = openOffset
          state.velZ = 0
          state.accZ = 0
          state.settled = true
          break
        }
      } else {
        let acc = 0
        if (state.z < openOffset * 0.3) {
          // Rear ejector spring still accelerating tray outward
          acc = 19500
        } else {
          // Coasting with roller drag / deceleration (coins drift forward)
          acc = state.velZ > 1950 ? -5200 : -1400
          if (state.velZ < 1750) acc = 900
        }
        state.velZ += acc * h
        state.z += state.velZ * h
        accAccum += acc

        // Hard stop against rail end bumper
        if (state.z >= openOffset) {
          const vImpact = state.velZ
          state.z = openOffset
          const reboundVel = -Math.max(0, vImpact) * 0.14
          const dv = reboundVel - vImpact
          state.velZ = reboundVel
          state.bouncePhase = 1
          impulseZ += dv
          shockY = Math.max(shockY, Math.min(540, Math.abs(dv) * 0.19))
        }
      }
    } else {
      // Closing toward 0
      if (state.bouncePhase > 0) {
        const springK = 2400
        const damperC = 64
        const acc = -springK * state.z - damperC * state.velZ
        state.velZ += acc * h
        state.z += state.velZ * h
        accAccum += acc
        if (state.z < 0) {
          const dv = -state.velZ
          state.z = 0
          state.velZ = 0
          impulseZ += dv
        }
        if (Math.abs(state.z) < 0.25 && Math.abs(state.velZ) < 12) {
          state.z = 0
          state.velZ = 0
          state.accZ = 0
          state.settled = true
          break
        }
      } else {
        let acc = 0
        if (state.z > openOffset * 0.35) {
          // Hand push accelerating drawer inward
          acc = state.velZ > -2550 ? -13500 : -1200
        } else {
          // Slight deceleration before latch click
          acc = state.velZ < -1850 ? 3800 : -600
        }
        state.velZ += acc * h
        state.z += state.velZ * h
        accAccum += acc

        // Hard stop against rear latch
        if (state.z <= 0) {
          const vImpact = state.velZ
          state.z = 0
          const reboundVel = -Math.min(0, vImpact) * 0.12
          const dv = reboundVel - vImpact
          state.velZ = reboundVel
          state.bouncePhase = 1
          impulseZ += dv
          shockY = Math.max(shockY, Math.min(460, Math.abs(dv) * 0.16))
        }
      }
    }
  }

  state.accZ = accAccum / substeps
  return {
    z: state.z,
    velZ: state.velZ,
    accZ: state.accZ,
    impulseZ,
    shockY,
    active: !state.settled,
  }
}

export interface CoinCupBounds {
  xMin: number
  xMax: number
  zMin: number
  zMax: number
  floorY: number
}

export interface CoinBody {
  cupIdx: number
  radius: number
  thickness: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  tiltX: number
  tiltZ: number
  vTiltX: number
  vTiltZ: number
  yaw: number
  vYaw: number
  seed: number
  mesh: InstanceType<ThreeModule['Mesh']> | null
}

const deterministicNoise = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

const floorOffsetForTilt = (
  radius: number,
  thickness: number,
  tiltX: number,
  tiltZ: number,
): number => {
  const tiltMag = Math.min(MAX_TILT, Math.hypot(tiltX, tiltZ))
  return radius * Math.sin(tiltMag) + thickness * 0.5 * Math.cos(tiltMag)
}

export class CoinCupSimulation {
  private readonly cups: CoinBody[][] = Array.from({ length: 8 }, () => [])
  private readonly bounds: CoinCupBounds[]
  private readonly cupSleeping: boolean[] = Array.from({ length: 8 }, () => true)
  private readonly cupCalmTime: number[] = Array.from({ length: 8 }, () => 0)
  // Reusable per-cup scratch arrays to avoid allocations during animation ticks
  private readonly supportYScratch: number[] = []
  private readonly onFloorScratch: boolean[] = []
  private readonly targetTiltXScratch: number[] = []
  private readonly targetTiltZScratch: number[] = []

  constructor(bounds: CoinCupBounds[]) {
    this.bounds = bounds
  }

  clear(): void {
    for (let i = 0; i < this.cups.length; i++) {
      this.cups[i].length = 0
      this.cupSleeping[i] = true
      this.cupCalmTime[i] = 0
    }
  }

  addCoin(body: Omit<CoinBody, 'vx' | 'vy' | 'vz' | 'tiltX' | 'tiltZ' | 'vTiltX' | 'vTiltZ' | 'vYaw'>): void {
    const cup = this.cups[body.cupIdx]
    if (!cup) return
    cup.push({
      ...body,
      vx: 0,
      vy: 0,
      vz: 0,
      tiltX: 0,
      tiltZ: 0,
      vTiltX: 0,
      vTiltZ: 0,
      vYaw: 0,
    })
    this.cupSleeping[body.cupIdx] = true
    this.cupCalmTime[body.cupIdx] = 0
  }

  wakeAll(): void {
    for (let i = 0; i < this.cups.length; i++) {
      if (this.cups[i].length > 0) {
        this.cupSleeping[i] = false
        this.cupCalmTime[i] = 0
      }
    }
  }

  getCups(): readonly (readonly CoinBody[])[] {
    return this.cups
  }

  isSleeping(): boolean {
    for (let i = 0; i < this.cupSleeping.length; i++) {
      if (this.cups[i].length > 0 && !this.cupSleeping[i]) return false
    }
    return true
  }

  step(dt: number, motion: DrawerMotionStep): void {
    const hasImpulse = Math.abs(motion.impulseZ) > 1e-2 || motion.shockY > 1e-2
    const hasMotion = motion.active || Math.abs(motion.accZ) > 10 || hasImpulse
    if (hasMotion) {
      this.wakeAll()
    }

    if (this.isSleeping()) return

    const clampedDt = Math.min(0.05, Math.max(0.0005, dt))
    const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(clampedDt / SUB_DT)))
    const h = clampedDt / substeps

    // Apply instantaneous kick / hard-stop velocity impulse once before substepping
    if (hasImpulse) {
      this.applyDrawerImpulse(motion.impulseZ, motion.shockY)
    }

    for (let cupIdx = 0; cupIdx < this.cups.length; cupIdx++) {
      const coins = this.cups[cupIdx]
      if (coins.length === 0 || this.cupSleeping[cupIdx]) continue

      const cupBounds = this.bounds[cupIdx]
      for (let s = 0; s < substeps; s++) {
        this.stepCup(coins, cupBounds, h, motion.accZ)
      }

      // Sync meshes & evaluate sleep state
      let maxEnergy = 0
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i]
        if (c.mesh) {
          c.mesh.position.set(c.x, c.y, c.z)
          c.mesh.rotation.set(c.tiltX, c.yaw, c.tiltZ)
        }
        const e =
          Math.abs(c.vx) +
          Math.abs(c.vy) +
          Math.abs(c.vz) +
          (Math.abs(c.vTiltX) + Math.abs(c.vTiltZ)) * 35 +
          Math.abs(c.vYaw) * 12
        if (e > maxEnergy) maxEnergy = e
      }

      if (!hasMotion && maxEnergy < 24) {
        this.cupCalmTime[cupIdx] += clampedDt
        if (this.cupCalmTime[cupIdx] > 0.3) {
          for (let i = 0; i < coins.length; i++) {
            const c = coins[i]
            c.vx = 0
            c.vy = 0
            c.vz = 0
            c.vTiltX = 0
            c.vTiltZ = 0
            c.vYaw = 0
          }
          this.cupSleeping[cupIdx] = true
        }
      } else {
        this.cupCalmTime[cupIdx] = 0
      }
    }
  }

  private applyDrawerImpulse(impulseZ: number, shockY: number): void {
    const dvCoinZ = -impulseZ
    for (let cupIdx = 0; cupIdx < this.cups.length; cupIdx++) {
      const coins = this.cups[cupIdx]
      const cupBounds = this.bounds[cupIdx]
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i]
        const n1 = deterministicNoise(c.seed * 13 + 7)
        const n2 = deterministicNoise(c.seed * 29 + 19)
        const n3 = deterministicNoise(c.seed * 41 + 31)

        // Height ratio: higher coins in a stack experience slightly sharper shear / whip
        const heightAboveFloor = Math.max(0, c.y - (cupBounds.floorY + c.thickness * 0.5))
        const stackFactor = 1 + Math.min(0.22, heightAboveFloor * 0.0022)

        c.vz = clamp(c.vz + dvCoinZ * stackFactor + n1 * Math.abs(dvCoinZ) * 0.045, -MAX_SPEED, MAX_SPEED)
        c.vx = clamp(c.vx + n2 * (Math.abs(dvCoinZ) * 0.09 + shockY * 0.4), -MAX_SPEED, MAX_SPEED)

        // Floor shockwave pops coins upward slightly so they slosh, rattle, and fluidize
        if (shockY > 1) {
          const pop = shockY * (0.55 + 0.45 * (n3 * 0.5 + 0.5))
          c.vy = clamp(c.vy + pop, -MAX_SPEED, MAX_SPEED)
          c.vTiltX += (-dvCoinZ * 0.0012 + n1 * 2.4)
          c.vTiltZ += n2 * 3.2
          c.vYaw += n3 * 2.5
        } else {
          // Even on pure kick without big vertical shock, shear tilts stacked coins backward
          c.vTiltX += -dvCoinZ * 0.00085 + n1 * 1.1
          c.vTiltZ += n2 * 1.4
        }
      }
    }
  }

  private stepCup(
    coins: CoinBody[],
    b: CoinCupBounds,
    h: number,
    drawerAccZ: number,
  ): void {
    const n = coins.length
    while (this.supportYScratch.length < n) {
      this.supportYScratch.push(0)
      this.onFloorScratch.push(false)
      this.targetTiltXScratch.push(0)
      this.targetTiltZScratch.push(0)
    }

    // 1. Initialize floor support height & desired flat tilt
    for (let i = 0; i < n; i++) {
      const c = coins[i]
      const floorSupport =
        b.floorY + floorOffsetForTilt(c.radius, c.thickness, c.tiltX, c.tiltZ)
      this.supportYScratch[i] = floorSupport
      this.onFloorScratch[i] = c.y <= floorSupport + 0.8
      this.targetTiltXScratch[i] = 0
      this.targetTiltZScratch[i] = 0
    }

    // 2. Coin-coin granular fluid + overlapping shingle/stack interactions
    for (let i = 0; i < n; i++) {
      const a = coins[i]
      for (let j = i + 1; j < n; j++) {
        const d = coins[j]
        const dx = d.x - a.x
        const dz = d.z - a.z
        const distSq = dx * dx + dz * dz
        const minHoriz = a.radius + d.radius

        if (distSq >= minHoriz * minHoriz * 1.02) continue

        const distXZ = Math.sqrt(distSq)
        const dy = d.y - a.y
        const avgH = (a.thickness + d.thickness) * 0.5
        const avgR = (a.radius + d.radius) * 0.5

        // Vertical stacking / rim-shingling when one coin is higher than the other
        if (Math.abs(dy) >= avgH * 0.42 && Math.abs(dy) < avgH + avgR * 0.95) {
          const upperIdx = dy > 0 ? j : i
          const lowerIdx = dy > 0 ? i : j
          const upper = coins[upperIdx]
          const lower = coins[lowerIdx]
          const dirX = upper.x - lower.x
          const dirZ = upper.z - lower.z

          if (distXZ < minHoriz * 0.96) {
            // Centered vs perched on rim
            const overlapRatio = distXZ / Math.max(1e-3, minHoriz)
            // Rim taper: centered rests at lower.y + avgH, edge-perched drops slightly & tilts
            const rimDrop =
              overlapRatio > 0.35
                ? avgH * 0.42 * ((overlapRatio - 0.35) / 0.61)
                : 0
            const stackSupport = lower.y + avgH - rimDrop

            if (stackSupport > this.supportYScratch[upperIdx]) {
              this.supportYScratch[upperIdx] = stackSupport
              this.onFloorScratch[upperIdx] = false
            }

            if (upper.y <= stackSupport + 1.2) {
              // Shingling tilt away from lower coin's center
              if (distXZ > 0.12 * avgR) {
                const invD = 1 / distXZ
                const ux = dirX * invD
                const uz = dirZ * invD
                const shingleAngle = clamp((overlapRatio - 0.15) * 0.52, 0, 0.45)
                // +tiltX leans normal toward +Z; +tiltZ leans normal toward -X
                this.targetTiltXScratch[upperIdx] += uz * shingleAngle
                this.targetTiltZScratch[upperIdx] -= ux * shingleAngle

                // Gravity-driven slide off the rim of the lower coin (granular fluid collapse)
                const slideAccel = GRAVITY * 0.28 * Math.sin(shingleAngle)
                upper.vx += ux * slideAccel * h
                upper.vz += uz * slideAccel * h
                lower.vx -= ux * slideAccel * 0.35 * h
                lower.vz -= uz * slideAccel * 0.35 * h
              }

              // Vertical contact resolution
              if (upper.y < stackSupport) {
                upper.y = stackSupport
                const relVy = upper.vy - lower.vy
                if (relVy < 0) {
                  const eVert = 0.16
                  const impY = -(1 + eVert) * relVy * 0.5
                  upper.vy += impY
                  lower.vy -= impY * 0.5
                  if (Math.abs(relVy) > 120) {
                    const nJ = deterministicNoise(upper.seed * 17 + lower.seed)
                    upper.vTiltX += nJ * 1.4
                    upper.vTiltZ -= nJ * 1.4
                  }
                }
              }

              // Coin-on-coin kinetic friction coupling (shearing stacks)
              const relVx = upper.vx - lower.vx
              const relVz = upper.vz - lower.vz
              const relSpeed = Math.hypot(relVx, relVz)
              if (relSpeed > 1) {
                const maxDelta = COIN_FRICTION_MU * GRAVITY * h
                const drop = Math.min(relSpeed * 0.48, maxDelta)
                const fx = (relVx / relSpeed) * drop
                const fz = (relVz / relSpeed) * drop
                upper.vx -= fx
                upper.vz -= fz
                lower.vx += fx * 0.65
                lower.vz += fz * 0.65
              }
            }
          }
          continue
        }

        // Same-layer horizontal collision + fluid squeeze-out
        if (Math.abs(dy) < avgH * 0.72 && distXZ < minHoriz) {
          let nx = 0
          let nz = 1
          if (distXZ > 1e-4) {
            nx = dx / distXZ
            nz = dz / distXZ
          } else {
            const ang = (deterministicNoise(a.seed * 37 + d.seed * 11) + 1) * Math.PI
            nx = Math.cos(ang)
            nz = Math.sin(ang)
          }

          const pen = minHoriz - distXZ
          // Soft position separation
          const corr = pen * 0.44
          a.x -= nx * corr
          a.z -= nz * corr
          d.x += nx * corr
          d.z += nz * corr

          // Relative velocity along contact normal
          const rvx = d.vx - a.vx
          const rvz = d.vz - a.vz
          const relN = rvx * nx + rvz * nz

          if (relN < 0) {
            const e = 0.34
            const jImp = -(1 + e) * relN * 0.5
            a.vx -= nx * jImp
            a.vz -= nz * jImp
            d.vx += nx * jImp
            d.vz += nz * jImp

            // Tangential fluid shear & spin
            const tx = -nz
            const tz = nx
            const relT = rvx * tx + rvz * tz
            const shear = relT * 0.08
            a.vx += tx * shear
            a.vz += tz * shear
            d.vx -= tx * shear
            d.vz -= tz * shear
            a.vYaw += relT * 0.004
            d.vYaw -= relT * 0.004

            // Compressive wave splash: hard impacts squeeze coins slightly upward & tilt like a wave
            const impactSpeed = -relN
            if (impactSpeed > 180) {
              const splash = Math.min(460, (impactSpeed - 180) * 0.24)
              const bias = deterministicNoise(a.seed * 19 + d.seed * 23) >= 0 ? 1 : -1
              if (bias > 0) {
                d.vy += splash
                d.vTiltX += nz * impactSpeed * 0.0045
                d.vTiltZ -= nx * impactSpeed * 0.0045
              } else {
                a.vy += splash
                a.vTiltX -= nz * impactSpeed * 0.0045
                a.vTiltZ += nx * impactSpeed * 0.0045
              }
            }
          } else if (pen > 1.5) {
            // Lateral fluid pressure when compressed in a packed wave
            const pressure = pen * 95 * h
            a.vx -= nx * pressure
            a.vz -= nz * pressure
            d.vx += nx * pressure
            d.vz += nz * pressure
            // Gentle upward buoyancy only while wave is actively surging
            const pairEnergy =
              Math.abs(a.vx) + Math.abs(a.vz) + Math.abs(d.vx) + Math.abs(d.vz)
            if (pairEnergy > 60) {
              const lift = Math.min(260, pen * 14) * h
              a.vy += lift
              d.vy += lift
            }
          }
        }
      }
    }

    // 3. Integrate velocities, inertial drawer acceleration, tray friction, tilt & wall collisions
    for (let i = 0; i < n; i++) {
      const c = coins[i]
      const supportY = this.supportYScratch[i]
      const touchingSupport = c.y <= supportY + 0.9
      const wasResting = c.y <= supportY + 0.35 && Math.abs(c.vy) < 45

      // Inertial force from drawer acceleration (-drawerAccZ)
      const inertialAccZ = -drawerAccZ
      c.vz += inertialAccZ * h

      // Gravity (skip micro-bounce accumulation if already resting calmly on support)
      if (!wasResting || c.vy > 0) {
        c.vy -= GRAVITY * h
      } else {
        c.vy = 0
      }

      // Surface friction & fluid drag when resting on tray floor or lower coin
      if (touchingSupport) {
        const mu = this.onFloorScratch[i] ? TRAY_FRICTION_MU : COIN_FRICTION_MU
        const speedXZ = Math.hypot(c.vx, c.vz)
        if (speedXZ > 0.5) {
          const decel = mu * GRAVITY * h
          if (speedXZ <= decel && Math.abs(drawerAccZ) < mu * GRAVITY) {
            c.vx = 0
            c.vz = 0
          } else {
            const scale = Math.max(0, speedXZ - decel) / speedXZ
            c.vx *= scale
            c.vz *= scale
          }
        }
        // Subtle viscous damping in yaw
        c.vYaw *= Math.exp(-7.5 * h)
      } else {
        // Light air drag
        const airDamp = Math.exp(-0.8 * h)
        c.vx *= airDamp
        c.vz *= airDamp
        c.vYaw *= Math.exp(-1.5 * h)
      }

      // Tilt restoring spring toward target shingle/flat angle + damping
      const targetTX = clamp(this.targetTiltXScratch[i], -MAX_TILT, MAX_TILT)
      const targetTZ = clamp(this.targetTiltZScratch[i], -MAX_TILT, MAX_TILT)
      const tiltSpring = touchingSupport ? 195 : 22
      const tiltDamp = touchingSupport ? 14 : 3.2
      c.vTiltX += ((targetTX - c.tiltX) * tiltSpring - c.vTiltX * tiltDamp) * h
      c.vTiltZ += ((targetTZ - c.tiltZ) * tiltSpring - c.vTiltZ * tiltDamp) * h

      // Clamp speeds
      c.vx = clamp(c.vx, -MAX_SPEED, MAX_SPEED)
      c.vy = clamp(c.vy, -MAX_SPEED, MAX_SPEED)
      c.vz = clamp(c.vz, -MAX_SPEED, MAX_SPEED)

      // Integrate positions & angles
      c.x += c.vx * h
      c.y += c.vy * h
      c.z += c.vz * h
      c.tiltX += c.vTiltX * h
      c.tiltZ += c.vTiltZ * h
      const tiltLen = Math.hypot(c.tiltX, c.tiltZ)
      if (tiltLen > MAX_TILT) {
        const s = MAX_TILT / tiltLen
        c.tiltX *= s
        c.tiltZ *= s
      }
      c.yaw += c.vYaw * h

      // Floor / support collision + metallic rocking rattle
      const minFloorY =
        b.floorY + floorOffsetForTilt(c.radius, c.thickness, c.tiltX, c.tiltZ)
      const activeFloor = Math.max(minFloorY, supportY)
      const bounceThreshold = Math.max(220, GRAVITY * h * 2.0)
      if (c.y < activeFloor) {
        c.y = activeFloor
        if (c.vy < 0) {
          const impactVy = -c.vy
          if (!wasResting && impactVy > bounceThreshold) {
            c.vy = impactVy * 0.24
            // Rocking metallic chatter when a tilted coin slaps the floor
            const tiltMag = Math.hypot(c.tiltX, c.tiltZ)
            if (tiltMag > 0.06) {
              c.vTiltX += -c.tiltX * 7.5 + deterministicNoise(c.seed * 7 + c.z) * 1.4
              c.vTiltZ += -c.tiltZ * 7.5 + deterministicNoise(c.seed * 11 + c.x) * 1.4
            } else {
              c.vTiltX += deterministicNoise(c.seed * 31 + c.z) * impactVy * 0.0022
              c.vTiltZ += deterministicNoise(c.seed * 37 + c.x) * impactVy * 0.0022
            }
          } else {
            c.vy = 0
          }
        }
      }

      // Cap max hop height inside drawer cavity
      const ceilingY = b.floorY + 235
      if (c.y > ceilingY) {
        c.y = ceilingY
        if (c.vy > 0) c.vy *= -0.25
      }

      // Cup wall collisions (with wall-climb pitch & fluid rebound)
      const rEffX =
        c.radius * Math.cos(Math.abs(c.tiltZ)) +
        c.thickness * 0.5 * Math.sin(Math.abs(c.tiltZ))
      const rEffZ =
        c.radius * Math.cos(Math.abs(c.tiltX)) +
        c.thickness * 0.5 * Math.sin(Math.abs(c.tiltX))

      const wallRestitution = 0.36
      const minX = b.xMin + rEffX
      const maxX = b.xMax - rEffX
      const minZ = b.zMin + rEffZ
      const maxZ = b.zMax - rEffZ

      if (c.x < minX) {
        c.x = minX
        if (c.vx < 0) {
          const vImp = -c.vx
          c.vx = vImp * wallRestitution
          c.vz *= 0.92
          c.vYaw += c.vz * 0.003
          if (vImp > 120) {
            c.vy += vImp * 0.14
            c.vTiltZ -= vImp * 0.0055 // bank up left wall
          }
        }
      } else if (c.x > maxX) {
        c.x = maxX
        if (c.vx > 0) {
          const vImp = c.vx
          c.vx = -vImp * wallRestitution
          c.vz *= 0.92
          c.vYaw -= c.vz * 0.003
          if (vImp > 120) {
            c.vy += vImp * 0.14
            c.vTiltZ += vImp * 0.0055 // bank up right wall
          }
        }
      }

      if (c.z < minZ) {
        c.z = minZ
        if (c.vz < 0) {
          const vImp = -c.vz
          c.vz = vImp * wallRestitution
          c.vx *= 0.92
          c.vYaw -= c.vx * 0.003
          if (vImp > 120) {
            c.vy += vImp * 0.19
            c.vTiltX += vImp * 0.0065 // rear edge climbs midWall
            // Slight lateral dispersion off the wall like a fluid splash
            c.vx += deterministicNoise(c.seed * 53 + c.x) * vImp * 0.16
          }
        }
      } else if (c.z > maxZ) {
        c.z = maxZ
        if (c.vz > 0) {
          const vImp = c.vz
          c.vz = -vImp * wallRestitution
          c.vx *= 0.92
          c.vYaw += c.vx * 0.003
          if (vImp > 120) {
            c.vy += vImp * 0.22
            c.vTiltX -= vImp * 0.0072 // front edge climbs trayFront
            c.vx += deterministicNoise(c.seed * 61 + c.x) * vImp * 0.18
          }
        }
      }
    }
  }
}
