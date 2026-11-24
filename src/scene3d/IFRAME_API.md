# QuixPOS 3D Scene — Iframe Broadcast Channel API (Developer Note)

This note is for developers of the web applications embedded as screens inside the QuixPOS 3D showroom (`/3d`):

| `tabletId` | Screen | URL | Initial Power | Role |
| --- | --- | --- | --- | --- |
| `dash-left` | Artikelverwaltung (Backoffice) | `https://dashdemo.quixpos.com` | **ON** | Control station (`canControlScreens: true`) |
| `pos-center` | POS (Main Register) | `https://pos.quixpos.com` | **OFF** | Controlled screen |
| `pos-vertical` | Kundendisplay (Customer Display) | `https://posdemo.quixpos.com` | **OFF** | Controlled screen |
| `sumup-far-right` | SumUp Virtual Solo | `https://virtual-solo.sumup.com` | **OFF** | Controlled screen |

When `/3d` opens, **only the leftmost screen (`dash-left`) boots immediately**. The other 3 screens (`pos-center`, `pos-vertical`, `sumup-far-right`) start **switched OFF and disabled** (`poweredOn: false, enabled: false`). If a visitor clicks a physical 3D bezel power button on any of those 3 screens before `dash-left` enables or turns them on, the screen stays off and displays **`<- Login first`** (and emits `'screen:powerBlocked'`).

---

## Overview & Why `postMessage`

Because the 3D host (`quixpos.com`) and the embedded apps (`dashdemo.quixpos.com`, `pos.quixpos.com`, `posdemo.quixpos.com`, etc.) run on **different origins**, the browser's native `BroadcastChannel` API cannot bridge them due to origin partitioning.

Instead, the 3D scene exposes a **cross-origin Broadcast Message Channel** over `window.postMessage`. Every message on the channel consists of:

1. **`name`** (`string`) — the message/event name (e.g. `'screen:on'`, `'printer:escpos'`, `'drawer:open'`)
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
    "printers": ["zebra", "epson"],
    "activeView": "total",
    "drawerOpen": false,
    "pointerLocked": false,
    "screens": {
      "pos-center": {
        "id": "pos-center",
        "title": "POS",
        "subtitle": "pos.quixpos.com",
        "poweredOn": false,
        "enabled": false
      },
      "pos-vertical": {
        "id": "pos-vertical",
        "title": "Kundendisplay",
        "subtitle": "posdemo.quixpos.com",
        "poweredOn": false,
        "enabled": false
      },
      "sumup-far-right": {
        "id": "sumup-far-right",
        "title": "SumUp Virtual Solo",
        "subtitle": "virtual-solo.sumup.com",
        "poweredOn": false,
        "enabled": false
      }
    },
    "peers": ["dash-left", "pos-center", "pos-vertical", "sumup-far-right"]
  }
}
```

---

## 2. Leftmost Screen (`dash-left`) — Controlling the Other 3 Screens

Only the leftmost screen (`dash-left`, `dashdemo.quixpos.com`) is authorized to switch the other 3 screens (`'pos-center'`, `'pos-vertical'`, `'sumup-far-right'`) **ON** or **OFF**. Power commands sent from any other iframe are ignored by the host.

| Message `name` | `data` object | Description |
| --- | --- | --- |
| `'screen:on'` | `{ tabletId: 'pos-center' }` or `{ tabletIds: string[] }` or `{ all: true }` | Enable and switch one, several, or all 3 controllable screens **ON**. |
| `'screen:off'` | `{ tabletId: 'pos-center', keepEnabled?: boolean }` or `{ tabletIds: string[] }` or `{ all: true }` | Switch screen(s) **OFF** (also resets `enabled: false` unless `keepEnabled: true`, so bezel buttons show `<- Login first` again after logout). |
| `'screen:enable'` | `{ tabletId?: string, tabletIds?: string[], all?: boolean, powerOn?: boolean }` | Unlock the 3D bezel power button(s) after login (optionally booting immediately if `powerOn: true`). |
| `'screen:disable'` | `{ tabletId?: string, tabletIds?: string[], all?: boolean }` | Switch screen(s) **OFF** and lock their 3D bezel power buttons back to `<- Login first`. |
| `'screen:power'` | `{ tabletId: 'pos-center', poweredOn: boolean, enabled?: boolean }` (also supports `tabletIds` or `all: true`) | Explicitly set power state (`true` = ON, `false` = OFF). |
| `'screen:toggle'` | `{ tabletId: 'pos-center' }` (or `{ tabletIds: string[] }` / `{ all: true }`) | Toggle screen(s) between ON and OFF. |
| `'screens:get'` | `{}` | Replies directly to the caller with `'screens:state'` `{ screens }`. |

---

## 3. Terminal Pairing PIN Delivery (`pos:pairing`)

When `dash-left` provisions unpaired showroom terminals (`pos` -> `pos-center`, `customer` -> `pos-vertical`), it sends `'pos:pairing'` upstream. Because `pos-center` and `pos-vertical` boot asynchronously after `'screen:on'`, the 3D host **stores** the latest pairing PIN per `tabletId` and replays it automatically:

- Immediately to any already-loaded peer iframe when `'pos:pairing'` arrives
- Automatically when a peer iframe finishes `load` or sends `'scene:ping'`
- Immediately in response to `'pos:pairing:get'`

Stored PINs are cleared when a peer acknowledges binding (`'pos:pairing:consumed'`), when `dash-left` sends `'pos:pairing:clear'` or reloads, or when a screen is disabled/turned off on logout.

### Wire Messages

| Message `name` | Direction | `data` object | Description |
| --- | --- | --- | --- |
| `'pos:pairing'` | `dash-left` -> Host -> Peers | `{ host, origin, terminals, byTabletId }` | Stores pending PIN(s) on the 3D host and delivers them to peer iframes. |
| `'pos:pairing:get'` | Peer -> Host | `{}` | Pulls any waiting `'pos:pairing'` payload for the calling iframe's `tabletId`. |
| `'pos:pairing:consumed'` | Peer -> Host | `{ pin?: string, id?: number \| string }` | Clears the calling iframe's waiting PIN on the host after binding succeeds. |
| `'pos:pairing:clear'` | `dash-left` -> Host | `{ tabletId?: string }` | Clears waiting PIN for one tablet (or all tablets if `tabletId` omitted). |

### Client Helper Usage (`iframeClient.ts`)

```ts
import { createSceneChannelClient } from './iframeClient'

