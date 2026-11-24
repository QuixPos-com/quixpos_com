# QuixPOS 3D Scene — Iframe Broadcast Channel API (Developer Note)

This note is for developers of the web applications embedded as screens inside the QuixPOS 3D showroom (`/3d`):

| `tabletId` | Screen | URL | Initial Power | Role |
| --- | --- | --- | --- | --- |
| `dash-left` | Artikelverwaltung (Backoffice) | `https://dashdemo.quixpos.com` | **ON** | Control station (`canControlScreens: true`) |
| `pos-center` | POS (Main Register) | `https://pos.quixpos.com` | **OFF** | Controlled screen |
| `pos-vertical` | Kundendisplay (Customer Display) | `https://posdemo.quixpos.com` | **OFF** | Controlled screen |
| `sumup-far-right` | SumUp Virtual Solo | `https://virtual-solo.sumup.com` | **OFF** | Controlled screen |

When `/3d` opens, **only the leftmost screen (`dash-left`) boots immediately**. The other 3 screens (`pos-center`, `pos-vertical`, `sumup-far-right`) start **switched OFF** (dark 3D glass panels, unloaded iframes) until switched ON via the `dash-left` API (or via their physical 3D bezel power buttons).

---

## Overview & Why `postMessage`

Because the 3D host (`quixpos.com`) and the embedded apps (`dashdemo.quixpos.com`, `pos.quixpos.com`, `posdemo.quixpos.com`, etc.) run on **different origins**, the browser's native `BroadcastChannel` API cannot bridge them due to origin partitioning.

Instead, the 3D scene exposes a **cross-origin Broadcast Message Channel** over `window.postMessage`. Every message on the channel consists of:

1. **`name`** (`string`) — the message/event name (e.g. `'screen:on'`, `'drawer:open'`, `'pos:receiptUpdated'`)
2. **`data`** (`object`) — a plain JSON-serializable payload object (e.g. `{ tabletId: 'pos-center' }`)

Any message sent by a powered-on iframe is:
- **Delivered to the 3D host** (to trigger 3D hardware actions or host callbacks), and
- **Broadcast to all other powered-on iframes** in the 3D scene (so `dashdemo.quixpos.com`, `pos.quixpos.com`, and `posdemo.quixpos.com` can also communicate directly with each other on the same channel).

---

## Wire Format

All messages posted via `postMessage` share a single envelope:

```ts
{
  channel: 'quixpos-scene3d',
  name: string,                  // message name
  data: Record<string, unknown>, // payload object (defaults to {})
  sender?: string,               // set by the host on delivery: 'host' or peer tabletId
}
```

---

## 1. Detecting 3D Scene Presence

You have **two ways** to detect that your page is running inside the 3D scene:

### A. Instant / Synchronous Check (on initial render)
Before loading your URL, the 3D scene sets the `<iframe>` window name to `quixpos-scene3d:<tabletId>`. You can check this synchronously on startup with zero latency:

```ts
const isIn3DScene =
  window.parent !== window &&
  window.name.startsWith('quixpos-scene3d:')

// 'dash-left' | 'pos-center' | 'pos-vertical' | 'sumup-far-right'
const tabletId = isIn3DScene
  ? window.name.slice('quixpos-scene3d:'.length)
  : null
```

### B. Live Handshake (`scene:ping` -> `scene:presence`)
- When your iframe finishes loading, the 3D host automatically sends `'scene:presence'` to your window.
- You can also send `'scene:ping'` at any time (for example when your SPA mounts after `load`) and the host will immediately reply with `'scene:presence'`:

