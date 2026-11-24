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

export type ZebraReelId = '25x13' | '57x32' | '101x51' | '101x152'

export interface ZebraMediaInfo {
  [key: string]: unknown
  id: ZebraReelId
  label: string
  dpi: number
  widthMm: number
  heightMm: number
  widthPx: number
  heightPx: number
}

export interface ScenePresenceInfo {
  version: number
  tabletId: string
  title: string
  canControlScreens: boolean
  printers: Array<'zebra' | 'epson'>
  zebraMedia?: ZebraMediaInfo
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
  dpi: number
  widthPx: number
  heightPx: number
}

export interface BarcodeScanPayload {
  [key: string]: unknown
  /** Decoded 1D barcode or 2D QR code string */
  code: string
  /** Alias for `code` */
  text: string
  /** Detected symbology, e.g. 'Code128', 'EAN13', 'QRCode' */
  format: string
  /** Target tablet ID ('pos-center') */
  tabletId: 'pos-center'
  /** Unix timestamp in ms (`Date.now()`) */
  timestamp: number
}

export type BarcodeScanCallback = (
  code: string,
  payload: BarcodeScanPayload,
) => void

export interface DrawerCashChangedPayload {
  [key: string]: unknown
  currency: 'EUR'
  /** Total cash in EUR (e.g. 137.85) */
  amount: number
  /** Total cash in integer cents (e.g. 13785) */
  cents: number
  notes: Record<'100' | '50' | '20' | '10' | '5', number>
  coins: Record<'200' | '100' | '50' | '20' | '10' | '5' | '2' | '1', number>
}

export interface ScreensChangedPayload {
  [key: string]: unknown
  tabletId?: string
  poweredOn?: boolean
  screens: Record<string, ScreenPowerSummary>
}

export interface PosPairingEntry {
  [key: string]: unknown
  id?: number | string
  name?: string
  pin: string
  tabletId: string
  host: string
  origin: string
  created?: boolean
}

export interface PosPairingPayload {
  [key: string]: unknown
  host: string
  origin: string
  terminals: Record<string, PosPairingEntry>
  byTabletId: Record<string, PosPairingEntry>
}

