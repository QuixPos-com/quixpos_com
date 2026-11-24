import type {
  FocusViewId,
  ScreenPowerSummary,
  TabletInstance,
  ZebraMediaInfo,
} from './types'

export const SCENE_CHANNEL_ID = 'quixpos-scene3d'
export const SCENE_WINDOW_NAME_PREFIX = 'quixpos-scene3d:'

export type SceneMessageData = Record<string, unknown>

export interface SceneChannelEnvelope<
  T extends SceneMessageData = SceneMessageData,
> {
  channel: typeof SCENE_CHANNEL_ID
  name: string
  data: T
  sender?: string
}

export interface ScenePresenceState {
  activeView: FocusViewId | null
  drawerOpen: boolean
  pointerLocked: boolean
  screens: Record<string, ScreenPowerSummary>
  zebraMedia: ZebraMediaInfo
}

export interface ScenePresencePayload extends ScenePresenceState {
  [key: string]: unknown
  version: 1
  tabletId: string
  title: string
  canControlScreens: boolean
  printers: Array<'zebra' | 'epson'>
  peers: string[]
}

export interface PosPairingEntry {
  [key: string]: unknown
  id?: number | string
  name?: string
  pin: string
  tabletId: string
  host: string
  origin?: string
  created?: boolean
}

export interface PosPairingPayload {
  [key: string]: unknown
  host: string
  origin: string
  terminals: Record<string, PosPairingEntry>
  byTabletId: Record<string, PosPairingEntry>
}

export interface SceneMessageMeta {
  name: string
  sender: string
  origin: string
  /** Send a direct reply (name + object) back to the calling iframe */
  reply: (name: string, data?: SceneMessageData) => void
}

export type SceneMessageCallback<
  T extends SceneMessageData = SceneMessageData,
> = (data: T, meta: SceneMessageMeta) => void

export interface SceneBroadcastChannel {
  /** Broadcast a message (name + object) from the 3D host to all loaded iframes */
  send: (name: string, data?: SceneMessageData) => void
  /** Send a message (name + object) from the 3D host to a single tablet iframe */
  sendTo: (tabletId: string, name: string, data?: SceneMessageData) => void
  /** Register a callback for a message name (or '*' for every message). Returns an unsubscribe function. */
  on: <T extends SceneMessageData = SceneMessageData>(
    name: string,
    callback: SceneMessageCallback<T>,
  ) => () => void
  /** Unregister a previously registered callback */
  off: <T extends SceneMessageData = SceneMessageData>(
    name: string,
    callback: SceneMessageCallback<T>,
  ) => void
  /** Internal: bind mounted tablet instances once the 3D scene builds them */
  attachTablets: (
    tablets: TabletInstance[],
    getPresenceState: () => ScenePresenceState,
    onTabletLoaded?: (tabletId: string) => void,
  ) => void
  /** Internal: mark a tablet as unloading before resetting its src */
  notifyTabletReloading: (tabletId: string) => void
  /** Remove all listeners and registered callbacks */
  dispose: () => void
}

function isPlainObject(value: unknown): value is SceneMessageData {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveExpectedOrigin(url: string): string | null {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://quixpos.com'
    return new URL(url, base).origin
  } catch {
    return null
  }
}

