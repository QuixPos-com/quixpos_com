import { useEffect, useRef, useState } from 'preact/hooks'
import { mountBackgroundAudio } from '../scene3d/backgroundAudio'
import { mountSceneEngine } from '../scene3d/createSceneEngine'
import { SceneHud } from '../scene3d/SceneHud'
import type {
  FocusViewId,
  SceneController,
  TargetedDevice,
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

  const controllerRef = useRef<SceneController | null>(null)

  const [isLocked, setIsLocked] = useState(false)
  const [isTouchMode, setIsTouchMode] = useState(false)
  const [targetedTablet, setTargetedTablet] = useState<TargetedDevice | null>(null)
  const [activeView, setActiveView] = useState<FocusViewId | null>('total')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

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
      },
      callbacks: {
        onLockChange: setIsLocked,
        onTargetChange: setTargetedTablet,
        onActiveViewChange: setActiveView,
        onDrawerChange: setIsDrawerOpen,
      },
    })
    const bgAudio = mountBackgroundAudio('/Irish_Coffee.mp3')
    controllerRef.current = controller

    return () => {
      bgAudio.dispose()
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
  }

  const isScreenFocusBlur =
    activeView === 'left' || activeView === 'center' || activeView === 'right'
  const isDrawerFocusBlur = activeView === 'drawer'

  return (
    <div class={`scene3d-page ${isTouchMode ? 'is-touch' : ''}`}>
      <div
        ref={stageRef}
        class={`scene3d-stage ${isLocked ? '' : 'is-cursor-mode'}`}
      >
        <div ref={cssLayerRef} class="scene3d-css-layer" />
        <canvas
          ref={webglCanvasRef}
          class={`scene3d-webgl-layer ${isScreenFocusBlur ? 'is-blurred' : ''}`}
        />
        <div
          class={`scene3d-drawer-blur ${isDrawerFocusBlur ? 'is-visible' : ''}`}
          aria-hidden="true"
        />

        <SceneHud
          isLocked={isLocked}
          isDrawerOpen={isDrawerOpen}
          activeView={activeView}
          targetedTablet={targetedTablet}
          stickRefs={stickRefs}
          onSelectView={(view) => controllerRef.current?.navigateToView(view)}
        />
      </div>
    </div>
  )
}

export default ThreeDRoute
