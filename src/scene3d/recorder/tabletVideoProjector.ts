import type { Texture, WebGLRenderTarget } from 'three'
import type { Disposable, TabletInstance, ThreeModule } from '../types'
import {
  decodeFrameSyncStamp,
  SYNC_STAMP_HEIGHT_PX,
  SYNC_STAMP_WIDTH_PX,
} from './frameSyncStamp'
import type {
  NormalizedUvRect,
  RecordedFrameTuple,
  SceneRecordingManifest,
} from './recordingTypes'

const MAX_HUD_RECTS = 10

const UNWARP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const UNWARP_FRAG = /* glsl */ `
  uniform sampler2D tVideo;
  uniform mat4 uTabletMatrixWorld;
  uniform vec2 uCutoutSize;
  uniform vec2 uInnerHalfSize;
  uniform mat4 uRecordedViewProj;
  uniform vec4 uHudRects[10];
  uniform int uHudRectCount;
  uniform vec3 uReticleUv;
  varying vec2 vUv;

  void main() {
    vec2 localXY = (vUv - 0.5) * uCutoutSize;
    vec2 clampedXY = clamp(localXY, -uInnerHalfSize, uInnerHalfSize);
    vec4 worldPos = uTabletMatrixWorld * vec4(clampedXY, 0.0, 1.0);
    vec4 clip = uRecordedViewProj * worldPos;
    if (clip.w <= 1.0) discard;

    vec2 ndc = clip.xy / clip.w;
    vec2 vidUv = ndc * 0.5 + 0.5;

    if (vidUv.x < 0.002 || vidUv.x > 0.998 || vidUv.y < 0.002 || vidUv.y > 0.998) {
      discard;
    }

    for (int i = 0; i < 10; i++) {
      if (i >= uHudRectCount) break;
      vec4 r = uHudRects[i];
      if (vidUv.x >= r.x && vidUv.x <= r.z && vidUv.y >= r.y && vidUv.y <= r.w) {
        discard;
      }
    }

    if (uReticleUv.z > 0.5) {
      vec2 d = abs(vidUv - uReticleUv.xy);
      if (d.x < 0.045 && d.y < 0.052) {
        discard;
      }
    }

    gl_FragColor = vec4(texture2D(tVideo, vidUv).rgb, 1.0);
  }
`

export interface InterpolatedFrameSample {
  tMs: number
  camX: number
  camY: number
  camZ: number
  yaw: number
  pitch: number
  fov: number
  stageW: number
  stageH: number
  cursorU: number
  cursorV: number
  moveKnobX: number
  moveKnobY: number
  aimKnobX: number
  aimKnobY: number
  zoomNorm: number
  flags: number
}

export function tupleToSample(f: RecordedFrameTuple): InterpolatedFrameSample {
  return {
    tMs: f[0],
    camX: f[1],
    camY: f[2],
    camZ: f[3],
    yaw: f[4],
    pitch: f[5],
    fov: f[6],
    stageW: f[7],
    stageH: f[8],
    cursorU: f[9],
    cursorV: f[10],
    moveKnobX: f[11],
    moveKnobY: f[12],
    aimKnobX: f[13],
    aimKnobY: f[14],
    zoomNorm: f[15],
    flags: f[16],
  }
}