export function createSceneBroadcastChannel(): SceneBroadcastChannel {
  let disposed = false
  let tablets: TabletInstance[] = []
  let getPresenceState: (() => ScenePresenceState) | null = null
  const loadedTablets = new Set<string>()
  const tabletCleanupFns: Array<() => void> = []

  const listeners = new Map<string, Set<SceneMessageCallback<any>>>()

  const postToTablet = (
    tablet: TabletInstance,
    name: string,
    data: SceneMessageData,
    sender: string,
  ) => {
    if (disposed || !tablet.poweredOn || !loadedTablets.has(tablet.spec.id)) {
      return
    }
    const win = tablet.iframeEl.contentWindow
    const targetOrigin = resolveExpectedOrigin(tablet.spec.url)
    if (!win || !targetOrigin) return

    const envelope: SceneChannelEnvelope = {
      channel: SCENE_CHANNEL_ID,
      name,
      data,
      sender,
    }

    try {
      win.postMessage(envelope, targetOrigin)
    } catch {
      // Ignore transient frame navigation states
    }
  }

  const sendPresenceToTablet = (tablet: TabletInstance) => {
    const state: ScenePresenceState = getPresenceState
      ? getPresenceState()
      : {
          activeView: null,
          drawerOpen: false,
          pointerLocked: false,
          screens: {},
          zebraMedia: {
            id: '101x51',
            label: '101 × 51 mm',
            dpi: 203,
            widthMm: 101,
            heightMm: 51,
            widthPx: 807,
            heightPx: 408,
          },
        }

    const payload: ScenePresencePayload = {
      version: 1,
      tabletId: tablet.spec.id,
      title: tablet.spec.title,
      canControlScreens: Boolean(tablet.spec.canControlScreens),
      printers: ['zebra', 'epson'],
      activeView: state.activeView,
      drawerOpen: state.drawerOpen,
      pointerLocked: state.pointerLocked,
      screens: state.screens,
      zebraMedia: state.zebraMedia,
      peers: tablets.map((t) => t.spec.id),
    }

    postToTablet(tablet, 'scene:presence', payload, 'host')
  }

  const dispatchToHostCallbacks = (
    name: string,
    data: SceneMessageData,
    meta: SceneMessageMeta,
  ) => {
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

  const onWindowMessage = (event: MessageEvent) => {
    if (disposed || !event.source) return
    const raw = event.data
    if (!isPlainObject(raw)) return
    if (raw.channel !== SCENE_CHANNEL_ID || typeof raw.name !== 'string') return

    const name = raw.name.trim()
    if (!name) return

    const senderTablet = tablets.find(
      (t) => t.iframeEl.contentWindow === event.source,
    )
    if (!senderTablet || !senderTablet.poweredOn) return

    const expectedOrigin = resolveExpectedOrigin(senderTablet.spec.url)
    const hostOrigin = window.location.origin
    if (event.origin !== expectedOrigin && event.origin !== hostOrigin) {
      return
    }

    // Confirm the frame has committed its document and can receive postMessages
    loadedTablets.add(senderTablet.spec.id)

    const data: SceneMessageData = isPlainObject(raw.data) ? raw.data : {}
    const senderId = senderTablet.spec.id

    // Built-in presence handshake probe & host-only pull queries
    if (name === 'scene:ping') {
      sendPresenceToTablet(senderTablet)
    } else if (
      name !== 'pos:pairing:get' &&
      name !== 'screens:get' &&
      name !== 'printer:info' &&
      name !== 'printer:media:get'
    ) {
      // Relay broadcast message to all other loaded iframes on the channel
      for (const peer of tablets) {
        if (peer.spec.id !== senderId) {
          postToTablet(peer, name, data, senderId)
        }
      }
    }

    const meta: SceneMessageMeta = {
      name,
      sender: senderId,
      origin: event.origin,
      reply: (replyName: string, replyData: SceneMessageData = {}) => {
        postToTablet(senderTablet, replyName, replyData, 'host')
      },
    }

    dispatchToHostCallbacks(name, data, meta)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', onWindowMessage)
  }

  const send = (name: string, data: SceneMessageData = {}) => {
    if (disposed) return
    for (const tablet of tablets) {
      postToTablet(tablet, name, data, 'host')
    }
  }

  const sendTo = (
    tabletId: string,
    name: string,
    data: SceneMessageData = {},
  ) => {
    if (disposed) return
    const target = tablets.find((t) => t.spec.id === tabletId)
    if (!target) return
    postToTablet(target, name, data, 'host')
  }

  const off = <T extends SceneMessageData = SceneMessageData>(
    name: string,
    callback: SceneMessageCallback<T>,
  ) => {
    const set = listeners.get(name)
    if (!set) return
    set.delete(callback as SceneMessageCallback<any>)
    if (set.size === 0) {
      listeners.delete(name)
    }
  }

  const on = <T extends SceneMessageData = SceneMessageData>(
    name: string,
    callback: SceneMessageCallback<T>,
  ) => {
    let set = listeners.get(name)
    if (!set) {
      set = new Set()
      listeners.set(name, set)
    }
    set.add(callback as SceneMessageCallback<any>)
    return () => off(name, callback)
  }

  const attachTablets = (
    nextTablets: TabletInstance[],
    presenceStateGetter: () => ScenePresenceState,
    onTabletLoaded?: (tabletId: string) => void,
  ) => {
    for (const fn of tabletCleanupFns) fn()
    tabletCleanupFns.length = 0
    loadedTablets.clear()

    tablets = nextTablets
    getPresenceState = presenceStateGetter

    for (const tablet of tablets) {
      const onLoad = () => {
        if (disposed || !tablet.poweredOn) return
        const src = tablet.iframeEl.getAttribute('src') || ''
        if (!src || src === 'about:blank') return
        loadedTablets.add(tablet.spec.id)
        sendPresenceToTablet(tablet)
        onTabletLoaded?.(tablet.spec.id)
      }
      tablet.iframeEl.addEventListener('load', onLoad)
      tabletCleanupFns.push(() => {
        tablet.iframeEl.removeEventListener('load', onLoad)
      })
    }
  }

  const notifyTabletReloading = (tabletId: string) => {
    loadedTablets.delete(tabletId)
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', onWindowMessage)
    }
    for (const fn of tabletCleanupFns) fn()
    tabletCleanupFns.length = 0
    loadedTablets.clear()
    listeners.clear()
    tablets = []
    getPresenceState = null
  }

  return {
    send,
    sendTo,
    on,
    off,
    attachTablets,
    notifyTabletReloading,
    dispose,
  }
}

declare global {
  interface Window {
    quixposSceneChannel?: SceneBroadcastChannel
  }
}
