/**
 * Drop-in client helper for pages embedded inside the QuixPOS 3D Scene
 * (e.g. dashdemo.quixpos.com, pos.quixpos.com, posdemo.quixpos.com).
 *
 * Zero dependencies — can be copied directly into any embedded web app.
 */

export const SCENE_CHANNEL_ID = 'quixpos-scene3d'
export const SCENE_WINDOW_NAME_PREFIX = 'quixpos-scene3d:'

const DEFAULT_ALLOWED_HOST_ORIGINS = [
  'https://quixpos.com',
  'https://www.quixpos.com',
  'https://webtest.quixpos.com',
]

export type SceneMessageData = Record<string, unknown>

export type ControllableScreenId =
  | 'pos-center'
  | 'pos-vertical'
  | 'sumup-far-right'

export interface ScreenPowerSummary {
  id: string
  title: string
  subtitle: string
  poweredOn: boolean
  enabled: boolean
}

export interface ScenePresenceInfo {
  version: number
  tabletId: string
  title: string
  canControlScreens: boolean
  printers: Array<'zebra' | 'epson'>
  activeView: 'total' | 'left' | 'center' | 'right' | 'drawer' | null
  drawerOpen: boolean
  pointerLocked: boolean
  screens: Record<string, ScreenPowerSummary>
  peers: string[]
}

export interface PrinterPrintedPayload {
  [key: string]: unknown
  printer: 'zebra' | 'epson'
  protocol: 'zpl' | 'escpos'
  jobId?: string
  droppedPrevious: boolean
  requestedBy: string
}

export interface ScreensChangedPayload {
  [key: string]: unknown
  tabletId?: string
  poweredOn?: boolean
  screens: Record<string, ScreenPowerSummary>
}

export interface SceneClientMessageMeta {
  name: string
  /** 'host' when sent by the 3D scene, or the peer tabletId (e.g. 'pos-center') */
  sender: string
  origin: string
}

export type SceneClientCallback<
  T extends SceneMessageData = SceneMessageData,
> = (data: T, meta: SceneClientMessageMeta) => void

export interface SceneClientOptions {
  /** Additional parent origins to trust beyond quixpos.com & localhost */
  allowedOrigins?: string[]
  /** Automatically send 'scene:ping' on creation when embedded in an iframe (default: true) */
  autoPing?: boolean
}

function isPlainObject(value: unknown): value is SceneMessageData {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLocalDevOrigin(origin: string): boolean {
  return (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin === 'http://localhost' ||
    origin === 'http://127.0.0.1'
  )
}

/**
 * Synchronous check: returns true immediately at startup when the page is running
 * inside a QuixPOS 3D scene tablet iframe.
 */
export function detectScenePresenceSync(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.parent !== window &&
      typeof window.name === 'string' &&
      window.name.startsWith(SCENE_WINDOW_NAME_PREFIX)
    )
  } catch {
    return false
  }
}

/**
 * Returns the tablet slot ID ('dash-left' | 'pos-center' | 'pos-vertical' | 'sumup-far-right')
 * synchronously from `window.name` if running inside the 3D scene, or null otherwise.
 */
export function getSceneTabletIdSync(): string | null {
  if (!detectScenePresenceSync()) return null
  return window.name.slice(SCENE_WINDOW_NAME_PREFIX.length) || null
}