```json
{
  "channel": "quixpos-scene3d",
  "name": "scene:presence",
  "sender": "host",
  "data": {
    "version": 1,
    "tabletId": "dash-left",
    "title": "Artikelverwaltung",
    "canControlScreens": true,
    "activeView": "total",
    "drawerOpen": false,
    "pointerLocked": false,
    "screens": {
      "pos-center": {
        "id": "pos-center",
        "title": "POS",
        "subtitle": "pos.quixpos.com",
        "poweredOn": false
      },
      "pos-vertical": {
        "id": "pos-vertical",
        "title": "Kundendisplay",
        "subtitle": "posdemo.quixpos.com",
        "poweredOn": false
      },
      "sumup-far-right": {
        "id": "sumup-far-right",
        "title": "SumUp Virtual Solo",
        "subtitle": "virtual-solo.sumup.com",
        "poweredOn": false
      }
    },
    "peers": ["dash-left", "pos-center", "pos-vertical", "sumup-far-right"]
  }
}
```

---

## 2. Leftmost Screen (`dash-left`) — Controlling the Other 3 Screens

Only the leftmost screen (`dash-left`, `dashdemo.quixpos.com`) is authorized to switch the other 3 screens (`'pos-center'`, `'pos-vertical'`, `'sumup-far-right'`) **ON** or **OFF**. Power commands sent from any other iframe are ignored by the host.

- Switching a screen **ON** illuminates its 3D power LED & webcam dot, reveals the screen panel, and boots its iframe URL.
- Switching a screen **OFF** unloads its iframe (`about:blank`), hides the DOM frame, and renders a dark powered-off 3D monitor surface.

### Screen Power Commands (`dash-left` -> 3D Host)

| Message `name` | `data` object | Description |
| --- | --- | --- |
| `'screen:on'` | `{ tabletId: 'pos-center' }` or `{ tabletIds: string[] }` or `{ all: true }` | Switch one, several, or all 3 controllable screens **ON**. |
| `'screen:off'` | `{ tabletId: 'pos-center' }` or `{ tabletIds: string[] }` or `{ all: true }` | Switch one, several, or all 3 controllable screens **OFF**. |
| `'screen:power'` | `{ tabletId: 'pos-center', poweredOn: boolean }` (also supports `tabletIds` or `all: true`) | Explicitly set power state (`true` = ON, `false` = OFF). |
| `'screen:toggle'` | `{ tabletId: 'pos-center' }` (or `{ tabletIds: string[] }` / `{ all: true }`) | Toggle screen(s) between ON and OFF. |
| `'screens:get'` | `{}` | Replies directly to the caller with `'screens:state'` `{ screens }`. |

### Keeping `dash-left` UI in Sync (`screens:changed`)
Users in the 3D scene can also press the physical power button on the bottom-right bezel of any monitor. Whenever any screen's power changes (via API or 3D bezel button), the host broadcasts **`'screens:changed'`**:

```json
{
  "channel": "quixpos-scene3d",
  "name": "screens:changed",
  "sender": "host",
  "data": {
    "tabletId": "pos-center",
    "poweredOn": true,
    "screens": {
      "pos-center": { "id": "pos-center", "title": "POS", "subtitle": "pos.quixpos.com", "poweredOn": true },
      "pos-vertical": { "id": "pos-vertical", "title": "Kundendisplay", "subtitle": "posdemo.quixpos.com", "poweredOn": false },
      "sumup-far-right": { "id": "sumup-far-right", "title": "SumUp Virtual Solo", "subtitle": "virtual-solo.sumup.com", "poweredOn": false }
    }
  }
}
```

### Minimal Example for `dashdemo.quixpos.com` (`dash-left`)

```ts
function sendToScene(name: string, data: Record<string, unknown> = {}) {
  if (window.parent === window) return
  window.parent.postMessage({ channel: 'quixpos-scene3d', name, data }, '*')
}

// Switch POS & Customer Display ON:
sendToScene('screen:on', { tabletIds: ['pos-center', 'pos-vertical'] })

// Switch SumUp terminal ON:
sendToScene('screen:power', { tabletId: 'sumup-far-right', poweredOn: true })

// Switch all 3 screens OFF:
sendToScene('screen:off', { all: true })

// Listen for initial state & live power changes (including 3D bezel button clicks):
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return
  const msg = event.data
  if (msg?.channel !== 'quixpos-scene3d') return

  if (msg.name === 'scene:presence' || msg.name === 'screens:changed' || msg.name === 'screens:state') {
    console.log('Controllable screens state:', msg.data.screens)
  }
})
```

