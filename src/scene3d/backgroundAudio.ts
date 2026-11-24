export interface BackgroundAudioController {
  dispose: () => void
}

const TARGET_GAIN = 0.14 // Soft background level (~ -17 dB)

export function mountBackgroundAudio(src = '/Irish_Coffee.mp3'): BackgroundAudioController {
  let disposed = false
  let started = false

  const audio = new Audio(src)
  audio.loop = true
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  let ctx: AudioContext | null = null
  let masterGain: GainNode | null = null

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
    masterGain.gain.value = 0.0001

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
      // Fallback if Web Audio API is unavailable
      audio.volume = 0.1
      audio.play().then(
        () => {
          started = true
          removeUnlockListeners()
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
          masterGain.gain.cancelScheduledValues(now)
          masterGain.gain.setValueAtTime(0.0001, now)
          masterGain.gain.linearRampToValueAtTime(TARGET_GAIN, now + 1.4)
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
    dispose: () => {
      disposed = true
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