export function createSceneChannelClient(options: SceneClientOptions = {}) {
  const allowedOrigins = new Set([
    ...DEFAULT_ALLOWED_HOST_ORIGINS,
    ...(options.allowedOrigins ?? []),
  ])

  const listeners = new Map<string, Set<SceneClientCallback<any>>>()
  const presenceListeners = new Set<(info: ScenePresenceInfo) => void>()

  let disposed = false
  let hostOrigin: string | null = null
  let presenceInfo: ScenePresenceInfo | null = null

  // Pre-seed hostOrigin from document.referrer if it matches a trusted host origin
  if (typeof document !== 'undefined' && document.referrer) {
    try {
      const refOrigin = new URL(document.referrer).origin
      if (allowedOrigins.has(refOrigin) || isLocalDevOrigin(refOrigin)) {
        hostOrigin = refOrigin
      }
    } catch {
      // Ignore malformed referrer
    }
  }

  const isOriginAllowed = (origin: string): boolean =>
    allowedOrigins.has(origin) || isLocalDevOrigin(origin)

  const onWindowMessage = (event: MessageEvent) => {
    if (disposed || typeof window === 'undefined') return
    if (window.parent === window || event.source !== window.parent) return
    if (!isOriginAllowed(event.origin)) return

    const raw = event.data
    if (!isPlainObject(raw)) return
    if (raw.channel !== SCENE_CHANNEL_ID || typeof raw.name !== 'string') return

    hostOrigin = event.origin
    const name = raw.name
    const data: SceneMessageData = isPlainObject(raw.data) ? raw.data : {}
    const sender = typeof raw.sender === 'string' ? raw.sender : 'host'

    if (name === 'scene:presence') {
      presenceInfo = data as unknown as ScenePresenceInfo
      for (const cb of Array.from(presenceListeners)) {
        cb(presenceInfo)
      }
    } else if (
      (name === 'screens:changed' || name === 'screens:state') &&
      presenceInfo &&
      isPlainObject(data.screens)
    ) {
      presenceInfo = {
        ...presenceInfo,
        screens: data.screens as Record<string, ScreenPowerSummary>,
      }
    }

    const meta: SceneClientMessageMeta = {
      name,
      sender,
      origin: event.origin,
    }

    const specific = listeners.get(name)
    if (specific) {
      for (const cb of Array.from(specific)) {
        cb(data, meta)
      }
    }
    if (name !== '*') {
      const wildcard = listeners.get('*')
      if (wildcard) {
        for (const cb of Array.from(wildcard)) {
          cb(data, meta)
        }
      }
    }
  }

  if (typeof window !== 'undefined' && window.parent !== window) {
    window.addEventListener('message', onWindowMessage)
  }

  /**
   * Send a message (name + object) on the broadcast channel to the 3D host
   * and all powered-on peer iframes in the scene.
   */
  const send = (name: string, data: SceneMessageData = {}) => {
    if (disposed || typeof window === 'undefined' || window.parent === window) {
      return
    }
    window.parent.postMessage(
      {
        channel: SCENE_CHANNEL_ID,
        name,
        data,
      },
      hostOrigin ?? '*',
    )
  }

  /**
   * Register a callback for a given message name (or '*' for all messages).
   * Returns an unsubscribe function.
   */
  const on = <T extends SceneMessageData = SceneMessageData>(
    name: string,
    callback: SceneClientCallback<T>,
  ): (() => void) => {
    let set = listeners.get(name)
    if (!set) {
      set = new Set()
      listeners.set(name, set)
    }
    set.add(callback as SceneClientCallback<any>)
    return () => off(name, callback)
  }

  const off = <T extends SceneMessageData = SceneMessageData>(
    name: string,
    callback: SceneClientCallback<T>,
  ) => {
    const set = listeners.get(name)
    if (!set) return
    set.delete(callback as SceneClientCallback<any>)
    if (set.size === 0) {
      listeners.delete(name)
    }
  }

  /**
   * Register a callback invoked as soon as the 3D scene confirms presence
   * (fires immediately if the handshake already completed, and again on state refreshes).
   */
  const onPresence = (
    callback: (info: ScenePresenceInfo) => void,
  ): (() => void) => {
    presenceListeners.add(callback)
    if (presenceInfo) {
      callback(presenceInfo)
    }
    return () => {
      presenceListeners.delete(callback)
    }
  }

  /**
   * Actively probe the 3D scene host; triggers a 'scene:presence' reply.
   */
  const ping = () => {
    send('scene:ping', {})
  }

  /**
   * Resolves with `ScenePresenceInfo` once the 3D host responds, or `null` if not
   * embedded in the 3D scene / timed out.
   */
  const waitForPresence = (
    timeoutMs = 1500,
  ): Promise<ScenePresenceInfo | null> => {
    if (presenceInfo) return Promise.resolve(presenceInfo)
    if (typeof window === 'undefined' || window.parent === window) {
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      let settled = false
      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        unsub()
        resolve(null)
      }, timeoutMs)

      const unsub = onPresence((info) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        unsub()
        resolve(info)
      })

      ping()
    })
  }

  // ── Leftmost Screen ('dash-left') Screen Power Control Helpers ───────────

  /** Switch one controllable screen ON or OFF (only honored when called from 'dash-left') */
  const setScreenPower = (
    tabletId: ControllableScreenId | string,
    poweredOn: boolean,
  ) => {
    send('screen:power', { tabletId, poweredOn })
  }

  /** Switch all 3 controllable screens ('pos-center', 'pos-vertical', 'sumup-far-right') ON or OFF */
  const setAllScreensPower = (poweredOn: boolean) => {
    send(poweredOn ? 'screen:on' : 'screen:off', { all: true })
  }

  /** Enable or disable the 3D bezel power buttons on controllable screens (without necessarily booting them immediately) */
  const setScreensEnabled = (
    enabled: boolean,
    target: { tabletId?: ControllableScreenId | string; all?: boolean } = {
      all: true,
    },
  ) => {
    send(enabled ? 'screen:enable' : 'screen:disable', target)
  }

  /** Toggle a controllable screen ON <-> OFF (only honored when called from 'dash-left') */
  const toggleScreenPower = (tabletId: ControllableScreenId | string) => {
    send('screen:toggle', { tabletId })
  }

  /** Request a fresh 'screens:state' snapshot from the 3D host */
  const requestScreensState = () => {
    send('screens:get', {})
  }

  /** Subscribe to power state updates for the 3 controllable screens */
  const onScreensChanged = (
    callback: (screens: Record<string, ScreenPowerSummary>) => void,
  ): (() => void) => {
    if (presenceInfo?.screens) {
      callback(presenceInfo.screens)
    }
    const offPresence = onPresence((info) => callback(info.screens))
    const offChanged = on<ScreensChangedPayload>('screens:changed', (data) => {
      callback(data.screens)
    })
    const offState = on<ScreensChangedPayload>('screens:state', (data) => {
      callback(data.screens)
    })
    return () => {
      offPresence()
      offChanged()
      offState()
    }
  }

  // ── Thermal Printer Helpers (Zebra ZPL & Epson ESC/POS) ──────────────────

  /**
   * Print a ZPL II label on the 3D Zebra ZD420 shipping/barcode label printer.
   * Feeds the rendered label out of the slot; drops the previous label to the floor.
   */
  const printZpl = (zpl: string, jobId?: string) => {
    send('printer:zpl', jobId ? { zpl, jobId } : { zpl })
  }

  /**
   * Print an ESC/POS receipt on the 3D Epson TM-m30III thermal receipt printer.
   * Accepts a raw ESC/POS string, Base64 string (with `encoding: 'base64'`), `Uint8Array`, or `number[]`.
   */
  const printEscPos = (
    payload: string | Uint8Array | number[],
    opts: { encoding?: 'utf8' | 'base64' | 'latin1'; jobId?: string } = {},
  ) => {
    if (payload instanceof Uint8Array) {
      let binary = ''
      for (let i = 0; i < payload.length; i++) {
        binary += String.fromCharCode(payload[i])
      }
      send('printer:escpos', {
        base64: btoa(binary),
        jobId: opts.jobId,
      })
      return
    }
    if (Array.isArray(payload)) {
      send('printer:escpos', {
        bytes: payload,
        jobId: opts.jobId,
      })
      return
    }
    send('printer:escpos', {
      escpos: payload,
      encoding: opts.encoding,
      jobId: opts.jobId,
    })
  }

  /** Subscribe to `'printer:printed'` confirmations when any printer job starts feeding */
  const onPrinted = (
    callback: (info: PrinterPrintedPayload) => void,
  ): (() => void) => {
    return on<PrinterPrintedPayload>('printer:printed', (data) => {
      callback(data)
    })
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', onWindowMessage)
    }
    listeners.clear()
    presenceListeners.clear()
  }

  if (
    options.autoPing !== false &&
    typeof window !== 'undefined' &&
    window.parent !== window
  ) {
    ping()
  }

  return {
    /** True as soon as presence is detected (via iframe window.name or handshake) */
    isPresent: () => presenceInfo !== null || detectScenePresenceSync(),
    /** Current tablet ID ('dash-left', 'pos-center', 'pos-vertical', 'sumup-far-right') */
    getTabletId: () => presenceInfo?.tabletId ?? getSceneTabletIdSync(),
    /** Latest presence snapshot received from the 3D host, if handshake completed */
    getPresenceInfo: () => presenceInfo,
    send,
    on,
    off,
    onPresence,
    waitForPresence,
    ping,
    setScreenPower,
    setAllScreensPower,
    setScreensEnabled,
    toggleScreenPower,
    requestScreensState,
    onScreensChanged,
    printZpl,
    printEscPos,
    onPrinted,
    dispose,
  }
}
