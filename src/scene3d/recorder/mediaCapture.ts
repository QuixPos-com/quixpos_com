export interface StartMediaCaptureOptions {
  includeTabAudio: boolean
  includeMicAudio: boolean
  onExternalStop?: () => void
}

export interface MediaCaptureResult {
  videoBlob: Blob
  mimeType: string
  fileExtension: 'webm' | 'mp4'
  videoWidth: number
  videoHeight: number
  hasAudio: boolean
  hasTabAudio: boolean
  hasMicAudio: boolean
  durationMs: number
}

export interface ActiveMediaCapture {
  startedAtPerfNow: number
  mimeType: string
  videoWidth: number
  videoHeight: number
  hasAudio: boolean
  hasTabAudio: boolean
  hasMicAudio: boolean
  displaySurface?: string
  stop: () => Promise<MediaCaptureResult>
  cancel: () => void
}

function pickSupportedRecorderMime(hasAudio: boolean): {
  mimeType: string
  ext: 'webm' | 'mp4'
} {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', ext: 'webm' }
  }
  const candidates: Array<{ mimeType: string; ext: 'webm' | 'mp4' }> = hasAudio
    ? [
        { mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
        { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
        { mimeType: 'video/webm;codecs=h264,opus', ext: 'webm' },
        { mimeType: 'video/webm', ext: 'webm' },
        { mimeType: 'video/mp4', ext: 'mp4' },
      ]
    : [
        { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
        { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
        { mimeType: 'video/webm;codecs=h264', ext: 'webm' },
        { mimeType: 'video/webm', ext: 'webm' },
        { mimeType: 'video/mp4', ext: 'mp4' },
      ]

  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c
    }
  }
  return { mimeType: '', ext: 'webm' }
}

export async function startScreenAndAudioCapture({
  includeTabAudio,
  includeMicAudio,
  onExternalStop,
}: StartMediaCaptureOptions): Promise<ActiveMediaCapture> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== 'function'
  ) {
    throw new Error(
      'Bildschirmaufnahme wird in diesem Browser nicht unterstützt (HTTPS oder localhost erforderlich).',
    )
  }

  const displayConstraints: DisplayMediaStreamOptions & Record<string, unknown> =
    {
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'exclude',
      video: {
        frameRate: { ideal: 30, max: 60 },
      },
      audio: includeTabAudio
        ? {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        : false,
    }

  const displayStream =
    await navigator.mediaDevices.getDisplayMedia(displayConstraints)

  let micStream: MediaStream | null = null
  if (includeMicAudio) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
    } catch {
      // Continue without microphone if unavailable or declined
      micStream = null
    }
  }

  const videoTrack = displayStream.getVideoTracks()[0]
  if (!videoTrack) {
    for (const t of displayStream.getTracks()) t.stop()
    micStream?.getTracks().forEach((t) => t.stop())
    throw new Error('Keine Videospur von der Bildschirmfreigabe erhalten.')
  }

  const settings = videoTrack.getSettings() as MediaTrackSettings & {
    displaySurface?: string
  }
  const videoWidth = settings.width || window.innerWidth
  const videoHeight = settings.height || window.innerHeight
  const displaySurface = settings.displaySurface

  const tabAudioTrack = displayStream.getAudioTracks()[0] ?? null
  const micAudioTrack = micStream?.getAudioTracks()[0] ?? null
  const hasTabAudio = Boolean(tabAudioTrack)
  const hasMicAudio = Boolean(micAudioTrack)

  let mixCtx: AudioContext | null = null
  let keepAliveOsc: OscillatorNode | null = null
  const tracks: MediaStreamTrack[] = [videoTrack]

  if (hasTabAudio || hasMicAudio) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (AudioCtx) {
      mixCtx = new AudioCtx()
      if (mixCtx.state === 'suspended') {
        await mixCtx.resume().catch(() => {})
      }
      const dest = mixCtx.createMediaStreamDestination()

      // Continuous -120 dB keepalive prevents Chromium's WebmMuxer from buffering
      // video frames (~1s) while waiting for silent tab-audio packets to start.
      keepAliveOsc = mixCtx.createOscillator()
      const silentGain = mixCtx.createGain()
      silentGain.gain.value = 0.000001
      keepAliveOsc.connect(silentGain).connect(dest)
      keepAliveOsc.start()

      if (tabAudioTrack) {
        const tabSrc = mixCtx.createMediaStreamSource(
          new MediaStream([tabAudioTrack]),
        )
        const tabGain = mixCtx.createGain()
        tabGain.gain.value = hasMicAudio ? 0.85 : 1.0
        tabSrc.connect(tabGain).connect(dest)
      }

      if (micAudioTrack) {
        const micSrc = mixCtx.createMediaStreamSource(
          new MediaStream([micAudioTrack]),
        )
        const micGain = mixCtx.createGain()
        micGain.gain.value = 1.0
        micSrc.connect(micGain).connect(dest)
      }

      const mixedTrack = dest.stream.getAudioTracks()[0]
      if (mixedTrack) {
        tracks.push(mixedTrack)
      }
    } else if (tabAudioTrack) {
      tracks.push(tabAudioTrack)
    } else if (micAudioTrack) {
      tracks.push(micAudioTrack)
    }
  }

  // Wait for the first live video frame from `displayStream` before starting MediaRecorder
  // so t=0 of the recorded container aligns cleanly with active capture delivery.
  await new Promise<void>((resolve) => {
    const probe = document.createElement('video')
    probe.muted = true
    probe.playsInline = true
    probe.srcObject = new MediaStream([videoTrack])
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      probe.pause()
      probe.srcObject = null
      resolve()
    }
    const timer = window.setTimeout(done, 260)
    const rvfc = (
      probe as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number
      }
    ).requestVideoFrameCallback
    if (typeof rvfc === 'function') {
      rvfc.call(probe, () => {
        window.clearTimeout(timer)
        done()
      })
    } else {
      probe.onloadeddata = () => {
        window.clearTimeout(timer)
        done()
      }
    }
    probe.play().catch(() => {
      window.clearTimeout(timer)
      done()
    })
  })

  const combinedStream = new MediaStream(tracks)
  const chosen = pickSupportedRecorderMime(tracks.length > 1)
  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: 8_000_000,
  }
  if (chosen.mimeType) {
    recorderOptions.mimeType = chosen.mimeType
  }
  if (tracks.length > 1) {
    recorderOptions.audioBitsPerSecond = 128_000
  }

  const chunks: Blob[] = []
  const recorder = new MediaRecorder(combinedStream, recorderOptions)
  const resolvedMime =
    recorder.mimeType || chosen.mimeType || 'video/webm'

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data)
    }
  }

  let stopped = false
  let startedAtPerfNow = performance.now()
  let stopPromise: Promise<MediaCaptureResult> | null = null

  const cleanupStreams = () => {
    videoTrack.onended = null
    for (const t of displayStream.getTracks()) {
      try {
        t.stop()
      } catch {
        // Ignore
      }
    }
    if (micStream) {
      for (const t of micStream.getTracks()) {
        try {
          t.stop()
        } catch {
          // Ignore
        }
      }
    }
    if (keepAliveOsc) {
      try {
        keepAliveOsc.stop()
        keepAliveOsc.disconnect()
      } catch {
        // Ignore
      }
      keepAliveOsc = null
    }
    if (mixCtx && mixCtx.state !== 'closed') {
      mixCtx.close().catch(() => {})
    }
    mixCtx = null
  }

  videoTrack.onended = () => {
    if (!stopped) {
      onExternalStop?.()
    }
  }

  const startReady = new Promise<number>((resolve, reject) => {
    recorder.onstart = () => {
      startedAtPerfNow = performance.now()
      resolve(startedAtPerfNow)
    }
    recorder.onerror = () => {
      reject(new Error('MediaRecorder konnte nicht gestartet werden.'))
    }
  })

  recorder.start(200)
  await startReady

  const stop = (): Promise<MediaCaptureResult> => {
    if (stopPromise) return stopPromise
    stopped = true
    const endedAt = performance.now()
    const durationMs = Math.max(1, Math.round(endedAt - startedAtPerfNow))

    stopPromise = new Promise<MediaCaptureResult>((resolve) => {
      const finalize = () => {
        cleanupStreams()
        const videoBlob = new Blob(chunks, { type: resolvedMime })
        resolve({
          videoBlob,
          mimeType: resolvedMime,
          fileExtension: chosen.ext,
          videoWidth,
          videoHeight,
          hasAudio: tracks.length > 1,
          hasTabAudio,
          hasMicAudio,
          durationMs,
        })
      }

      if (recorder.state === 'inactive') {
        finalize()
        return
      }
      recorder.onstop = finalize
      try {
        recorder.stop()
      } catch {
        finalize()
      }
    })
    return stopPromise
  }

  const cancel = () => {
    stopped = true
    try {
      if (recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
    } catch {
      // Ignore
    }
    cleanupStreams()
    chunks.length = 0
  }

  return {
    startedAtPerfNow,
    mimeType: resolvedMime,
    videoWidth,
    videoHeight,
    hasAudio: tracks.length > 1,
    hasTabAudio,
    hasMicAudio,
    displaySurface,
    stop,
    cancel,
  }
}
