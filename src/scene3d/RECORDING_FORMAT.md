# QuixPOS 3D Recording Archive Specification (`.q3d`)

Recordings captured on `/3d_rec` are packaged into a single `.q3d` file for immediate in-page 3D replay or offline playback in a standalone client.

---

## 1. Container Layout (Standard PKZIP, Method `0 = STORE`)

Every `.q3d` file is a valid PKZIP 2.0 archive using uncompressed `STORE` entries so multi-hundred-MB video tracks can be sliced directly from disk (`Blob.slice` / `mmap`) with zero memory copies:

```text
quixpos-3d-YYYYMMDD-HHmmss.q3d
├── recording.json        # UTF-8 SceneRecordingManifest (camera frames, discrete 3D events, tablet matrices)
├── capture.webm          # Tab screen capture video (+ optional tab/mic audio), or capture.mp4 on Safari
└── assets/
    └── shelf-*.webp      # Embedded WebP textures for 3D shelf inventory boxes (100% offline-capable)
```

---

## 2. `recording.json` Schema (`SceneRecordingManifest`)

See [`src/scene3d/recorder/recordingTypes.ts`](./recorder/recordingTypes.ts) for the canonical TypeScript types:

- `format`: `'quixpos-scene3d-recording'`
- `version`: `1`
- `createdAt`: ISO-8601 timestamp
- `durationMs`: Total recording duration in milliseconds
- `videoFile`: `'capture.webm'` or `'capture.mp4'`
- `videoMimeType`: e.g. `'video/webm;codecs=vp9,opus'`
- `videoWidth`, `videoHeight`: Captured surface pixel dimensions
- `hasAudio`, `hasTabAudio`, `hasMicAudio`: Audio track presence flags
- `tablets`: Array of the 4 3D monitor planes (`dash-left`, `pos-center`, `pos-vertical`, `sumup-far-right`) including `screenW`, `screenH`, `cutoutW`, `cutoutH`, and column-major 4×4 `matrixWorld`
- `shelfImageAssets`: Map of original product image URL → archive path (`assets/shelf-N.webp`)
- `initialSnapshot`: Complete scene state at `t = 0` (camera pose, active view, screen power/enabled flags, cash drawer open & Euro cents, Zebra reel size, shelf products, and normalized `hudExclusionRects`)
- `frames`: Array of compact 17-number tuples (`RecordedFrameTuple`) sampled every animation frame:
  ```ts
  [
    tMs,        // 0: Milliseconds since MediaRecorder start (synced to video mediaTime)
    camX,       // 1: Camera world X (1 unit = 0.25 mm)
    camY,       // 2: Camera world Y
    camZ,       // 3: Camera world Z
    yaw,        // 4: Camera yaw (radians, YXZ Euler order)
    pitch,      // 5: Camera pitch (radians, YXZ Euler order)
    fov,        // 6: Vertical field of view (degrees)
    stageW,     // 7: Recorded viewport CSS width
    stageH,     // 8: Recorded viewport CSS height
    cursorU,    // 9: Normalized aim X (0 = left .. 1 = right)
    cursorV,    // 10: Normalized aim Y (0 = top .. 1 = bottom)
    moveKnobX,  // 11: Left virtual stick X deflection (px)
    moveKnobY,  // 12: Left virtual stick Y deflection (px)
    aimKnobX,   // 13: Right virtual stick X deflection (px)
    aimKnobY,   // 14: Right virtual stick Y deflection (px)
    zoomNorm,   // 15: Normalized zoom slider position (0..1)
    flags,      // 16: Bitmask (FRAME_FLAG_*)
  ]
  ```
- `events`: Chronological array of discrete hardware & channel events (`view:change`, `tablet:power`, `tablet:powerBlocked`, `tablet:reload`, `drawer:state`, `drawer:cash`, `zebra:reel`, `zebra:pickerModal`, `print:zpl`, `print:escpos`, `label:pickup`, `label:rotate`, `label:place`, `label:cancel`, `scanner:pickup`, `scanner:putdown`, `scanner:pulse`, `scanner:decoded`, `shelves:setProducts`, `shelves:upsertProduct`, `shelves:clear`, `audio:mute`, `hud:rects`).

---

## 3. Projecting the Recorded Tab Video onto the 3D Monitors

During replay, cross-origin `<iframe>`s are not loaded. Instead, each powered-on 3D monitor maintains a persistent offscreen render target (`1920×1080` for `dash-left`, `1024×640` for `pos-center`, `432×688` for `pos-vertical`, `400×465` for `sumup-far-right`).

Whenever a decoded video frame arrives at `mediaTimeMs`:
1. Interpolate `frames` at `mediaTimeMs` to reconstruct the exact recorded camera `uRecordedViewProj = projectionMatrix * matrixWorldInverse`.
2. For each powered-on front-facing tablet (`dot(screenNormal, normalize(recCamPos - screenPos)) > 0.12`), run the projective homography shader (see [`src/scene3d/recorder/tabletVideoProjector.ts`](./recorder/tabletVideoProjector.ts)):
   - Convert tablet UV `(0..1)` to local plane coordinates clamped to `[-innerHalfSize, +innerHalfSize]`.
   - Transform by `uTabletMatrixWorld` and `uRecordedViewProj` to obtain `vidUv = (clip.xy / clip.w) * 0.5 + 0.5`.
   - `discard` pixels outside `[0.002, 0.998]` or inside `uHudRects` so off-screen monitors retain their last crisp frame even when the viewer switches to Free-Look camera mode.
