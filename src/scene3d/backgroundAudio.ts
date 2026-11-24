export interface BackgroundAudioController {
  setMuted: (muted: boolean) => void
  setDucked: (ducked: boolean) => void
  dispose: () => void
}

const NORMAL_GAIN = 0.14 // Soft room background level (~ -17 dB)
const DUCKED_GAIN = 0.02 // Much quieter when zoomed onto a screen (~ -34 dB)
const SILENT_GAIN = 0.00001

// Exponential RC smoothing time constants (seconds)
const DUCK_SMOOTH_TAU = 0.42 // ~1.3s soft swell/duck transition
const MUTE_SMOOTH_TAU = 0.16 // ~0.5s soft mute/unmute transition

export function mountBackgroundAudio(
  src = '/Irish_Coffee.mp3',
): BackgroundAudioController {
  let disposed = false
  let started = false
  let isMuted = false
  let isDucked = false
  let fallbackRafId = 0

  const audio = new Audio(src)
  audio.loop = true
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  let ctx: AudioContext | null = null
  let masterGain: GainNode | null = null

  const getTargetGain = () => {
    if (isMuted) return 0
    return isDucked ? DUCKED_GAIN : NORMAL_GAIN
  }

  const rampGainSmoothly = (tau: number) => {
    if (disposed || !started) return
    const target = getTargetGain()

    if (ctx && masterGain) {
      const now = ctx.currentTime
      const current = Math.max(SILENT_GAIN, masterGain.gain.value)
      masterGain.gain.cancelScheduledValues(now)
      masterGain.gain.setValueAtTime(current, now)
      masterGain.gain.setTargetAtTime(Math.max(SILENT_GAIN, target), now, tau)
      return
    }

    // Fallback smooth volume interpolation when Web Audio API is unavailable
    if (fallbackRafId) cancelAnimationFrame(fallbackRafId)
    let lastTs = performance.now()
    const step = (ts: number) => {
      if (disposed) return
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000))
      lastTs = ts
      const desired = getTargetGain()
      const alpha = 1 - Math.exp(-dt / Math.max(0.05, tau))
      const next = audio.volume + (desired - audio.volume) * alpha
      if (Math.abs(desired - next) < 0.001) {
        audio.volume = Math.max(0, Math.min(1, desired))
        fallbackRafId = 0
      } else {
        audio.volume = Math.max(0, Math.min(1, next))
        fallbackRafId = requestAnimationFrame(step)
      }
    }
    fallbackRafId = requestAnimationFrame(step)
  }

  const ensureGraph = () => {
    if (ctx || !AudioCtx) return
    ctx = new AudioCtx()

    const source = ctx.createMediaElementSource(audio)

    // Classic Loudness contour tuned for low background listening (mostly mids cut)
    const lowShelf = ctx.createBiquadFilter()
    lowShelf.type = 'lowshelf'
    lowShelf.frequency.value = 110
    lowShelf.gain.value = 3.5

    const midCut = ctx.createBiquadFilter()
    midCut.type = 'peaking'
    midCut.frequency.value = 1150
    midCut.Q.value = 0.65
    midCut.gain.value = -11

    const highShelf = ctx.createBiquadFilter()
    highShelf.type = 'highshelf'
    highShelf.frequency.value = 8500
    highShelf.gain.value = 2.0

    masterGain = ctx.createGain()
    masterGain.gain.value = SILENT_GAIN

    source
      .connect(lowShelf)
      .connect(midCut)
      .connect(highShelf)
      .connect(masterGain)
      .connect(ctx.destination)
  }

  const removeUnlockListeners = () => {
    window.removeEventListener('pointerdown', tryStart)
    window.removeEventListener('touchstart', tryStart)
    window.removeEventListener('keydown', tryStart)
  }

  function tryStart() {
    if (disposed || started) return

    ensureGraph()
    if (!ctx) {
      audio.volume = 0
      audio.play().then(
        () => {
          started = true
          removeUnlockListeners()
          rampGainSmoothly(DUCK_SMOOTH_TAU)
        },
        () => {
          // Wait for user gesture
        },
      )
      return
    }

    const resumePromise =
      ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()

    resumePromise
      .then(() => {
        if (disposed) return
        return audio.play()
      })
      .then(() => {
        if (disposed || !ctx || !masterGain) return
        if (!audio.paused) {
          started = true
          removeUnlockListeners()
          const now = ctx.currentTime
          const initialTarget = Math.max(SILENT_GAIN, getTargetGain())
          masterGain.gain.cancelScheduledValues(now)
          masterGain.gain.setValueAtTime(SILENT_GAIN, now)
          masterGain.gain.setTargetAtTime(initialTarget, now, 0.45)
        }
      })
      .catch(() => {
        // Autoplay blocked until first user interaction; unlock listeners remain active
      })
  }

  window.addEventListener('pointerdown', tryStart, { passive: true })
  window.addEventListener('touchstart', tryStart, { passive: true })
  window.addEventListener('keydown', tryStart, { passive: true })

  // Attempt immediate start (succeeds automatically when navigating from Startseite)
  tryStart()

  return {
    setMuted: (muted: boolean) => {
      if (isMuted === muted) return
      isMuted = muted
      if (!muted && !started) {
        tryStart()
      } else {
        rampGainSmoothly(MUTE_SMOOTH_TAU)
      }
    },
    setDucked: (ducked: boolean) => {
      if (isDucked === ducked) return
      isDucked = ducked
      rampGainSmoothly(DUCK_SMOOTH_TAU)
    },
    dispose: () => {
      disposed = true
      if (fallbackRafId) cancelAnimationFrame(fallbackRafId)
      removeUnlockListeners()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {})
      }
      ctx = null
      masterGain = null
    },
  }
}
