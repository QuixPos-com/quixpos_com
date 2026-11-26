import { useRef } from 'preact/hooks'
import type { ReplayCameraFollowMode } from './recordingTypes'

export type RecorderStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'ready'
  | 'replaying'

export interface RecorderHudProps {
  status: RecorderStatus
  errorMessage: string | null
  surfaceWarning: string | null
  includeMic: boolean
  includeTabAudio: boolean
  cleanHudWhileRecording: boolean
  recordingStats: {
    durationMs: number
    frameCount: number
    eventCount: number
  }
  hasSession: boolean
  sessionInfo: {
    durationMs: number
    sizeBytes: number
    frameCount: number
    eventCount: number
    fileName: string
  } | null
  replayPlaying: boolean
  replayTimeMs: number
  replayDurationMs: number
  replaySpeed: number
  replayCameraFollow: ReplayCameraFollowMode
  onToggleMic: () => void
  onToggleTabAudio: () => void
  onToggleCleanHud: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onStartReplay: () => void
  onExitReplay: () => void
  onToggleReplayPlay: () => void
  onSeekReplay: (timeMs: number) => void
  onChangeReplaySpeed: (rate: number) => void
  onResetCameraFollow: () => void
  onToggleCameraFollow: () => void
  onDownloadBundle: () => void
  onImportBundleFile: (file: File) => void
  onDismissError: () => void
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const

export function RecorderHud({
  status,
  errorMessage,
  surfaceWarning,
  includeMic,
  includeTabAudio,
  cleanHudWhileRecording,
  recordingStats,
  hasSession,
  sessionInfo,
  replayPlaying,
  replayTimeMs,
  replayDurationMs,
  replaySpeed,
  replayCameraFollow,
  onToggleMic,
  onToggleTabAudio,
  onToggleCleanHud,
  onStartRecording,
  onStopRecording,
  onStartReplay,
  onExitReplay,
  onToggleReplayPlay,
  onSeekReplay,
  onChangeReplaySpeed,
  onResetCameraFollow,
  onToggleCameraFollow,
  onDownloadBundle,
  onImportBundleFile,
  onDismissError,
}: RecorderHudProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      onImportBundleFile(file)
      input.value = ''
    }
  }

  return (
    <div
      class={`rec3d-container ${
        status === 'recording' && cleanHudWhileRecording
          ? 'is-clean-recording'
          : ''
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".q3d,.zip,application/zip,application/octet-stream"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {errorMessage && (
        <div class="rec3d-alert is-error" role="alert">
          <span>{errorMessage}</span>
          <button
            type="button"
            class="rec3d-alert-close"
            onClick={onDismissError}
            aria-label="Hinweis schließen"
          >
            ✕
          </button>
        </div>
      )}

      {surfaceWarning && status === 'recording' && (
        <div class="rec3d-alert is-warn">
          <span>{surfaceWarning}</span>
        </div>
      )}

      {status === 'replaying' ? (
        <div class="rec3d-bar is-replay">
          <div class="rec3d-replay-top">
            <span class="rec3d-badge is-replay-badge">
              <span class="rec3d-dot is-teal" />
              3D REPLAY
            </span>

            <button
              type="button"
              class="rec3d-btn is-primary"
              onClick={onToggleReplayPlay}
              title={replayPlaying ? 'Pause' : 'Abspielen'}
            >
              {replayPlaying ? '⏸ Pause' : '▶ Abspielen'}
            </button>

            <div class="rec3d-timeline">
              <span class="rec3d-time">{formatTime(replayTimeMs)}</span>
              <input
                type="range"
                class="rec3d-scrubber"
                min={0}
                max={Math.max(1, replayDurationMs)}
                step={16}
                value={Math.min(replayTimeMs, Math.max(1, replayDurationMs))}
                onInput={(e) => {
                  const val = Number((e.currentTarget as HTMLInputElement).value)
                  onSeekReplay(val)
                }}
                aria-label="Wiedergabe-Position"
              />
              <span class="rec3d-time is-dim">
                {formatTime(replayDurationMs)}
              </span>
            </div>

            <div class="rec3d-speed-group" role="group" aria-label="Tempo">
              {SPEED_OPTIONS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  class={`rec3d-chip ${replaySpeed === spd ? 'is-active' : ''}`}
                  onClick={() => onChangeReplaySpeed(spd)}
                >
                  {spd}×
                </button>
              ))}
            </div>

            {replayCameraFollow === 'recorded' ? (
              <button
                type="button"
                class="rec3d-btn"
                onClick={onToggleCameraFollow}
                title="Kamera frei bewegen (WASD / Maus funktioniert jederzeit)"
              >
                🎥 Aufnahme-Kamera
              </button>
            ) : (
              <button
                type="button"
                class="rec3d-btn is-accent"
                onClick={onResetCameraFollow}
                title="Zurück zur aufgenommenen Kamerafahrt"
              >
                🕹️ Freie Kamera · Zurück zum Pfad
              </button>
            )}

            <button
              type="button"
              class="rec3d-btn"
              onClick={onDownloadBundle}
              title="Aufnahme für Offline-Client herunterladen (.q3d)"
            >
              ⬇ .q3d
            </button>

            <button
              type="button"
              class="rec3d-btn is-ghost"
              onClick={onExitReplay}
              title="Replay schließen und zur Live-3D-Szene zurückkehren"
            >
              ✕ Live-Szene
            </button>
          </div>
        </div>
      ) : status === 'recording' ? (
        <div class="rec3d-bar is-recording">
          <span class="rec3d-badge is-rec-badge">
            <span class="rec3d-dot is-red-pulse" />
            REC {formatTime(recordingStats.durationMs)}
          </span>
          {!cleanHudWhileRecording && (
            <span class="rec3d-stats">
              {recordingStats.frameCount} Frames · {recordingStats.eventCount}{' '}
              Events
            </span>
          )}
          <button
            type="button"
            class="rec3d-btn is-danger"
            onClick={onStopRecording}
          >
            ■ Aufnahme stoppen
          </button>
        </div>
      ) : (
        <div class="rec3d-bar">
          <button
            type="button"
            class="rec3d-btn is-record"
            disabled={status === 'starting' || status === 'stopping'}
            onClick={onStartRecording}
            title="Aktuellen Browser-Tab + alle 3D-Bewegungen & Drucker/Scanner-Events aufnehmen"
          >
            <span class="rec3d-dot is-red" />
            {status === 'starting'
              ? 'Tab auswählen…'
              : status === 'stopping'
                ? 'Speichere…'
                : 'Aufnahme'}
          </button>

          <button
            type="button"
            class={`rec3d-chip ${includeTabAudio ? 'is-active' : ''}`}
            onClick={onToggleTabAudio}
            title="Tab-Audio in Bildschirmfreigabe mit aufnehmen"
          >
            🔊 Tab-Ton
          </button>

          <button
            type="button"
            class={`rec3d-chip ${includeMic ? 'is-active' : ''}`}
            onClick={onToggleMic}
            title="Mikrofon für Sprachkommentar mit aufnehmen"
          >
            🎙️ Mikrofon
          </button>

          <button
            type="button"
            class={`rec3d-chip ${cleanHudWhileRecording ? 'is-active' : ''}`}
            onClick={onToggleCleanHud}
            title="Steuer-HUD während der Aufnahme ausblenden (sauberes Bild)"
          >
            👁️ Clean HUD
          </button>

          <span class="rec3d-divider" aria-hidden="true" />

          <button
            type="button"
            class="rec3d-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Gespeicherte .q3d Aufnahme öffnen und abspielen"
          >
            📂 .q3d laden
          </button>

          {hasSession && sessionInfo && (
            <>
              <button
                type="button"
                class="rec3d-btn is-primary"
                onClick={onStartReplay}
                title="Aufnahme direkt in der 3D-Engine abspielen"
              >
                ▶ Replay ({formatTime(sessionInfo.durationMs)})
              </button>
              <button
                type="button"
                class="rec3d-btn is-accent"
                onClick={onDownloadBundle}
                title={`${sessionInfo.fileName} herunterladen (${formatBytes(
                  sessionInfo.sizeBytes,
                )})`}
              >
                ⬇ Download ({formatBytes(sessionInfo.sizeBytes)})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