export type PosPairingCallback = (
  pairing: PosPairingEntry,
  payload: PosPairingPayload,
) => void

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
  /**
   * Forward right-click drag (Umsehen / look around) and middle-click (Scanner toggle)
   * to the 3D scene host while keeping left-click and scroll wheel native to this iframe
   * (default: true).
   */
  forwardSceneControls?: boolean
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
  const pairingListeners = new Set<PosPairingCallback>()
  const pairingListenerLastKey = new WeakMap<PosPairingCallback, string>()
  const zebraMediaListeners = new Set<(media: ZebraMediaInfo) => void>()

  let disposed = false
  let hostOrigin: string | null = null
  let presenceInfo: ScenePresenceInfo | null = null
  let latestZebraMedia: ZebraMediaInfo | null = null
  let latestPairingPayload: PosPairingPayload | null = null
  let latestPairingEntry: PosPairingEntry | null = null

  const getCurrentTabletId = (): string | null =>
    presenceInfo?.tabletId ?? getSceneTabletIdSync()

  const getPairingDedupKey = (entry: PosPairingEntry): string =>
    `${entry.tabletId}:${entry.id ?? ''}:${entry.pin}:${entry.host}`

  const extractMyPairingEntry = (
    raw: SceneMessageData,
  ): { entry: PosPairingEntry; payload: PosPairingPayload } | null => {
    const myTabletId = getCurrentTabletId()
    if (!myTabletId) return null

    const topHost = typeof raw.host === 'string' ? raw.host.trim() : ''
    const topOrigin = typeof raw.origin === 'string' ? raw.origin.trim() : ''

    const byTabletId = isPlainObject(raw.byTabletId)
      ? (raw.byTabletId as Record<string, unknown>)
      : {}
    const terminals = isPlainObject(raw.terminals)
      ? (raw.terminals as Record<string, unknown>)
      : {}

    let candidate: unknown = byTabletId[myTabletId]
    if (!isPlainObject(candidate)) {
      candidate = Object.values(terminals).find(
        (v) => isPlainObject(v) && v.tabletId === myTabletId,
      )
    }
    if (!isPlainObject(candidate)) return null

    const pin = typeof candidate.pin === 'string' ? candidate.pin.trim() : ''
    if (!pin) return null

    const entry: PosPairingEntry = {
      ...candidate,
      id:
        typeof candidate.id === 'number' || typeof candidate.id === 'string'
          ? candidate.id
          : undefined,
      name:
        typeof candidate.name === 'string' ? candidate.name : undefined,
      pin,
      tabletId: myTabletId,
      host:
        typeof candidate.host === 'string' && candidate.host.trim()
          ? candidate.host.trim()
          : topHost,
      origin:
        typeof candidate.origin === 'string' && candidate.origin.trim()
          ? candidate.origin.trim()
          : topOrigin,
      created:
        typeof candidate.created === 'boolean' ? candidate.created : undefined,
    }

    const payload: PosPairingPayload = {
      ...raw,
      host: topHost || entry.host,
      origin: topOrigin || entry.origin,
      terminals: terminals as Record<string, PosPairingEntry>,
      byTabletId: byTabletId as Record<string, PosPairingEntry>,
    }

    return { entry, payload }
  }

  const notifyPairingListener = (
    cb: PosPairingCallback,
    entry: PosPairingEntry,
    payload: PosPairingPayload,
  ) => {
    const key = getPairingDedupKey(entry)
    if (pairingListenerLastKey.get(cb) === key) return
    pairingListenerLastKey.set(cb, key)
    cb(entry, payload)
  }

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
      if (isPlainObject(presenceInfo.zebraMedia)) {
        latestZebraMedia = presenceInfo.zebraMedia as ZebraMediaInfo
        for (const cb of Array.from(zebraMediaListeners)) {
          cb(latestZebraMedia)
        }
      }
      for (const cb of Array.from(presenceListeners)) {
        cb(presenceInfo)
      }
    } else if (name === 'printer:mediaChanged' || name === 'printer:media') {
      if (typeof data.dpi === 'number' && typeof data.heightPx === 'number') {
        latestZebraMedia = data as unknown as ZebraMediaInfo
        if (presenceInfo) {
          presenceInfo = { ...presenceInfo, zebraMedia: latestZebraMedia }
        }
        for (const cb of Array.from(zebraMediaListeners)) {
          cb(latestZebraMedia)
        }
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
    } else if (name === 'pos:pairing') {
      const extracted = extractMyPairingEntry(data)
      if (extracted) {
        latestPairingEntry = extracted.entry
        latestPairingPayload = extracted.payload
        for (const cb of Array.from(pairingListeners)) {
          notifyPairingListener(cb, extracted.entry, extracted.payload)
        }
      }
    } else if (name === 'pos:pairing:clear') {
      const targetId =
        typeof data.tabletId === 'string' ? data.tabletId.trim() : ''
      const myTabletId = getCurrentTabletId()
      if (!targetId || targetId === myTabletId) {
        latestPairingEntry = null
        latestPairingPayload = null
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

  // Forward right-click drag (Umsehen) & middle-click (Scanner) to the 3D host while
  // leaving left-click and mouse wheel 100% native to the embedded screen.
  let rightLooking = false
  let lastLookScreenX = 0
  let lastLookScreenY = 0
  const shouldForwardControls =
    options.forwardSceneControls !== false &&
    typeof window !== 'undefined' &&
    window.parent !== window &&
    detectScenePresenceSync()

  const onIframeMouseDown = (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      send('input:middleClick', {})
    } else if (e.button === 2) {
      e.preventDefault()
      rightLooking = true
      lastLookScreenX = e.screenX
      lastLookScreenY = e.screenY
      send('input:lookStart', {})
    }
  }

  const onIframeMouseMove = (e: MouseEvent) => {
    if (!rightLooking) return
    if ((e.buttons & 2) === 0) {
      rightLooking = false
      send('input:lookEnd', {})
      return
    }
    const dx = e.screenX - lastLookScreenX
    const dy = e.screenY - lastLookScreenY
    lastLookScreenX = e.screenX
    lastLookScreenY = e.screenY
    if (dx !== 0 || dy !== 0) {
      send('input:lookMove', { dx, dy })
    }
  }

  const onIframeMouseUp = (e: MouseEvent) => {
    if (e.button === 2 && rightLooking) {
      rightLooking = false
      send('input:lookEnd', {})
    }
  }

  const onIframeAuxClick = (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
    }
  }

  const onIframeContextMenu = (e: MouseEvent) => {
    e.preventDefault()
  }

  const onIframeBlur = () => {
    if (rightLooking) {
      rightLooking = false
      send('input:lookEnd', {})
    }
  }

  if (shouldForwardControls) {
    window.addEventListener('mousedown', onIframeMouseDown, true)
    window.addEventListener('mousemove', onIframeMouseMove, true)
    window.addEventListener('mouseup', onIframeMouseUp, true)
    window.addEventListener('auxclick', onIframeAuxClick, true)
    window.addEventListener('contextmenu', onIframeContextMenu, true)
    window.addEventListener('blur', onIframeBlur)
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

  /** Synchronous getter for the loaded Zebra ZD420 label reel (`dpi`, `heightPx`, `widthPx`, mm) */
  const getZebraMedia = (): ZebraMediaInfo | null => latestZebraMedia

  /** Request the current Zebra ZD420 reel size & DPI from the 3D host */
  const requestZebraMedia = () => {
    send('printer:media:get', {})
  }

  /**
   * Subscribe to Zebra ZD420 reel/media info (`dpi`, `heightPx`, `widthPx`, `widthMm`, `heightMm`).
   * Fires immediately if already known, otherwise queries the 3D host, and fires on every reel change.
   */
  const onZebraMediaChanged = (
    callback: (media: ZebraMediaInfo) => void,
  ): (() => void) => {
    zebraMediaListeners.add(callback)
    if (latestZebraMedia) {
      callback(latestZebraMedia)
    } else {
      requestZebraMedia()
    }
    return () => {
      zebraMediaListeners.delete(callback)
    }
  }

  // ── POS / Customer Terminal Pairing PIN Helpers ──────────────────────────

  /** Pull any waiting pairing PIN for this tablet from the 3D host */
  const requestPairingPin = () => {
    send('pos:pairing:get', {})
  }

  /** Synchronous getter for the latest cached pairing PIN for this tablet, if any */
  const getPairingPin = (): PosPairingEntry | null => latestPairingEntry

  /**
   * Register a callback for pairing PIN delivery scoped to this iframe's tabletId.
   * - If a waiting PIN is already cached locally, invokes `callback` immediately.
   * - Otherwise pulls `'pos:pairing:get'` from the 3D host so any waiting PIN stored
   *   before this iframe booted is delivered immediately.
   * - Deduplicates identical `(tabletId, id, pin, host)` deliveries per callback.
   */
  const onPairingPin = (callback: PosPairingCallback): (() => void) => {
    pairingListeners.add(callback)
    if (latestPairingEntry && latestPairingPayload) {
      notifyPairingListener(callback, latestPairingEntry, latestPairingPayload)
    } else {
      requestPairingPin()
    }
    return () => {
      pairingListeners.delete(callback)
    }
  }

  /**
   * Promise helper that resolves with this tablet's pairing PIN entry as soon as
   * it is available (immediately if waiting), or `null` if timed out / not embedded.
   */
  const waitForPairingPin = (
    timeoutMs = 5000,
  ): Promise<PosPairingEntry | null> => {
    if (latestPairingEntry) return Promise.resolve(latestPairingEntry)
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

      const unsub = onPairingPin((entry) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        unsub()
        resolve(entry)
      })
    })
  }

  /**
   * Acknowledge that this iframe has bound/consumed the pairing PIN so the 3D host
   * clears it and won't replay a used PIN on future reloads.
   */
  const ackPairingPin = (pin?: string) => {
    const consumedPin = pin ?? latestPairingEntry?.pin
    const consumedId = latestPairingEntry?.id
    if (!consumedPin || latestPairingEntry?.pin === consumedPin) {
      latestPairingEntry = null
      latestPairingPayload = null
    }
    send('pos:pairing:consumed', {
      ...(consumedPin ? { pin: consumedPin } : {}),
      ...(consumedId !== undefined ? { id: consumedId } : {}),
    })
  }

  /**
   * Register a callback for hardware barcode / QR scans collected by the 3D handheld
   * barcode scanner (delivered to the 12" center POS tablet `'pos-center'`).
   * Invokes `callback(code, payload)` with the scanned string as the first argument.
   * Returns an unsubscribe function.
   */
  const onBarcodeScan = (callback: BarcodeScanCallback): (() => void) => {
    return on<BarcodeScanPayload>('scanner:scan', (data) => {
      const code =
        typeof data.code === 'string'
          ? data.code
          : typeof data.text === 'string'
            ? data.text
            : ''
      if (!code) return
      callback(code, data)
    })
  }

  /**
   * Set the total cash amount in the 3D cash drawer in EUR (e.g. `137.85`).
   * The 3D drawer automatically calculates and renders the matching Euro notes
   * (€5–€100) and Euro coins (1c–€2).
   */
  const setDrawerCash = (amountEur: number) => {
    send('drawer:setCash', { amount: amountEur })
  }

  /**
   * Set the total cash amount in the 3D cash drawer in integer euro cents (e.g. `13785` = €137.85).
   */
  const setDrawerCashCents = (cents: number) => {
    send('drawer:setCash', { cents: Math.round(cents) })
  }

  /**
   * Subscribe to `'drawer:cashChanged'` updates reporting the drawer's Euro breakdown.
   */
  const onDrawerCashChanged = (
    callback: (info: DrawerCashChangedPayload) => void,
  ): (() => void) => {
    return on<DrawerCashChangedPayload>('drawer:cashChanged', (data) => {
      callback(data)
    })
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', onWindowMessage)
      if (shouldForwardControls) {
        window.removeEventListener('mousedown', onIframeMouseDown, true)
        window.removeEventListener('mousemove', onIframeMouseMove, true)
        window.removeEventListener('mouseup', onIframeMouseUp, true)
        window.removeEventListener('auxclick', onIframeAuxClick, true)
        window.removeEventListener('contextmenu', onIframeContextMenu, true)
        window.removeEventListener('blur', onIframeBlur)
      }
    }
    listeners.clear()
    presenceListeners.clear()
    pairingListeners.clear()
    zebraMediaListeners.clear()
    latestZebraMedia = null
    latestPairingEntry = null
    latestPairingPayload = null
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
    getZebraMedia,
    requestZebraMedia,
    onZebraMediaChanged,
    requestPairingPin,
    getPairingPin,
    onPairingPin,
    waitForPairingPin,
    ackPairingPin,
    onBarcodeScan,
    setDrawerCash,
    setDrawerCashCents,
    onDrawerCashChanged,
    dispose,
  }
}
