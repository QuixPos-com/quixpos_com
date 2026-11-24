import type { ThreeModule } from './types'

export const BERLIN_LAT = 52.52
export const BERLIN_LON = 13.405

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

export interface BerlinSolarState {
  elevationDeg: number
  azimuthDeg: number
  sunDirX: number
  sunDirY: number
  sunDirZ: number
  sunIntensity: number
  sunColorHex: string
  skyBgHex: string
  hemiSkyHex: string
  hemiGroundHex: string
  hemiIntensity: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function lerpHex(hexA: string, hexB: string, t: number): string {
  const u = clamp(t, 0, 1)
  const a = parseInt(hexA.slice(1), 16)
  const b = parseInt(hexB.slice(1), 16)
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * u)
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * u)
  const bl = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * u)
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

/**
 * Computes solar elevation, azimuth, and atmospheric lighting parameters
 * for Berlin, Germany (52.5200° N, 13.4050° E) at the given timestamp.
 * Scene orientation: -Z = North, +X = East, +Z = South, -X = West.
 */
export function getBerlinSolarState(date: Date = new Date()): BerlinSolarState {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0

  const meanLon = (((280.46 + 0.9856474 * n) % 360) + 360) % 360
  const meanAnomaly = ((((357.528 + 0.9856003 * n) % 360) + 360) % 360) * DEG2RAD

  const eclipticLon =
    (meanLon + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) *
    DEG2RAD
  const obliquity = (23.439 - 0.0000004 * n) * DEG2RAD

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLon),
    Math.cos(eclipticLon),
  )
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon))

  const gmstHours = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24
  const lstRad = (((gmstHours * 15 + BERLIN_LON) % 360 + 360) % 360) * DEG2RAD
  const hourAngle = lstRad - rightAscension

  const latRad = BERLIN_LAT * DEG2RAD
  const sinEl =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle)
  const elevationRad = Math.asin(clamp(sinEl, -1, 1))
  const elevationDeg = elevationRad * RAD2DEG

  // Azimuth clockwise from North (-Z): 0° = N, 90° = E (+X), 180° = S (+Z), 270° = W (-X)
  const azY = -Math.sin(hourAngle) * Math.cos(declination)
  const azX =
    Math.sin(declination) * Math.cos(latRad) -
    Math.cos(declination) * Math.sin(latRad) * Math.cos(hourAngle)
  const azimuthRad = Math.atan2(azY, azX)
  const azimuthDeg = ((azimuthRad * RAD2DEG) % 360 + 360) % 360

  // Clamp directional light elevation slightly above horizon when sun is up to avoid infinite grazing shadows
  const lightElRad = Math.max(elevationRad, 5 * DEG2RAD)
  const cosEl = Math.cos(lightElRad)
  const sunDirX = Math.sin(azimuthRad) * cosEl
  const sunDirY = Math.sin(lightElRad)
  const sunDirZ = -Math.cos(azimuthRad) * cosEl

  // Lighting mood transitions: Night (<-8°) -> Twilight (-8°..0°) -> Golden Hour (0°..18°) -> Daylight (>18°)
  const twilightT = smoothstep(-8, 0, elevationDeg)
  const goldenT = smoothstep(0, 18, elevationDeg)

  const sunIntensity =
    elevationDeg <= -2
      ? 0
      : elevationDeg < 0
        ? 0.25 * smoothstep(-2, 0, elevationDeg)
        : 0.25 + 1.2 * goldenT

  const sunColorHex = lerpHex('#ff944d', '#fffaf0', goldenT)

  const skyBgHex =
    elevationDeg < 0
      ? lerpHex('#162032', '#cf967c', twilightT)
      : lerpHex('#cf967c', '#dce8f0', goldenT)

  const hemiSkyHex =
    elevationDeg < 0
      ? lerpHex('#4d5f7d', '#ffdcc4', twilightT)
      : lerpHex('#ffdcc4', '#ffffff', goldenT)

  const hemiGroundHex =
    elevationDeg < 0
      ? lerpHex('#736a62', '#8f98a6', twilightT)
      : lerpHex('#8f98a6', '#9eb3c4', goldenT)

  const hemiIntensity =
    elevationDeg < 0
      ? 0.5 + 0.18 * twilightT
      : 0.68 + 0.42 * goldenT

  return {
    elevationDeg,
    azimuthDeg,
    sunDirX,
    sunDirY,
    sunDirZ,
    sunIntensity,
    sunColorHex,
    skyBgHex,
    hemiSkyHex,
    hemiGroundHex,
    hemiIntensity,
  }
}

export function applyBerlinLighting(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  hemiLight: InstanceType<ThreeModule['HemisphereLight']>,
  sunLight: InstanceType<ThreeModule['DirectionalLight']>,
  date: Date = new Date(),
  sunDistance = 24000,
): BerlinSolarState {
  const solar = getBerlinSolarState(date)

  sunLight.position.set(
    sunLight.target.position.x + solar.sunDirX * sunDistance,
    sunLight.target.position.y + solar.sunDirY * sunDistance,
    sunLight.target.position.z + solar.sunDirZ * sunDistance,
  )
  sunLight.color.set(solar.sunColorHex)
  sunLight.intensity = solar.sunIntensity
  sunLight.castShadow = solar.sunIntensity > 0.02

  hemiLight.color.set(solar.hemiSkyHex)
  hemiLight.groundColor.set(solar.hemiGroundHex)
  hemiLight.intensity = solar.hemiIntensity

  if (webglScene.background instanceof THREE.Color) {
    webglScene.background.set(solar.skyBgHex)
  } else {
    webglScene.background = new THREE.Color(solar.skyBgHex)
  }
  if (webglScene.fog) {
    webglScene.fog.color.set(solar.skyBgHex)
  }

  return solar
}
