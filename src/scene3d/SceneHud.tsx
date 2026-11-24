import type { RefObject } from 'preact'
import { useEffect } from 'preact/hooks'
import { Link } from '../components/Router'
import { ZEBRA_REELS } from './config'
import type {
  BarcodeScanEvent,
  FocusViewId,
  HeldItemMode,
  NavPresetId,
  TouchStickRefs,
  ZebraMediaInfo,
  ZebraReelId,
} from './types'

export interface SceneHudProps {
  isAudioMuted: boolean
  activeView: FocusViewId | null
  heldMode: HeldItemMode
  lastScan: BarcodeScanEvent | null
  zebraMedia: ZebraMediaInfo
  isReelPickerOpen: boolean
  stickRefs: TouchStickRefs
  laserReticleRef: RefObject<HTMLDivElement | null>
  scannerPreviewCanvasRef: RefObject<HTMLCanvasElement | null>
  onSelectView: (view: NavPresetId) => void
  onToggleAudioMute: () => void
  onSelectZebraReel: (reelId: ZebraReelId) => void
  onCloseReelPicker: () => void
  onRotateHeldLabel: () => void
  onDropHeldItem: () => void
  onToggleScanner: () => void
}

const NAV_ITEMS: Array<{
  id: NavPresetId
  label: string
}> = [
    { id: 'total', label: 'Gesamtansicht' },
    { id: 'left', label: 'Büro' },
    { id: 'center', label: 'Kasse' },
    { id: 'right', label: 'Kunde' },
    { id: 'drawer', label: 'Kassenschublade' },
  ]

