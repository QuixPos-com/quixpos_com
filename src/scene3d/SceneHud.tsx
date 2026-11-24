import type { RefObject } from 'preact'
import { useEffect } from 'preact/hooks'
import { Link } from '../components/Router'
import { ZEBRA_REELS } from './config'
import type {
  BarcodeScanEvent,
  FocusViewId,
  HeldItemMode,
  NavPresetId,
  TargetedDevice,
  TouchStickRefs,
  ZebraMediaInfo,
  ZebraReelId,
} from './types'

export interface SceneHudProps {
  isLocked: boolean
  isDrawerOpen: boolean
  isAudioMuted: boolean
  activeView: FocusViewId | null
  targetedTablet: TargetedDevice | null
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
  isLocked,
  isDrawerOpen,
  isAudioMuted,
  activeView,
  targetedTablet,
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
      <div
        class={`scene3d-crosshair ${isLocked && heldMode !== 'scanner' ? 'is-visible' : ''
          } ${targetedTablet ? 'is-targeting' : ''}`}
        aria-hidden="true"
      />

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

      {(heldMode !== 'none' || (isLocked && targetedTablet)) && (
        <div class="scene3d-hud-bottom">
          {isLocked && targetedTablet && heldMode !== 'label' && (
            <div class="scene3d-target-badge">
              {targetedTablet.title} —{' '}
              {targetedTablet.loginRequiredPrompt
                ? '<- Login first'
                : targetedTablet.kind === 'zebra-label'
                  ? 'Klicken oder E drücken zum Aufnehmen'
                  : targetedTablet.kind === 'scanner'
                    ? 'Klicken oder E drücken zum Aufnehmen'
                    : targetedTablet.kind === 'scanner-dock'
                      ? 'Klicken oder E drücken zum Ablegen'
                      : targetedTablet.kind === 'power'
                        ? targetedTablet.controllablePower
                          ? targetedTablet.poweredOn
                            ? 'Klicken oder E drücken zum Ausschalten'
                            : 'Klicken oder E drücken zum Einschalten'
                          : 'Klicken oder E drücken zum Neu laden'
                        : targetedTablet.kind === 'fullscreen'
                          ? 'Klicken oder E drücken für Vollbild'
                          : targetedTablet.kind === 'zebra-latch'
                          ? 'Klicken oder E drücken für Rollenwechsel'
                          : targetedTablet.kind === 'drawer'
                            ? isDrawerOpen
                              ? 'Klicken oder E drücken zum Schließen'
                              : 'Klicken oder E drücken zum Öffnen'
                            : targetedTablet.kind === 'label'
                              ? 'Klicken oder E drücken zum Fokussieren'
                              : targetedTablet.poweredOn === false
                                ? 'Ausgeschaltet'
                                : 'Klicken oder E drücken zum Bedienen'}
            </div>
          )}

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