export function sampleRecordedFrames(
  frames: RecordedFrameTuple[],
  tMs: number,
  fallback: InterpolatedFrameSample,
): InterpolatedFrameSample {
  if (frames.length === 0) return fallback
  if (tMs <= frames[0][0]) {
    return tupleToSample(frames[0])
  }
  const last = frames[frames.length - 1]
  if (tMs >= last[0]) {
    return tupleToSample(last)
  }

  let lo = 0
  let hi = frames.length - 2
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (frames[mid][0] <= tMs) {
      if (frames[mid + 1][0] >= tMs) {
        lo = mid
        break
      }
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  const a = frames[lo]
  const b = frames[Math.min(frames.length - 1, lo + 1)]
  const span = b[0] - a[0]
  const alpha = span > 0.001 ? Math.max(0, Math.min(1, (tMs - a[0]) / span)) : 0

  let dYaw = (b[4] - a[4]) % (Math.PI * 2)
  if (dYaw > Math.PI) dYaw -= Math.PI * 2
  if (dYaw < -Math.PI) dYaw += Math.PI * 2

  return {
    tMs,
    camX: a[1] + (b[1] - a[1]) * alpha,
    camY: a[2] + (b[2] - a[2]) * alpha,
    camZ: a[3] + (b[3] - a[3]) * alpha,
    yaw: a[4] + dYaw * alpha,
    pitch: a[5] + (b[5] - a[5]) * alpha,
    fov: a[6] + (b[6] - a[6]) * alpha,
    stageW: alpha < 0.5 ? a[7] : b[7],
    stageH: alpha < 0.5 ? a[8] : b[8],
    cursorU: a[9] + (b[9] - a[9]) * alpha,
    cursorV: a[10] + (b[10] - a[10]) * alpha,
    moveKnobX: a[11] + (b[11] - a[11]) * alpha,
    moveKnobY: a[12] + (b[12] - a[12]) * alpha,
    aimKnobX: a[13] + (b[13] - a[13]) * alpha,
    aimKnobY: a[14] + (b[14] - a[14]) * alpha,
    zoomNorm: a[15] + (b[15] - a[15]) * alpha,
    flags: alpha < 0.5 ? a[16] : b[16],
  }
}

export interface SyncedVideoFrameResult {
  sample: InterpolatedFrameSample
  hasExactStamp: boolean
  mediaTimeMs: number
}

export interface TabletVideoProjector extends Disposable {
  videoEl: HTMLVideoElement
  getScreenMaterial: (
    tabletId: string,
  ) => InstanceType<ThreeModule['MeshBasicMaterial']> | null
  clearTabletCache: (tabletId: string) => void
  setHudExclusionRects: (rects: NormalizedUvRect[]) => void
  /**
   * Resolves the exact recorded frame sample matching the currently decoded `<video>` frame
   * (via optical frame-index sync stamp when available, or compositor mediaTime fallback).
   */
  resolveCurrentFrameSample: (
    fallbackTimeMs: number,
    fallbackSample: InterpolatedFrameSample,
  ) => SyncedVideoFrameResult
  /**
   * Projects the current decoded video frame onto all powered-on front-facing
   * 3D tablet caches using `sample` (already synced to the decoded video frame).
   */
  update: (
    sample: InterpolatedFrameSample,
    scannerActiveAtMediaTime: boolean,
    forceUpdate?: boolean,
  ) => void
}

interface PerTabletTarget {
  tablet: TabletInstance
  rt: WebGLRenderTarget<Texture>
  mat: InstanceType<ThreeModule['MeshBasicMaterial']>
  cutoutW: number
  cutoutH: number
  innerHalfW: number
  innerHalfH: number
}

export function createTabletVideoProjector(
  THREE: ThreeModule,
  renderer: InstanceType<ThreeModule['WebGLRenderer']>,
  tabletInstances: TabletInstance[],
  videoUrl: string,
  manifest: SceneRecordingManifest,
): TabletVideoProjector {
  let disposed = false

  // Keep `<video>` non-occluded in the live compositor tree (2x2px, opacity 0.02)
  // so Chromium never activates 1 Hz Background Video Track Throttling.
  const videoEl = document.createElement('video')
  videoEl.src = videoUrl
  videoEl.playsInline = true
  videoEl.preload = 'auto'
  videoEl.crossOrigin = 'anonymous'
  videoEl.style.cssText =
    'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:9999;'
  document.body.appendChild(videoEl)

  // MUST use THREE.VideoTexture (sets `isVideoTexture = true`) so Three.js WebGL2
  // uses mutable `texImage2D` instead of `texStorage2D(videoEl.width=0, videoEl.height=0)`!
  const videoTex = new THREE.VideoTexture(videoEl)
  videoTex.minFilter = THREE.LinearFilter
  videoTex.magFilter = THREE.LinearFilter
  videoTex.colorSpace = THREE.NoColorSpace
  videoTex.generateMipmaps = false

  const syncReadCanvas = document.createElement('canvas')
  syncReadCanvas.width = SYNC_STAMP_WIDTH_PX
  syncReadCanvas.height = SYNC_STAMP_HEIGHT_PX
  const syncReadCtx = syncReadCanvas.getContext('2d', {
    willReadFrequently: true,
  })

  let rvfcMediaTimeMs: number | null = null
  let rvfcUpdatedPerfNow = 0
  let forceNextProjection = true

  type RvfcVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (
      cb: (now: number, metadata: { mediaTime: number }) => void,
    ) => number
    cancelVideoFrameCallback?: (id: number) => void
  }
  const rvfcVideo = videoEl as RvfcVideo
  let rvfcHandle = 0

  const scheduleRvfc = () => {
    if (disposed || typeof rvfcVideo.requestVideoFrameCallback !== 'function') {
      return
    }
    rvfcHandle = rvfcVideo.requestVideoFrameCallback((now, metadata) => {
      if (disposed) return
      rvfcMediaTimeMs = metadata.mediaTime * 1000
      rvfcUpdatedPerfNow = now
      forceNextProjection = true
      scheduleRvfc()
    })
  }
  scheduleRvfc()

  const onSeekedOrLoaded = () => {
    rvfcMediaTimeMs = videoEl.currentTime * 1000
    rvfcUpdatedPerfNow = performance.now()
    forceNextProjection = true
  }
  videoEl.addEventListener('loadeddata', onSeekedOrLoaded)
  videoEl.addEventListener('seeked', onSeekedOrLoaded)

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const clearColorTmp = new THREE.Color()
  const darkBootColor = new THREE.Color('#0b1220')

  const clearRenderTarget = (rt: WebGLRenderTarget<Texture>) => {
    const prevClearAlpha = renderer.getClearAlpha()
    renderer.getClearColor(clearColorTmp)
    renderer.setRenderTarget(rt)
    renderer.setClearColor(darkBootColor, 1)
    renderer.clear(true, false, false)
    renderer.setClearColor(clearColorTmp, prevClearAlpha)
    renderer.setRenderTarget(null)
  }

  const targetsByTablet = new Map<string, PerTabletTarget>()
  for (const t of tabletInstances) {
    const spec = t.spec
    const visibleW = spec.crop ? spec.crop.w : spec.cssW
    const visibleH = spec.crop ? spec.crop.h : spec.cssH
    const screenW = Math.round(visibleW * spec.physicalScale)
    const screenH = Math.round(visibleH * spec.physicalScale)
    const cutoutW = screenW + 12
    const cutoutH = screenH + 12

    const rt = new THREE.WebGLRenderTarget(visibleW, visibleH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
    })
    rt.texture.colorSpace = THREE.SRGBColorSpace
    rt.texture.anisotropy = maxAniso
    clearRenderTarget(rt)

    const mat = new THREE.MeshBasicMaterial({
      map: rt.texture,
      side: THREE.FrontSide,
      toneMapped: false,
    })

    targetsByTablet.set(spec.id, {
      tablet: t,
      rt,
      mat,
      cutoutW,
      cutoutH,
      innerHalfW: Math.max(10, screenW * 0.5 - 2),
      innerHalfH: Math.max(10, screenH * 0.5 - 2),
    })
  }

  const hudRectUniforms = Array.from(
    { length: MAX_HUD_RECTS },
    () => new THREE.Vector4(0, 0, 0, 0),
  )
  let hudRectCount = 0

  const setHudExclusionRects = (rects: NormalizedUvRect[]) => {
    hudRectCount = Math.min(MAX_HUD_RECTS, rects.length)
    for (let i = 0; i < MAX_HUD_RECTS; i++) {
      if (i < hudRectCount) {
        const [x0, y0, x1, y1] = rects[i]
        hudRectUniforms[i].set(x0, y0, x1, y1)
      } else {
        hudRectUniforms[i].set(0, 0, 0, 0)
      }
    }
  }
  setHudExclusionRects(manifest.initialSnapshot.hudExclusionRects ?? [])

  const tabletMatrixUniform = new THREE.Matrix4()
  const recordedViewProjUniform = new THREE.Matrix4()
  const cutoutSizeUniform = new THREE.Vector2(1, 1)
  const innerHalfUniform = new THREE.Vector2(1, 1)
  const reticleUvUniform = new THREE.Vector3(0.5, 0.5, 0)

  const unwarpMat = new THREE.ShaderMaterial({
    uniforms: {
      tVideo: { value: videoTex },
      uTabletMatrixWorld: { value: tabletMatrixUniform },
      uCutoutSize: { value: cutoutSizeUniform },
      uInnerHalfSize: { value: innerHalfUniform },
      uRecordedViewProj: { value: recordedViewProjUniform },
      uHudRects: { value: hudRectUniforms },
      uHudRectCount: { value: hudRectCount },
      uReticleUv: { value: reticleUvUniform },
    },
    vertexShader: UNWARP_VERT,
    fragmentShader: UNWARP_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  })

  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quadGeo = new THREE.PlaneGeometry(2, 2)
  const quadMesh = new THREE.Mesh(quadGeo, unwarpMat)
  const quadScene = new THREE.Scene()
  quadScene.add(quadMesh)

  const recCam = new THREE.PerspectiveCamera(58, 16 / 9, 120, 160000)
  recCam.rotation.order = 'YXZ'
  const tmpWorldPos = new THREE.Vector3()
  const tmpWorldQuat = new THREE.Quaternion()
  const tmpNormal = new THREE.Vector3()
  const tmpToRecCam = new THREE.Vector3()

  let lastProjectedStampOrTime = -1
  let cachedStampVideoTime = -1
  let cachedStampFrameIdx: number | null = null
  // Track measured container-to-manifest clock offset whenever stamps are read
  let measuredClockOffsetMs = 0

  const resolveCurrentFrameSample = (
    fallbackTimeMs: number,
    fallbackSample: InterpolatedFrameSample,
  ): SyncedVideoFrameResult => {
    const rawVideoMs =
      videoEl.readyState >= 2 ? videoEl.currentTime * 1000 : fallbackTimeMs
    const useRvfc =
      rvfcMediaTimeMs !== null &&
      performance.now() - rvfcUpdatedPerfNow < 90 &&
      Math.abs(rvfcMediaTimeMs - rawVideoMs) < 350
    const mediaTimeMs = useRvfc ? rvfcMediaTimeMs! : rawVideoMs

    if (
      syncReadCtx &&
      videoEl.readyState >= 2 &&
      manifest.frames.length > 0
    ) {
      if (
        forceNextProjection ||
        Math.abs(mediaTimeMs - cachedStampVideoTime) >= 4
      ) {
        cachedStampVideoTime = mediaTimeMs
        const approx = sampleRecordedFrames(
          manifest.frames,
          mediaTimeMs + measuredClockOffsetMs,
          fallbackSample,
        )
        const refW =
          approx.stageW || manifest.initialSnapshot.camera.stageW || 1920
        const refH =
          approx.stageH || manifest.initialSnapshot.camera.stageH || 1080
        cachedStampFrameIdx = decodeFrameSyncStamp(
          syncReadCtx,
          videoEl,
          refW,
          refH,
          manifest.frames.length,
        )
      }

      if (cachedStampFrameIdx !== null) {
        const exactSample = tupleToSample(manifest.frames[cachedStampFrameIdx])
        measuredClockOffsetMs = exactSample.tMs - mediaTimeMs
        return {
          sample: exactSample,
          hasExactStamp: true,
          mediaTimeMs: exactSample.tMs,
        }
      }
    }

    const calibratedMs = Math.max(0, mediaTimeMs + measuredClockOffsetMs)
    return {
      sample: sampleRecordedFrames(
        manifest.frames,
        calibratedMs,
        fallbackSample,
      ),
      hasExactStamp: false,
      mediaTimeMs: calibratedMs,
    }
  }

  const update = (
    sample: InterpolatedFrameSample,
    scannerActiveAtMediaTime: boolean,
    forceUpdate = false,
  ) => {
    if (disposed || videoEl.readyState < 2 || videoEl.seeking) return

    const key = cachedStampFrameIdx !== null ? cachedStampFrameIdx : sample.tMs
    if (
      !forceUpdate &&
      !forceNextProjection &&
      Math.abs(key - lastProjectedStampOrTime) < 0.5
    ) {
      return
    }
    forceNextProjection = false
    lastProjectedStampOrTime = key
    videoTex.needsUpdate = true

    const aspect = Math.max(0.25, sample.stageW / Math.max(1, sample.stageH))
    recCam.fov = sample.fov
    recCam.aspect = aspect
    recCam.updateProjectionMatrix()
    recCam.position.set(sample.camX, sample.camY, sample.camZ)
    recCam.rotation.set(sample.pitch, sample.yaw, 0, 'YXZ')
    recCam.updateMatrixWorld(true)

    recordedViewProjUniform.multiplyMatrices(
      recCam.projectionMatrix,
      recCam.matrixWorldInverse,
    )

    unwarpMat.uniforms.uHudRectCount.value = hudRectCount
    if (scannerActiveAtMediaTime) {
      reticleUvUniform.set(sample.cursorU, 1 - sample.cursorV, 1)
    } else {
      reticleUvUniform.set(0.5, 0.5, 0)
    }

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false

    for (const item of targetsByTablet.values()) {
      const { tablet, rt, cutoutW, cutoutH, innerHalfW, innerHalfH } = item
      if (!tablet.poweredOn) continue

      tablet.cutoutMesh.updateMatrixWorld(true)
      tablet.cutoutMesh.getWorldPosition(tmpWorldPos)
      tablet.cutoutMesh.getWorldQuaternion(tmpWorldQuat)
      tmpNormal.set(0, 0, 1).applyQuaternion(tmpWorldQuat)
      tmpToRecCam.copy(recCam.position).sub(tmpWorldPos).normalize()

      if (tmpNormal.dot(tmpToRecCam) <= 0.12) continue

      tabletMatrixUniform.copy(tablet.cutoutMesh.matrixWorld)
      cutoutSizeUniform.set(cutoutW, cutoutH)
      innerHalfUniform.set(innerHalfW, innerHalfH)

      renderer.setRenderTarget(rt)
      renderer.render(quadScene, orthoCam)
    }

    renderer.autoClear = prevAutoClear
    renderer.setRenderTarget(null)
  }

  return {
    videoEl,
    getScreenMaterial: (tabletId: string) =>
      targetsByTablet.get(tabletId)?.mat ?? null,
    clearTabletCache: (tabletId: string) => {
      const target = targetsByTablet.get(tabletId)
      if (target) clearRenderTarget(target.rt)
    },
    setHudExclusionRects,
    resolveCurrentFrameSample,
    update,
    dispose: () => {
      if (disposed) return
      disposed = true
      if (
        rvfcHandle &&
        typeof rvfcVideo.cancelVideoFrameCallback === 'function'
      ) {
        rvfcVideo.cancelVideoFrameCallback(rvfcHandle)
      }
      videoEl.removeEventListener('loadeddata', onSeekedOrLoaded)
      videoEl.removeEventListener('seeked', onSeekedOrLoaded)
      videoEl.pause()
      videoEl.removeAttribute('src')
      videoEl.load()
      videoEl.remove()
      videoTex.dispose()
      quadGeo.dispose()
      unwarpMat.dispose()
      for (const item of targetsByTablet.values()) {
        item.rt.dispose()
        item.mat.dispose()
      }
      targetsByTablet.clear()
    },
  }
}
