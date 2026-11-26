import { useEffect, useRef, useState } from 'preact/hooks'
import {
  type BackgroundAudioController,
  mountBackgroundAudio,
  readStoredAudioSettings,
} from '../scene3d/backgroundAudio'
import { DEFAULT_ZEBRA_REEL_ID, getZebraReelById } from '../scene3d/config'
import { mountSceneEngine } from '../scene3d/createSceneEngine'
import {
  paintFrameSyncStamp,
  SYNC_STAMP_HEIGHT_PX,
  SYNC_STAMP_WIDTH_PX,
} from '../scene3d/recorder/frameSyncStamp'
import {
  type ActiveMediaCapture,
  startScreenAndAudioCapture,
} from '../scene3d/recorder/mediaCapture'
import {
  RecorderHud,
  type RecorderStatus,
} from '../scene3d/recorder/RecorderHud'
import {
  type NormalizedUvRect,
  RECORDING_FORMAT_ID,
  RECORDING_FORMAT_VERSION,
  type ReplayCameraFollowMode,
  type SceneRecordingManifest,
  type UnpackedRecordingSession,
} from '../scene3d/recorder/recordingTypes'
import {
  type BundleExtraAsset,
  packRecordingBundle,
  unpackRecordingBundle,
} from '../scene3d/recorder/zipBundle'
import { SceneHud } from '../scene3d/SceneHud'
import type {
  BarcodeScanEvent,
  FocusViewId,
  HeldItemMode,
  SceneController,
  SceneReplayHandle,
  ZebraMediaInfo,
  ZebraReelId,
} from '../scene3d/types'
import '../threeD.css'
import '../recorder3d.css'

function computeHudExclusionRects(stageEl: HTMLElement): NormalizedUvRect[] {
  const stageRect = stageEl.getBoundingClientRect()
  if (stageRect.width <= 0 || stageRect.height <= 0) return []
  const selectors = [
    '.rec3d-bar',
    '.rec3d-sync-stamp',
    '.scene3d-hud-group',
    '.scene3d-hud-nav',
    '.scene3d-stick',
    '.scene3d-zoom-ctrl',
    '.scene3d-scanner-btn',
  ]
  const out: NormalizedUvRect[] = []
  const root = stageEl.parentElement ?? stageEl
  for (const sel of selectors) {
    const nodes = root.querySelectorAll<HTMLElement>(sel)
    for (const el of Array.from(nodes)) {
      const style = window.getComputedStyle(el)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) < 0.05
      ) {
        continue
      }
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const pad = 4
      const uMin = Math.max(
        0,
        Math.min(1, (r.left - pad - stageRect.left) / stageRect.width),
      )
      const uMax = Math.max(
        0,
        Math.min(1, (r.right + pad - stageRect.left) / stageRect.width),
      )
      const vMax = Math.max(
        0,
        Math.min(1, 1 - (r.top - pad - stageRect.top) / stageRect.height),
      )
      const vMin = Math.max(
        0,
        Math.min(1, 1 - (r.bottom + pad - stageRect.top) / stageRect.height),
      )
      if (uMax > uMin && vMax > vMin) {
        out.push([
          Number(uMin.toFixed(4)),
          Number(vMin.toFixed(4)),
          Number(uMax.toFixed(4)),
          Number(vMax.toFixed(4)),
        ])
      }
    }
  }
  return out.slice(0, 10)
}

function buildRecordingFileName(isoDate: string): string {
  const d = new Date(isoDate)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(
    d.getDate(),
  )}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  return `quixpos-3d-${stamp}.q3d`
}