---

## 3. General Host Commands & Events (All Powered-On Screens)

### Built-in Host Commands (Iframe -> 3D Scene)

| Message `name` | `data` object | Description |
| --- | --- | --- |
| `'scene:ping'` | `{}` | Requests an immediate `'scene:presence'` snapshot back to the caller. |
| `'drawer:open'` | `{}` | Slides the 3D cash drawer open (e.g. on cash checkout). |
| `'drawer:close'` | `{}` | Slides the 3D cash drawer closed. |
| `'drawer:toggle'` | `{}` | Toggles the 3D cash drawer open/closed. |
| `'camera:focus'` | `{ view: 'total' \| 'left' \| 'center' \| 'right' \| 'drawer' }` | Smoothly flies the 3D camera to the specified station preset. |
| `'camera:return'` | `{}` | Returns the 3D camera to its previous pose. |
| `'tablet:reload'` | `{ tabletId?: string }` | Reloads a powered-on tablet screen (defaults to caller's own `tabletId`). |

### Built-in Host Events (3D Scene -> Powered-On Iframes)

| Message `name` | `data` object | When it fires |
| --- | --- | --- |
| `'scene:presence'` | `{ version, tabletId, title, canControlScreens, activeView, drawerOpen, pointerLocked, screens, peers }` | On iframe `load` and in response to `'scene:ping'`. |
| `'screens:changed'` | `{ tabletId?, poweredOn?, screens }` | Whenever any of the 3 controllable screens switches ON or OFF. |
| `'screens:state'` | `{ screens }` | Direct reply to `'screens:get'`. |
| `'drawer:changed'` | `{ open: boolean }` | Whenever the 3D cash drawer opens or closes. |
| `'camera:viewChanged'` | `{ view: 'total' \| 'left' \| 'center' \| 'right' \| 'drawer' \| null }` | Whenever the active camera preset changes (or `null` during free walk/look). |
| `'scene:lockChanged'` | `{ locked: boolean }` | Whenever first-person pointer-lock crosshair mode toggles. |
| *Custom names* | `{ ... }` | Any custom `(name, data)` broadcast by another iframe (`sender` = peer `tabletId`) or the host (`sender` = `'host'`). |

---

## Ready-to-Use TypeScript Client Helper

You can copy [`src/scene3d/iframeClient.ts`](./iframeClient.ts) directly into your project (zero dependencies):

```ts
import { createSceneChannelClient } from './iframeClient'

const scene = createSceneChannelClient()

// 1. Detect presence
if (scene.isPresent()) {
  console.log('Running in 3D tablet:', scene.getTabletId())
}

// 2. On 'dash-left': observe & control the other 3 screens
const offScreens = scene.onScreensChanged((screens) => {
  console.log('POS powered on?', screens['pos-center']?.poweredOn)
})

scene.setScreenPower('pos-center', true)
scene.setScreenPower('pos-vertical', true)
scene.setAllScreensPower(false) // switches all 3 off

// 3. Register callbacks & send custom or hardware messages
const offDrawer = scene.on<{ open: boolean }>('drawer:changed', (data) => {
  console.log('Cash drawer open:', data.open)
})

scene.send('drawer:open', {})
```

### Tip: Live Testing in Browser DevTools

When viewing `/3d` in the browser, `window.quixposSceneChannel` is exposed on the host window:

```js
// Switch all 3 right-hand screens ON from the host DevTools console:
window.quixposSceneChannel.on('*', (data, meta) => console.log('[scene3d]', meta.sender, meta.name, data))
```
