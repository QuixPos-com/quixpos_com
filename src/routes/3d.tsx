import { useEffect, useRef, useState } from 'preact/hooks'
import {
  type BackgroundAudioController,
  mountBackgroundAudio,
  readStoredAudioSettings,
} from '../scene3d/backgroundAudio'
import { DEFAULT_ZEBRA_REEL_ID, getZebraReelById } from '../scene3d/config'
import { mountSceneEngine } from '../scene3d/createSceneEngine'
import { SceneHud } from '../scene3d/SceneHud'
import type {
  BarcodeScanEvent,
  FocusViewId,
  HeldItemMode,
  SceneController,
  TargetedDevice,
  ZebraMediaInfo,
  ZebraReelId,
} from '../scene3d/types'
import '../threeD.css'

export function ThreeDRoute() {
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
  const audioMutedRef = useRef(false)

  const controllerRef = useRef<SceneController | null>(null)
  const bgAudioRef = useRef<BackgroundAudioController | null>(null)

  const [isLocked, setIsLocked] = useState(false)
  const [isTouchMode, setIsTouchMode] = useState(false)
  const [targetedTablet, setTargetedTablet] = useState<TargetedDevice | null>(null)
  const [activeView, setActiveView] = useState<FocusViewId | null>('total')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [heldMode, setHeldMode] = useState<HeldItemMode>('none')
  const [lastScan, setLastScan] = useState<BarcodeScanEvent | null>(null)
  const [zebraMedia, setZebraMedia] = useState<ZebraMediaInfo>(() =>
    getZebraReelById(DEFAULT_ZEBRA_REEL_ID),
  )
  const [isReelPickerOpen, setIsReelPickerOpen] = useState(false)

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
        onLockChange: setIsLocked,
        onTargetChange: setTargetedTablet,
        onActiveViewChange: setActiveView,
        onDrawerChange: setIsDrawerOpen,
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

    return () => {
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
    (activeView === 'left' || activeView === 'center' || activeView === 'right') &&
    heldMode === 'none'
  const isDrawerFocusBlur = activeView === 'drawer' && heldMode === 'none'

  useEffect(() => {
    bgAudioRef.current?.setDucked(isScreenFocusBlur)
  }, [isScreenFocusBlur])

  const handleToggleAudioMute = () => {
    setIsAudioMuted((prev) => {
      const next = !prev
      audioMutedRef.current = next
      bgAudioRef.current?.setMuted(next)
      return next
    })
  }

  const handleSelectZebraReel = (reelId: ZebraReelId) => {
    controllerRef.current?.setZebraReel(reelId)
    setIsReelPickerOpen(false)
  }

  return (
    <div class={`scene3d-page ${isTouchMode ? 'is-touch' : ''}`}>
      <div
        ref={stageRef}
        class={`scene3d-stage ${isLocked ? '' : 'is-cursor-mode'}`}
      >
        <div ref={cssLayerRef} class="scene3d-css-layer" />
        <canvas ref={webglCanvasRef} class="scene3d-webgl-layer" />
        <div
          class={`scene3d-drawer-blur ${isDrawerFocusBlur ? 'is-visible' : ''}`}
          aria-hidden="true"
        />

        <SceneHud
          isLocked={isLocked}
          isDrawerOpen={isDrawerOpen}
          isAudioMuted={isAudioMuted}
          activeView={activeView}
          targetedTablet={targetedTablet}
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
          onCloseReelPicker={() => setIsReelPickerOpen(false)}
          onRotateHeldLabel={() => controllerRef.current?.rotateHeldLabel()}
          onDropHeldItem={() => controllerRef.current?.dropHeldItem()}
          onToggleScanner={() => controllerRef.current?.toggleScanner()}
        />
      </div>
    </div>
  )
}

export default ThreeDRoute