const scene = createSceneChannelClient()

// Fires immediately if a PIN is already waiting (locally or cached on the 3D host),
// and whenever a new PIN arrives later. Automatically scoped to this iframe's tabletId.
const unsub = scene.onPairingPin(async (pairing) => {
  await bindTerminalWithPin(pairing.host, pairing.pin)
  scene.ackPairingPin(pairing.pin) // clear waiting PIN on host
})

// Or await once during boot:
// const pairing = await scene.waitForPairingPin(5000)
```

---

## 4. Printing on the Two 3D Printers (ZPL & ESC/POS)

The 3D desk includes two physical printers that any powered-on iframe can print to:

1. **Zebra ZD420 Label Printer (`'printer:zpl'`)** — between `dash-left` and `pos-center`, emulating **ZPL II** (203 dpi thermal shipping & product barcode labels).
2. **Epson TM-m30III Receipt Printer (`'printer:escpos'`)** — to the right of the customer/SumUp displays, emulating **ESC/POS** (80mm / 576-dot thermal receipts).

### How 3D Print & Floor-Drop Animation Works
- **Print #1**: Emulates the ZPL or ESC/POS commands onto a thermal label/receipt texture and smoothly **feeds the printed sheet out of the printer's front slot**.
- **Next Print**: Detaches the **previous** label/receipt from the printer slot so it **slides off the front of the desk and flutters face-up onto the floor**, while the newly printed sheet feeds out of the slot.

---

### A. Printing a ZPL Label on Zebra ZD420 (`'printer:zpl'`)

Send message name `'printer:zpl'` (alias `'print:zpl'`) with `{ zpl: string, jobId?: string }`:

```ts
window.parent.postMessage(
  {
    channel: 'quixpos-scene3d',
    name: 'printer:zpl',
    data: {
      jobId: 'label-101',
      zpl: [
        '^XA',
        '^PW812^LL600',
        '^FO30,30^GB752,84,84^FS',
        '^FO50,48^FR^A0N,48,48^FDPAKETVERSAND - DHL^FS',
        '^FO40,145^A0N,34,34^FDAn: Max Mustermann^FS',
        '^FO40,190^A0N,30,30^FDMusterstrasse 12, 10115 Berlin^FS',
        '^FO40,250^GB732,3,3^FS',
        '^BY3,3,110^FO60,285^BCN,110,Y,N^FD003404341610928142^FS',
        '^FO580,270^BQN,2,6^FDQA,https://quixpos.com^FS',
        '^XZ',
      ].join('\n'),
    },
  },
  '*',
)
```

**Supported ZPL II commands:**
- Label setup: `^XA` ... `^XZ`, `^PW<width>`, `^LL<length>`, `^LH<x>,<y>`, `^CF<font>,<h>,<w>`, `^CI`
- Positioning & text: `^FO<x>,<y>`, `^FT<x>,<y>`, `^A0N,<h>,<w>` (orientations `N`, `R`, `I`, `B`), `^FB<width>,<maxLines>,<lineSpacing>,<align>` (including `\&` line breaks), `^FD...^FS`, `^FH` hex escapes (`_C3_A4` UTF-8 / Latin-1), `^FR` white-on-black reverse print
- Graphics: `^GB<w>,<h>,<t>,<color>,<rounding>` (boxes, rules, filled bars, rounded rects), `^GC` circles, `^GD` diagonals, `^GFA` ASCII hex bitmaps
- Barcodes & QR: `^BY<mw>,<ratio>,<h>`, `^BC` (Code 128), `^B3` (Code 39), `^BE`/`^BU` (EAN/UPC), `^BQ` (QR Code)

---

### B. Printing an ESC/POS Receipt on Epson TM-m30III (`'printer:escpos'`)

Send message name `'printer:escpos'` (alias `'print:escpos'`). You can pass the ESC/POS stream in whichever format your app produces:
- `{ escpos: string, encoding?: 'utf8' | 'base64' | 'latin1', jobId?: string }`
- `{ base64: string, jobId?: string }` *(recommended for binary buffers)*
- `{ bytes: number[], jobId?: string }`

```ts
const escposReceipt =
  '\x1b@' +                         // Initialize
  '\x1ba\x01' +                     // Center align
  '\x1d!\x11\x1bE\x01QuixPOS Café\x1bE\x00\x1d!\x00\n' +
  'Musterstr. 12 · 10115 Berlin\n\n' +
  '\x1ba\x00' +                     // Left align
  '1x Espresso             2,80 EUR\n' +
  '2x Croissant            6,40 EUR\n' +
  '--------------------------------\n' +
  '\x1bE\x01SUMME                   9,20 EUR\x1bE\x00\n' +
  'inkl. 19% MwSt.         1,47 EUR\n\n' +
  '\x1ba\x01' +                     // Center QR + barcode
  '\x1d(k\x03\x001C\x06' +          // QR module size 6
  '\x1d(k\x1c\x001P0TSE-SIG-OK-2026-QUIXPOS-001' +
  '\x1d(k\x03\x001Q0\n' +           // Print QR
  'Vielen Dank!\n' +
  '\x1dV\x42\x00'                   // Partial cut

