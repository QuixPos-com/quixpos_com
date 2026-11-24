import { Link } from '../components/Router'
import type {
  FocusViewId,
  NavPresetId,
  TargetedDevice,
  TouchStickRefs,
} from './types'

export interface SceneHudProps {
  isLocked: boolean
  isDrawerOpen: boolean
  isAudioMuted: boolean
  activeView: FocusViewId | null
  targetedTablet: TargetedDevice | null
  stickRefs: TouchStickRefs
  onSelectView: (view: NavPresetId) => void
  onToggleAudioMute: () => void
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
  stickRefs,
  onSelectView,
  onToggleAudioMute,
}: SceneHudProps) {
  return (
    <>
      <div
        class={`scene3d-crosshair ${isLocked ? 'is-visible' : ''} ${
          targetedTablet ? 'is-targeting' : ''
        }`}
        aria-hidden="true"
      />

      <div class="scene3d-hud-top">
        <div class="scene3d-hud-group">
          <Link class="scene3d-pill" href="/">
            ← Startseite
          </Link>
          <button
            type="button"
            class={`scene3d-pill scene3d-icon-pill ${
              isAudioMuted ? 'is-muted' : ''
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

      {isLocked && targetedTablet && (
        <div class="scene3d-hud-bottom">
          <div class="scene3d-target-badge">
            {targetedTablet.title} —{' '}
            {targetedTablet.kind === 'power'
              ? targetedTablet.controllablePower
                ? targetedTablet.poweredOn
                  ? 'Klicken oder E drücken zum Ausschalten'
                  : 'Klicken oder E drücken zum Einschalten'
                : 'Klicken oder E drücken zum Neu laden'
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
          <span class="scene3d-knob-wasd" aria-hidden="true">
            <span>W</span>
            <span>ASD</span>
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
            {/* Click indicator arc above left mouse button */}
            <path
              d="M3.2 7.5 A5.5 5.5 0 0 1 8.8 2"
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
        </div>
      </div>
    </>
  )
}