export function ThreeDRecRoute() {
  const stageRef = useRef<HTMLDivElement>(null)
  const cssLayerRef = useRef<HTMLDivElement>(null)
  const webglCanvasRef = useRef<HTMLCanvasElement>(null)

  const moveStickRef = useRef<HTMLDivElement>(null)
  const moveKnobRef = useRef<HTMLDivElement>(null)
  const moveMirrorRef = useRef<HTMLDivElement>(null)
  const moveMirrorDotRef = useRef<HTMLDivElement>(null)

  const aimStickRef = useRef<HTMLDivElement>(null)
  const aimKnobRef = useRef<HTMLDivElement>(null)
  const aimMirrorRef = useRef<HTMLDivElement>(null)
  const aimMirrorDotRef = useRef<HTMLDivElement>(null)

  const zoomCtrlRef = useRef<HTMLDivElement>(null)
  const zoomKnobRef = useRef<HTMLDivElement>(null)

  const laserReticleRef = useRef<HTMLDivElement>(null)
  const scannerPreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const syncStampCanvasRef = useRef<HTMLCanvasElement>(null)
  const audioMutedRef = useRef(false)

  const controllerRef = useRef<SceneController | null>(null)
  const bgAudioRef = useRef<BackgroundAudioController | null>(null)
  const mediaCaptureRef = useRef<ActiveMediaCapture | null>(null)
  const replayHandleRef = useRef<SceneReplayHandle | null>(null)
  const bundleBlobRef = useRef<Blob | null>(null)
  const unpackedSessionRef = useRef<UnpackedRecordingSession | null>(null)

  const [isTouchMode, setIsTouchMode] = useState(false)
  const [activeView, setActiveView] = useState<FocusViewId | null>('total')
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [heldMode, setHeldMode] = useState<HeldItemMode>('none')
  const [lastScan, setLastScan] = useState<BarcodeScanEvent | null>(null)
  const [zebraMedia, setZebraMedia] = useState<ZebraMediaInfo>(() =>
    getZebraReelById(DEFAULT_ZEBRA_REEL_ID),
  )
  const [isReelPickerOpen, setIsReelPickerOpen] = useState(false)

  // Recorder & Replay state
  const [recStatus, setRecStatus] = useState<RecorderStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [surfaceWarning, setSurfaceWarning] = useState<string | null>(null)
  const [includeMic, setIncludeMic] = useState(false)
  const [includeTabAudio, setIncludeTabAudio] = useState(true)
  const [cleanHud, setCleanHud] = useState(false)
  const [recordingStats, setRecordingStats] = useState({
    durationMs: 0,
    frameCount: 0,
    eventCount: 0,
  })
  const [sessionInfo, setSessionInfo] = useState<{
    durationMs: number
    sizeBytes: number
    frameCount: number
    eventCount: number
    fileName: string
  } | null>(null)

  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replayTimeMs, setReplayTimeMs] = useState(0)
  const [replayDurationMs, setReplayDurationMs] = useState(0)
  const [replaySpeed, setReplaySpeed] = useState(1)
  const [replayCameraFollow, setReplayCameraFollow] =
    useState<ReplayCameraFollowMode>('recorded')

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

    const storedAudio = readStoredAudioSettings()
    audioMutedRef.current = storedAudio.muted
    setIsAudioMuted(storedAudio.muted)

    const controller = mountSceneEngine({
      stageEl,
      cssLayerEl,
      canvasEl,
      touchCapable,
      stickRefs: {
        moveStickRef,
        moveKnobRef,
        moveMirrorRef,
        moveMirrorDotRef,
        aimStickRef,
        aimKnobRef,
        aimMirrorRef,
        aimMirrorDotRef,
        zoomCtrlRef,
        zoomKnobRef,
      },
      laserReticleRef,
      scannerPreviewCanvasRef,
      isAudioMuted: () => audioMutedRef.current,
      callbacks: {
        onActiveViewChange: setActiveView,
        onDrawerChange: () => {},
        onZebraReelChange: setZebraMedia,
        onZebraReelPickerOpen: () => setIsReelPickerOpen(true),
        onHeldModeChange: (mode) => {
          setHeldMode(mode)
          if (mode !== 'scanner') {
            setLastScan(null)
          }
        },
        onBarcodeScan: setLastScan,
      },
    })

    const bgAudio = mountBackgroundAudio('/Irish_Coffee.mp3', {
      initialMuted: storedAudio.muted,
    })
    bgAudioRef.current = bgAudio
    controllerRef.current = controller

    const onWindowResize = () => {
      if (mediaCaptureRef.current && stageRef.current) {
        controllerRef.current?.recordCustomEvent?.({
          type: 'hud:rects',
          rects: computeHudExclusionRects(stageRef.current),
        })
      }
    }
    window.addEventListener('resize', onWindowResize)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      mediaCaptureRef.current?.cancel()
      mediaCaptureRef.current = null
      replayHandleRef.current?.exit()
      replayHandleRef.current = null
      unpackedSessionRef.current?.dispose()
      unpackedSessionRef.current = null
      bundleBlobRef.current = null
      bgAudio.dispose()
      bgAudioRef.current = null
      controller.dispose()
      controllerRef.current = null
    }
  }, [])

  const stickRefs = {
    moveStickRef,
    moveKnobRef,
    moveMirrorRef,
    moveMirrorDotRef,
    aimStickRef,
    aimKnobRef,
    aimMirrorRef,
    aimMirrorDotRef,
    zoomCtrlRef,
    zoomKnobRef,
  }

  const isScreenFocusBlur =
    (activeView === 'left' ||
      activeView === 'center' ||
      activeView === 'right') &&
    heldMode === 'none'
  const isDrawerFocusBlur = activeView === 'drawer' && heldMode === 'none'

  useEffect(() => {
    // Pause room background music while replaying a recording so recorded audio plays cleanly
    if (recStatus === 'replaying') {
      bgAudioRef.current?.setMuted(true)
    } else {
      bgAudioRef.current?.setMuted(audioMutedRef.current)
      bgAudioRef.current?.setDucked(isScreenFocusBlur)
    }
  }, [isScreenFocusBlur, recStatus])

  const handleToggleAudioMute = () => {
    setIsAudioMuted((prev) => {
      const next = !prev
      audioMutedRef.current = next
      if (recStatus === 'replaying') {
        replayHandleRef.current?.setMuted(next)
      } else {
        bgAudioRef.current?.setMuted(next)
        controllerRef.current?.recordCustomEvent?.({
          type: 'audio:mute',
          muted: next,
        })
      }
      return next
    })
  }

  const handleSelectZebraReel = (reelId: ZebraReelId) => {
    controllerRef.current?.setZebraReel(reelId)
    controllerRef.current?.recordCustomEvent?.({
      type: 'zebra:pickerModal',
      open: false,
    })
    setIsReelPickerOpen(false)
  }

  const handleCloseReelPicker = () => {
    controllerRef.current?.recordCustomEvent?.({
      type: 'zebra:pickerModal',
      open: false,
    })
    setIsReelPickerOpen(false)
  }

  const replaceLoadedSession = (
    nextSession: UnpackedRecordingSession,
    nextBundle: Blob,
    fileName: string,
  ) => {
    unpackedSessionRef.current?.dispose()
    unpackedSessionRef.current = nextSession
    bundleBlobRef.current = nextBundle
    setSessionInfo({
      durationMs: nextSession.manifest.durationMs,
      sizeBytes: nextBundle.size,
      frameCount: nextSession.manifest.frames.length,
      eventCount: nextSession.manifest.events.length,
      fileName,
    })
  }

  const finalizeActiveRecording = async () => {
    const activeCap = mediaCaptureRef.current
    const controller = controllerRef.current
    if (!activeCap || !controller?.stopRecordingSession) return

    mediaCaptureRef.current = null
    syncStampCanvasRef.current?.classList.remove('is-active')
    setRecStatus('stopping')
    setSurfaceWarning(null)

    try {
      const [mediaRes, sceneRes] = await Promise.all([
        activeCap.stop(),
        controller.stopRecordingSession(),
      ])

      if (!sceneRes) {
        setRecStatus(unpackedSessionRef.current ? 'ready' : 'idle')
        return
      }

      const createdAt = new Date().toISOString()
      const videoFile = `capture.${mediaRes.fileExtension}`
      const shelfImageAssets: Record<string, string> = {}
      const extraAssets: BundleExtraAsset[] = []
      let imgIdx = 0
      for (const [origUrl, blob] of Object.entries(sceneRes.shelfImageBlobs)) {
        const zipPath = `assets/shelf-${imgIdx++}.webp`
        shelfImageAssets[origUrl] = zipPath
        extraAssets.push({ zipPath, blob })
      }

      const lastFrameMs =
        sceneRes.frames.length > 0
          ? sceneRes.frames[sceneRes.frames.length - 1][0]
          : 0
      const durationMs = Math.max(mediaRes.durationMs, lastFrameMs, 1)

      const manifest: SceneRecordingManifest = {
        format: RECORDING_FORMAT_ID,
        version: RECORDING_FORMAT_VERSION,
        createdAt,
        durationMs,
        videoFile,
        videoMimeType: mediaRes.mimeType,
        videoWidth: mediaRes.videoWidth,
        videoHeight: mediaRes.videoHeight,
        hasAudio: mediaRes.hasAudio,
        hasTabAudio: mediaRes.hasTabAudio,
        hasMicAudio: mediaRes.hasMicAudio,
        cleanHud,
        tablets: sceneRes.tablets,
        shelfImageAssets,
        initialSnapshot: sceneRes.initialSnapshot,
        frames: sceneRes.frames,
        events: sceneRes.events,
      }

      const bundleBlob = await packRecordingBundle(
        manifest,
        mediaRes.videoBlob,
        extraAssets,
      )
      const session = await unpackRecordingBundle(bundleBlob)
      const fileName = buildRecordingFileName(createdAt)
      replaceLoadedSession(session, bundleBlob, fileName)
      setRecStatus('ready')
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Aufnahme konnte nicht gespeichert werden.',
      )
      setRecStatus(unpackedSessionRef.current ? 'ready' : 'idle')
    }
  }

  const handleStartRecording = async () => {
    const controller = controllerRef.current
    const stageEl = stageRef.current
    if (!controller?.startRecordingSession || !stageEl) return

    setErrorMessage(null)
    setSurfaceWarning(null)
    setRecStatus('starting')
    setRecordingStats({ durationMs: 0, frameCount: 0, eventCount: 0 })

    try {
      const capture = await startScreenAndAudioCapture({
        includeTabAudio,
        includeMicAudio: includeMic,
        onExternalStop: () => {
          void finalizeActiveRecording()
        },
      })

      mediaCaptureRef.current = capture

      if (capture.displaySurface && capture.displaySurface !== 'browser') {
        setSurfaceWarning(
          'Tipp: Für exaktes 3D-Monitor-Mapping beim nächsten Mal „Diesen Tab“ statt Fenster/Bildschirm wählen.',
        )
      }

      setRecStatus('recording')

      const stampEl = syncStampCanvasRef.current
      const stampCtx = stampEl?.getContext('2d') ?? null
      if (stampEl && stampCtx) {
        paintFrameSyncStamp(stampCtx, 0)
        stampEl.classList.add('is-active')
      }

      controller.startRecordingSession?.({
        startedAtPerfNow: capture.startedAtPerfNow,
        getHudExclusionRects: () =>
          stageRef.current ? computeHudExclusionRects(stageRef.current) : [],
        paintSyncStamp: stampCtx
          ? (frameIdx) => paintFrameSyncStamp(stampCtx, frameIdx)
          : undefined,
        onStats: setRecordingStats,
      })

      // Refresh HUD exclusion rects once the recording bar layout commits
      requestAnimationFrame(() => {
        if (!mediaCaptureRef.current || !stageRef.current) return
        controller.recordCustomEvent?.({
          type: 'hud:rects',
          rects: computeHudExclusionRects(stageRef.current),
        })
      })
    } catch (err) {
      mediaCaptureRef.current = null
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Bildschirmfreigabe abgebrochen.'
          : err instanceof Error
            ? err.message
            : 'Aufnahme konnte nicht gestartet werden.'
      setErrorMessage(msg)
      setRecStatus(unpackedSessionRef.current ? 'ready' : 'idle')
    }
  }

  const handleStopRecording = () => {
    void finalizeActiveRecording()
  }

  const enterSessionReplay = (session: UnpackedRecordingSession) => {
    const controller = controllerRef.current
    if (!controller?.enterReplayMode) return

    replayHandleRef.current?.exit()
    setReplayTimeMs(0)
    setReplayDurationMs(session.manifest.durationMs)
    setReplaySpeed(1)
    setReplayCameraFollow('recorded')

    const handle = controller.enterReplayMode(session, {
      onProgress: (curMs, durMs, playing) => {
        setReplayTimeMs(curMs)
        setReplayDurationMs(durMs)
        setReplayPlaying(playing)
      },
      onCameraFollowChange: setReplayCameraFollow,
      onReelPickerModalChange: setIsReelPickerOpen,
    })

    if (!handle) {
      setErrorMessage('Replay-Modus konnte nicht initialisiert werden.')
      return
    }

    replayHandleRef.current = handle
    handle.setMuted(audioMutedRef.current)
    setRecStatus('replaying')
    setReplayPlaying(true)
    void handle.play()
  }

  const handleStartReplay = () => {
    if (!unpackedSessionRef.current) return
    setErrorMessage(null)
    enterSessionReplay(unpackedSessionRef.current)
  }

  const handleExitReplay = () => {
    replayHandleRef.current?.exit()
    replayHandleRef.current = null
    setReplayPlaying(false)
    setIsReelPickerOpen(false)
    setRecStatus(unpackedSessionRef.current ? 'ready' : 'idle')
  }

  const handleToggleReplayPlay = () => {
    const h = replayHandleRef.current
    if (!h) return
    if (replayPlaying) {
      h.pause()
      setReplayPlaying(false)
    } else {
      setReplayPlaying(true)
      void h.play()
    }
  }

  const handleSeekReplay = (timeMs: number) => {
    setReplayTimeMs(timeMs)
    replayHandleRef.current?.seek(timeMs)
  }

  const handleChangeReplaySpeed = (rate: number) => {
    setReplaySpeed(rate)
    replayHandleRef.current?.setPlaybackRate(rate)
  }

  const handleDownloadBundle = () => {
    const blob = bundleBlobRef.current
    if (!blob || !sessionInfo) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = sessionInfo.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const handleImportBundleFile = async (file: File) => {
    setErrorMessage(null)
    try {
      const session = await unpackRecordingBundle(file)
      replaceLoadedSession(session, file, file.name)
      enterSessionReplay(session)
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Aufnahmedatei konnte nicht geladen werden.',
      )
    }
  }

  const isCleanRecActive = recStatus === 'recording' && cleanHud

  return (
    <div
      class={`scene3d-page ${isTouchMode ? 'is-touch' : ''} ${
        isCleanRecActive ? 'is-clean-recording' : ''
      }`}
    >
      <div ref={stageRef} class="scene3d-stage is-cursor-mode">
        <div ref={cssLayerRef} class="scene3d-css-layer" />
        <canvas ref={webglCanvasRef} class="scene3d-webgl-layer" />
        <div
          class={`scene3d-drawer-blur ${isDrawerFocusBlur ? 'is-visible' : ''}`}
          aria-hidden="true"
        />

        <SceneHud
          isAudioMuted={isAudioMuted}
          activeView={activeView}
          heldMode={heldMode}
          lastScan={lastScan}
          zebraMedia={zebraMedia}
          isReelPickerOpen={isReelPickerOpen}
          stickRefs={stickRefs}
          laserReticleRef={laserReticleRef}
          scannerPreviewCanvasRef={scannerPreviewCanvasRef}
          onSelectView={(view) => controllerRef.current?.navigateToView(view)}
          onToggleAudioMute={handleToggleAudioMute}
          onSelectZebraReel={handleSelectZebraReel}
          onCloseReelPicker={handleCloseReelPicker}
          onRotateHeldLabel={() => controllerRef.current?.rotateHeldLabel()}
          onDropHeldItem={() => controllerRef.current?.dropHeldItem()}
          onToggleScanner={() => controllerRef.current?.toggleScanner()}
        />
      </div>

      <canvas
        ref={syncStampCanvasRef}
        width={SYNC_STAMP_WIDTH_PX}
        height={SYNC_STAMP_HEIGHT_PX}
        class={`rec3d-sync-stamp ${
          recStatus === 'recording' ? 'is-active' : ''
        }`}
        aria-hidden="true"
      />

      <RecorderHud
        status={recStatus}
        errorMessage={errorMessage}
        surfaceWarning={surfaceWarning}
        includeMic={includeMic}
        includeTabAudio={includeTabAudio}
        cleanHudWhileRecording={cleanHud}
        recordingStats={recordingStats}
        hasSession={sessionInfo !== null}
        sessionInfo={sessionInfo}
        replayPlaying={replayPlaying}
        replayTimeMs={replayTimeMs}
        replayDurationMs={replayDurationMs}
        replaySpeed={replaySpeed}
        replayCameraFollow={replayCameraFollow}
        onToggleMic={() => setIncludeMic((v) => !v)}
        onToggleTabAudio={() => setIncludeTabAudio((v) => !v)}
        onToggleCleanHud={() => setCleanHud((v) => !v)}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onStartReplay={handleStartReplay}
        onExitReplay={handleExitReplay}
        onToggleReplayPlay={handleToggleReplayPlay}
        onSeekReplay={handleSeekReplay}
        onChangeReplaySpeed={handleChangeReplaySpeed}
        onResetCameraFollow={() =>
          replayHandleRef.current?.setCameraFollowMode('recorded')
        }
        onToggleCameraFollow={() =>
          replayHandleRef.current?.setCameraFollowMode('free')
        }
        onDownloadBundle={handleDownloadBundle}
        onImportBundleFile={handleImportBundleFile}
        onDismissError={() => setErrorMessage(null)}
      />
    </div>
  )
}

export default ThreeDRecRoute