window.parent.postMessage(
  {
    channel: 'quixpos-scene3d',
    name: 'printer:escpos',
    data: { escpos: escposReceipt, jobId: 'bon-42' },
  },
  '*',
)
```

**Supported ESC/POS commands:**
- Control & feed: `ESC @` (init), `LF`, `CR`, `HT`, `ESC D` (tab stops), `ESC d n` (feed lines), `ESC J n` (feed dots), `ESC 2` / `ESC 3 n` (line spacing)
- Styling & layout: `ESC a n` (left/center/right), `ESC ! n` (master mode), `ESC E n` (bold), `ESC - n` (underline), `ESC M n` (Font A 48-col / Font B 64-col), `GS ! n` (1x–6x width/height magnification), `GS B n` (white-on-black reverse print), UTF-8 + CP858 (`äöüß€`)
- Barcodes, QR & Graphics: `GS h`, `GS w`, `GS H`, `GS k` (1D barcodes incl. Code 128 / EAN / Code 39), `GS ( k` (QR code size/store/print — e.g. German TSE KassenSichV QR codes), `GS v 0` (raster bit images / logos)
- Hardware actions: `GS V` (paper cut) and **`ESC p` (`\x1b\x70...`)** — automatically kicks open the 3D cash drawer!

---

## 5. All Built-in Host Commands & Events

### Built-in Host Commands (Iframe -> 3D Scene)

| Message `name` | `data` object | Description |
| --- | --- | --- |
| `'scene:ping'` | `{}` | Requests an immediate `'scene:presence'` snapshot back to the caller (and replays any waiting `'pos:pairing'` PIN). |
| `'pos:pairing'` | `{ host, origin, terminals, byTabletId }` | *(Authorized for `dash-left`)* Caches pending terminal pairing PINs on the host and relays them to peer iframes. |
| `'pos:pairing:get'` | `{}` | Replies directly to the caller with `'pos:pairing'` if a waiting PIN exists for its `tabletId`. |
| `'pos:pairing:consumed'` | `{ pin?, id? }` | Clears the caller's waiting pairing PIN on the 3D host once paired. |
| `'pos:pairing:clear'` | `{ tabletId? }` | *(Authorized for `dash-left`)* Clears waiting pairing PIN(s) on the 3D host. |
| `'printer:zpl'` | `{ zpl: string, jobId?: string }` | Renders ZPL II onto Zebra ZD420; drops previous Zebra label to the floor. |
| `'printer:escpos'` | `{ escpos?: string, base64?: string, bytes?: number[], encoding?: string, jobId?: string }` | Renders ESC/POS onto Epson TM-m30III; drops previous receipt to the floor (and opens drawer on `ESC p`). |
| `'drawer:open'` | `{}` | Slides the 3D cash drawer open. |
| `'drawer:close'` | `{}` | Slides the 3D cash drawer closed. |
| `'drawer:toggle'` | `{}` | Toggles the 3D cash drawer open/closed. |
| `'camera:focus'` | `{ view: 'total' \| 'left' \| 'center' \| 'right' \| 'drawer' }` | Smoothly flies the 3D camera to the specified station preset. |
| `'camera:return'` | `{}` | Returns the 3D camera to its previous pose. |
| `'tablet:reload'` | `{ tabletId?: string }` | Reloads a powered-on tablet screen (defaults to caller's own `tabletId`). |

### Built-in Host Events (3D Scene -> Powered-On Iframes)

| Message `name` | `data` object | When it fires |
| --- | --- | --- |
| `'scene:presence'` | `{ version, tabletId, title, canControlScreens, printers, activeView, drawerOpen, pointerLocked, screens, peers }` | On iframe `load` and in response to `'scene:ping'`. |
| `'printer:printed'` | `{ printer: 'zebra' \| 'epson', protocol: 'zpl' \| 'escpos', jobId?, droppedPrevious, requestedBy }` | Whenever a ZPL or ESC/POS print job begins feeding out of a printer. |
| `'screens:changed'` | `{ tabletId?, poweredOn?, enabled?, screens }` | Whenever any of the 3 controllable screens changes power or enabled state. |
| `'screen:powerBlocked'` | `{ tabletId, reason: 'login_required' }` | When a visitor clicks the 3D power button on an off screen not yet enabled by `dash-left` (`<- Login first` shown). |
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

// Print a ZPL shipping/article label on Zebra ZD420
scene.printZpl('^XA^FO40,40^A0N,44,44^FDArtikel #10042^FS^BY3^FO40,110^BCN,90,Y,N^FD4012345678901^FS^XZ')

// Print an ESC/POS receipt (accepts string, Uint8Array, or number[]) on Epson TM-m30III
scene.printEscPos('\x1b@\x1ba\x01QuixPOS Beleg\n\x1ba\x00Espresso   2,80 EUR\n\x1dV\x42\x00')

// Optional callback when print jobs feed
scene.onPrinted((job) => {
  console.log('Printed on', job.printer, 'droppedPrevious=', job.droppedPrevious)
})
```