export function SceneHud({
  isAudioMuted,
  activeView,
  heldMode,
  lastScan,
  zebraMedia,
  isReelPickerOpen,
  stickRefs,
  laserReticleRef,
  scannerPreviewCanvasRef,
  onSelectView,
  onToggleAudioMute,
  onSelectZebraReel,
  onCloseReelPicker,
  onRotateHeldLabel,
  onDropHeldItem,
  onToggleScanner,
}: SceneHudProps) {
  useEffect(() => {
    if (!isReelPickerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseReelPicker()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isReelPickerOpen, onCloseReelPicker])

  return (
    <>
      {/* Laser crosshair & optical spot frame when holding the barcode scanner */}
      <div
        ref={laserReticleRef}
        class="scene3d-laser-reticle"
        aria-hidden="true"
      >
        <span class="scene3d-laser-corner is-tl" />
        <span class="scene3d-laser-corner is-tr" />
        <span class="scene3d-laser-corner is-bl" />
        <span class="scene3d-laser-corner is-br" />
        <span class="scene3d-laser-line-h" />
        <span class="scene3d-laser-line-v" />
        <span class="scene3d-laser-dot" />
      </div>

      <div class="scene3d-hud-top">
        <div class="scene3d-hud-group">
          <Link class="scene3d-pill" href="/">
            ← Startseite
          </Link>
          <button
            type="button"
            class={`scene3d-pill scene3d-icon-pill ${isAudioMuted ? 'is-muted' : ''
              }`}
            onClick={onToggleAudioMute}
            aria-pressed={isAudioMuted}
            aria-label={isAudioMuted ? 'Ton einschalten' : 'Ton ausschalten'}
            title={isAudioMuted ? 'Ton einschalten' : 'Ton ausschalten'}
          >
            {isAudioMuted ? (
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
        </div>

        <nav class="scene3d-hud-nav" aria-label="Kamera-Ansichten">
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                class={`scene3d-pill ${active ? 'is-active' : ''}`}
                onClick={() => onSelectView(item.id)}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>

      {heldMode !== 'none' && (
        <div class="scene3d-hud-bottom">
          {heldMode === 'label' && (
            <div class="scene3d-held-bar">
              <span class="scene3d-held-status">
                Etikett aufgenommen — auf Tisch oder Oberfläche klicken zum
                Platzieren
              </span>
              <div class="scene3d-held-actions">
                <button
                  type="button"
                  class="scene3d-held-btn"
                  onClick={onRotateHeldLabel}
                >
                  ↻ Drehen (R)
                </button>
                <button
                  type="button"
                  class="scene3d-held-btn is-secondary"
                  onClick={onDropHeldItem}
                >
                  Ablegen (Esc)
                </button>
              </div>
            </div>
          )}

          {heldMode === 'scanner' && (
            <div class="scene3d-held-bar is-scanner">
              <div
                class="scene3d-sensor-box"
                title="Live-Ausschnitt um das Laser-Fadenkreuz"
              >
                <canvas
                  ref={scannerPreviewCanvasRef}
                  class="scene3d-sensor-canvas"
                  width={960}
                  height={600}
                />
                <span class="scene3d-sensor-laser" aria-hidden="true" />
              </div>

              <div class="scene3d-scanner-info">
                <div class="scene3d-scanner-title">
                  Barcode-Scanner in der Hand
                </div>
                {lastScan ? (
                  <div class="scene3d-scanner-readout is-decoded">
                    ✓ <code>{lastScan.code}</code>{' '}
                    <span class="scene3d-scanner-meta">
                      ({lastScan.format}
                      {lastScan.deliveredToTablet
                        ? ' → Kasse'
                        : ' · Kasse ausgeschaltet'}
                      )
                    </span>
                  </div>
                ) : (
                  <div class="scene3d-scanner-readout">
                    Laser-Fadenkreuz auf Barcode richten und klicken zum Scannen
                  </div>
                )}
              </div>

              <div class="scene3d-held-actions">
                <button
                  type="button"
                  class="scene3d-held-btn is-secondary"
                  onClick={onDropHeldItem}
                >
                  Ablegen (Esc)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isReelPickerOpen && (
        <div
          class="scene3d-reel-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Zebra ZD420 Rollenwechsel"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseReelPicker()
          }}
        >
          <div class="scene3d-reel-card">
            <div class="scene3d-reel-header">
              <div>
                <div class="scene3d-reel-title">Zebra ZD420 · Etikettenrolle</div>
                <div class="scene3d-reel-sub">
                  Aktiv: {zebraMedia.label} ({zebraMedia.widthPx} ×{' '}
                  {zebraMedia.heightPx} px · {zebraMedia.dpi} DPI)
                </div>
              </div>
              <button
                type="button"
                class="scene3d-reel-close"
                onClick={onCloseReelPicker}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <div class="scene3d-reel-grid">
              {ZEBRA_REELS.map((reel) => {
                const active = reel.id === zebraMedia.id
                return (
                  <button
                    key={reel.id}
                    type="button"
                    class={`scene3d-reel-option ${active ? 'is-active' : ''}`}
                    onClick={() => onSelectZebraReel(reel.id)}
                  >
                    <span class="scene3d-reel-size">{reel.label}</span>
                    <span class="scene3d-reel-meta">
                      {reel.widthPx} × {reel.heightPx} px · {reel.dpi} DPI
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stick Mirrors (appear unobstructed above thumb/cursor when touched or dragged) */}
      <div
        ref={stickRefs.moveMirrorRef}
        class="scene3d-stick-mirror is-left"
        aria-hidden="true"
      >
        <span class="scene3d-stick-mirror-title">Bewegen</span>
        <div class="scene3d-mirror-crosshair" />
        <div class="scene3d-mirror-deadzone" />
        <div class="scene3d-mirror-center" />
        <div ref={stickRefs.moveMirrorDotRef} class="scene3d-mirror-dot" />
      </div>

      <div
        ref={stickRefs.aimMirrorRef}
        class="scene3d-stick-mirror is-right"
        aria-hidden="true"
      >
        <span class="scene3d-stick-mirror-title">Umsehen</span>
        <div class="scene3d-mirror-crosshair" />
        <div class="scene3d-mirror-deadzone" />
        <div class="scene3d-mirror-center" />
        <div ref={stickRefs.aimMirrorDotRef} class="scene3d-mirror-dot" />
      </div>

      {/* Dual Virtual Sticks (available on both desktop & mobile) */}
      <div
        ref={stickRefs.moveStickRef}
        class="scene3d-stick is-left"
        aria-label="Bewegungs-Stick"
      >
        <span class="scene3d-stick-label">Bewegen</span>
        <div class="scene3d-stick-crosshair" aria-hidden="true" />
        <div class="scene3d-stick-deadzone" aria-hidden="true" />
        <div ref={stickRefs.moveKnobRef} class="scene3d-stick-knob">
          <span class="scene3d-knob-move-combo" aria-hidden="true">
            <span class="scene3d-knob-wasd">
              <span>W</span>
              <span>ASD</span>
            </span>
            <span class="scene3d-knob-slash">/</span>
            <svg
              class="scene3d-knob-mouse"
              viewBox="0 0 24 28"
              width="14"
              height="16"
              aria-hidden="true"
            >
              {/* Click indicator arc above left mouse button */}
              <path
                d="M3.2 7.5 A5.5 5.5 0 0 1 8.8 2"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              {/* Mouse body */}
              <rect
                x="4"
                y="3.5"
                width="16"
                height="21.5"
                rx="8"
                fill="rgba(255, 255, 255, 0.22)"
                stroke="currentColor"
                stroke-width="2"
              />
              {/* Highlighted left mouse button */}
              <path
                d="M12 3.5 V12.5 H4 V11.5 A8 8 0 0 1 12 3.5 Z"
                fill="currentColor"
              />
              {/* Button split lines */}
              <line
                x1="4"
                y1="12.5"
                x2="20"
                y2="12.5"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <line
                x1="12"
                y1="3.5"
                x2="12"
                y2="12.5"
                stroke="currentColor"
                stroke-width="1.8"
              />
            </svg>
          </span>
        </div>
      </div>

      {/* Zoom Control Slider (matches virtual sticks + scroll-wheel mouse icon) */}
      <div
        ref={stickRefs.zoomCtrlRef}
        class="scene3d-zoom-ctrl"
        role="slider"
        aria-label="Zoom (Mausrad oder Ziehen, Doppelklick zum Zurücksetzen)"
        title="Zoom (Mausrad oder Ziehen · Doppelklick: 1×)"
      >
        <span class="scene3d-stick-label">Zoom</span>
        <span class="scene3d-zoom-sign is-plus" aria-hidden="true">+</span>
        <div class="scene3d-zoom-track" aria-hidden="true" />
        <span class="scene3d-zoom-sign is-minus" aria-hidden="true">−</span>
        <div
          ref={stickRefs.zoomKnobRef}
          class="scene3d-stick-knob scene3d-zoom-knob"
          aria-hidden="true"
        >
          {/* Scroll-wheel mouse icon matching the stick mouse SVGs */}
          <svg
            class="scene3d-knob-mouse"
            viewBox="0 0 24 28"
            width="20"
            height="22"
            aria-hidden="true"
          >
            {/* Up/down scroll chevrons above & below wheel */}
            <path
              d="M9.5 3 L12 0.8 L14.5 3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            {/* Mouse body */}
            <rect
              x="4"
              y="4.5"
              width="16"
              height="20.5"
              rx="8"
              fill="rgba(255, 255, 255, 0.22)"
              stroke="currentColor"
              stroke-width="2"
            />
            {/* Button split lines */}
            <line
              x1="4"
              y1="13.5"
              x2="20"
              y2="13.5"
              stroke="currentColor"
              stroke-width="1.6"
            />
            {/* Highlighted scroll wheel */}
            <rect
              x="10.2"
              y="6.8"
              width="3.6"
              height="6"
              rx="1.8"
              fill="currentColor"
            />
            {/* Down scroll arrow inside lower body */}
            <path
              d="M9.8 18.2 L12 20.6 L14.2 18.2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Scanner Quick-Draw Control Button (matching virtual stick style + middle-mouse indicator) */}
      <button
        type="button"
        class={`scene3d-scanner-btn ${heldMode === 'scanner' ? 'is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleScanner()
        }}
        aria-pressed={heldMode === 'scanner'}
        aria-label={
          heldMode === 'scanner'
            ? 'Barcode-Scanner ablegen (Mittelklick)'
            : 'Barcode-Scanner aufnehmen (Mittelklick)'
        }
        title={
          heldMode === 'scanner'
            ? 'Barcode-Scanner ablegen (Mittelklick)'
            : 'Barcode-Scanner aufnehmen (Mittelklick)'
        }
      >
        <span class="scene3d-stick-label">Scanner</span>
        <span class="scene3d-stick-knob scene3d-scanner-knob" aria-hidden="true">
          <span class="scene3d-knob-scanner-combo">
            {/* Handheld barcode scanner silhouette */}
            <svg
              class="scene3d-knob-scanner-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              {/* Scanner head */}
              <path d="M4 6.5 C4 5.1 5.1 4 6.5 4 H16.5 C17.9 4 19 5.1 19 6.5 V9.5 C19 10.6 18.1 11.5 17 11.5 H12.5 L10.2 19.5 C9.9 20.4 9.1 21 8.1 21 H7.4 C6.3 21 5.5 20 5.8 18.9 L7.4 11.5 H6.5 C5.1 11.5 4 10.4 4 9 V6.5 Z" fill="rgba(11, 18, 32, 0.16)" />
              {/* Scan beam rays */}
              <line x1="21" y1="6" x2="22.5" y2="5.2" />
              <line x1="21" y1="8.2" x2="23" y2="8.2" />
              <line x1="21" y1="10.4" x2="22.5" y2="11.2" />
            </svg>
            <span class="scene3d-knob-slash">/</span>
            {/* Middle-mouse-button icon matching the stick mouse SVGs */}
            <svg
              class="scene3d-knob-mouse"
              viewBox="0 0 24 28"
              width="14"
              height="16"
              aria-hidden="true"
            >
              {/* Click indicator arc above middle wheel */}
              <path
                d="M8.5 2.4 Q12 0.2 15.5 2.4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              {/* Mouse body */}
              <rect
                x="4"
                y="4"
                width="16"
                height="21"
                rx="8"
                fill="rgba(255, 255, 255, 0.22)"
                stroke="currentColor"
                stroke-width="2"
              />
              {/* Button split lines */}
              <line
                x1="4"
                y1="13"
                x2="20"
                y2="13"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <line
                x1="12"
                y1="4"
                x2="12"
                y2="13"
                stroke="currentColor"
                stroke-width="1.5"
              />
              {/* Highlighted middle scroll wheel */}
              <rect
                x="10.2"
                y="6"
                width="3.6"
                height="6.4"
                rx="1.8"
                fill="currentColor"
              />
            </svg>
          </span>
        </span>
      </button>

      <div
        ref={stickRefs.aimStickRef}
        class="scene3d-stick is-right"
        aria-label="Umsehen-Stick"
      >
        <span class="scene3d-stick-label">Umsehen</span>
        <div class="scene3d-stick-crosshair" aria-hidden="true" />
        <div class="scene3d-stick-deadzone" aria-hidden="true" />
        <div ref={stickRefs.aimKnobRef} class="scene3d-stick-knob">
          <svg
            class="scene3d-knob-mouse"
            viewBox="0 0 24 28"
            width="22"
            height="25"
            aria-hidden="true"
          >
            {/* Click indicator arc above right mouse button */}
            <path
              d="M20.8 7.5 A5.5 5.5 0 0 0 15.2 2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            {/* Mouse body */}
            <rect
              x="4"
              y="3.5"
              width="16"
              height="21.5"
              rx="8"
              fill="rgba(255, 255, 255, 0.22)"
              stroke="currentColor"
              stroke-width="2"
            />
            {/* Highlighted right mouse button */}
            <path
              d="M12 3.5 V12.5 H20 V11.5 A8 8 0 0 0 12 3.5 Z"
              fill="currentColor"
            />
            {/* Button split lines */}
            <line
              x1="4"
              y1="12.5"
              x2="20"
              y2="12.5"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <line
              x1="12"
              y1="3.5"
              x2="12"
              y2="12.5"
              stroke="currentColor"
              stroke-width="1.8"
            />
          </svg>
        </div>
      </div>
    </>
  )
}
