import {
  RECORDING_FORMAT_ID,
  type SceneRecordingManifest,
  type UnpackedRecordingSession,
} from './recordingTypes'

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function updateCrc32(crc: number, chunk: Uint8Array): number {
  let c = crc >>> 0
  for (let i = 0; i < chunk.length; i++) {
    c = CRC32_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8)
  }
  return c >>> 0
}

function crc32Bytes(bytes: Uint8Array): number {
  return (updateCrc32(0xffffffff, bytes) ^ 0xffffffff) >>> 0
}

async function crc32Blob(blob: Blob): Promise<number> {
  const reader = blob.stream().getReader()
  let crc = 0xffffffff
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value && value.byteLength > 0) {
      crc = updateCrc32(crc, value)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function getDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()))
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)
  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  }
}

export interface BundleExtraAsset {
  zipPath: string
  blob: Blob
}

/**
 * Packs `recording.json`, the recorded video Blob, and any embedded shelf textures
 * into a standard PKZIP archive (.q3d) using STORE (method 0) so the video Blob
 * is concatenated by reference with zero RAM duplication.
 */
export async function packRecordingBundle(
  manifest: SceneRecordingManifest,
  videoBlob: Blob,
  extraAssets: BundleExtraAsset[] = [],
): Promise<Blob> {
  const encoder = new TextEncoder()
  const now = new Date(manifest.createdAt || Date.now())
  const { dosTime, dosDate } = getDosDateTime(now)

  const jsonBytes = encoder.encode(JSON.stringify(manifest))

  interface PreparedEntry {
    nameBytes: Uint8Array
    data: Blob | Uint8Array
    size: number
    crc: number
  }

  const entries: PreparedEntry[] = [
    {
      nameBytes: encoder.encode('recording.json'),
      data: jsonBytes,
      size: jsonBytes.byteLength,
      crc: crc32Bytes(jsonBytes),
    },
    {
      nameBytes: encoder.encode(manifest.videoFile),
      data: videoBlob,
      size: videoBlob.size,
      crc: await crc32Blob(videoBlob),
    },
  ]

  for (const asset of extraAssets) {
    entries.push({
      nameBytes: encoder.encode(asset.zipPath),
      data: asset.blob,
      size: asset.blob.size,
      crc: await crc32Blob(asset.blob),
    })
  }

  const blobParts: BlobPart[] = []
  const cdParts: Uint8Array[] = []
  let offset = 0
  let cdSize = 0

  for (const entry of entries) {
    const nameLen = entry.nameBytes.byteLength
    const localHeader = new Uint8Array(30 + nameLen)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true) // Local file header signature
    lv.setUint16(4, 20, true) // Version needed (2.0)
    lv.setUint16(6, 0x0800, true) // UTF-8 filename flag
    lv.setUint16(8, 0, true) // Compression method 0 = STORE
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, entry.crc, true)
    lv.setUint32(18, entry.size, true)
    lv.setUint32(22, entry.size, true)
    lv.setUint16(26, nameLen, true)
    lv.setUint16(28, 0, true)
    localHeader.set(entry.nameBytes, 30)

    const cdHeader = new Uint8Array(46 + nameLen)
    const cv = new DataView(cdHeader.buffer)
    cv.setUint32(0, 0x02014b50, true) // Central directory header signature
    cv.setUint16(4, 20, true) // Version made by
    cv.setUint16(6, 20, true) // Version needed
    cv.setUint16(8, 0x0800, true) // UTF-8 filename flag
    cv.setUint16(10, 0, true) // STORE
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, entry.crc, true)
    cv.setUint32(20, entry.size, true)
    cv.setUint32(24, entry.size, true)
    cv.setUint16(28, nameLen, true)
    cv.setUint16(30, 0, true) // Extra len
    cv.setUint16(32, 0, true) // Comment len
    cv.setUint16(34, 0, true) // Disk number
    cv.setUint16(36, 0, true) // Internal attrs
    cv.setUint32(38, 0, true) // External attrs
    cv.setUint32(42, offset, true) // Local header offset
    cdHeader.set(entry.nameBytes, 46)

    blobParts.push(localHeader as BlobPart)
    blobParts.push(entry.data as BlobPart)
    cdParts.push(cdHeader)

    offset += localHeader.byteLength + entry.size
    cdSize += cdHeader.byteLength
  }

  const cdOffset = offset
  for (const cd of cdParts) {
    blobParts.push(cd as BlobPart)
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // EOCD signature
  ev.setUint16(4, 0, true) // Disk number
  ev.setUint16(6, 0, true) // CD start disk
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdOffset, true)
  ev.setUint16(20, 0, true) // Comment len
  blobParts.push(eocd as BlobPart)

  return new Blob(blobParts, { type: 'application/zip' })
}

interface ZipDirectoryEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

async function extractEntryBlob(
  archive: Blob,
  entry: ZipDirectoryEntry,
  mimeType = 'application/octet-stream',
): Promise<Blob> {
  const lhBuf = await archive
    .slice(entry.localHeaderOffset, entry.localHeaderOffset + 30)
    .arrayBuffer()
  const lhView = new DataView(lhBuf)
  if (lhView.getUint32(0, true) !== 0x04034b50) {
    throw new Error(`Ungültiger ZIP-Eintrag: ${entry.name}`)
  }
  const fileNameLen = lhView.getUint16(26, true)
  const extraLen = lhView.getUint16(28, true)
  const dataStart = entry.localHeaderOffset + 30 + fileNameLen + extraLen
  const rawSlice = archive.slice(
    dataStart,
    dataStart + entry.compressedSize,
    mimeType,
  )

  if (entry.compressionMethod === 0) {
    return rawSlice
  }
  if (
    entry.compressionMethod === 8 &&
    typeof DecompressionStream !== 'undefined'
  ) {
    const decompressedStream = rawSlice
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
    const buf = await new Response(decompressedStream).arrayBuffer()
    return new Blob([buf], { type: mimeType })
  }
  throw new Error(
    `Nicht unterstützte ZIP-Kompression (${entry.compressionMethod}) für ${entry.name}`,
  )
}

/**
 * Unpacks a `.q3d` / `.zip` recording bundle with zero-copy slicing for the video track.
 */
export async function unpackRecordingBundle(
  archive: Blob,
): Promise<UnpackedRecordingSession> {
  const tailSize = Math.min(archive.size, 65557)
  const tailOffset = archive.size - tailSize
  const tailBuf = await archive.slice(tailOffset, archive.size).arrayBuffer()
  const tailView = new DataView(tailBuf)

  let eocdPos = -1
  for (let i = tailSize - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === 0x06054b50) {
      eocdPos = i
      break
    }
  }
  if (eocdPos < 0) {
    throw new Error('Ungültige Aufnahmedatei (ZIP Central Directory fehlt).')
  }

  const totalEntries = tailView.getUint16(eocdPos + 10, true)
  const cdSize = tailView.getUint32(eocdPos + 12, true)
  const cdOffset = tailView.getUint32(eocdPos + 16, true)

  const cdBuf = await archive.slice(cdOffset, cdOffset + cdSize).arrayBuffer()
  const cdView = new DataView(cdBuf)
  const cdBytes = new Uint8Array(cdBuf)
  const decoder = new TextDecoder('utf-8')

  const entries = new Map<string, ZipDirectoryEntry>()
  let ptr = 0
  for (let i = 0; i < totalEntries && ptr + 46 <= cdBuf.byteLength; i++) {
    if (cdView.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error('Beschädigter ZIP Central Directory Header.')
    }
    const compressionMethod = cdView.getUint16(ptr + 10, true)
    const compressedSize = cdView.getUint32(ptr + 20, true)
    const uncompressedSize = cdView.getUint32(ptr + 24, true)
    const nameLen = cdView.getUint16(ptr + 28, true)
    const extraLen = cdView.getUint16(ptr + 30, true)
    const commentLen = cdView.getUint16(ptr + 32, true)
    const localHeaderOffset = cdView.getUint32(ptr + 42, true)
    const name = decoder.decode(cdBytes.subarray(ptr + 46, ptr + 46 + nameLen))

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })

    ptr += 46 + nameLen + extraLen + commentLen
  }

  const manifestEntry = entries.get('recording.json')
  if (!manifestEntry) {
    throw new Error('Aufnahme-Manifest (recording.json) nicht gefunden.')
  }

  const manifestBlob = await extractEntryBlob(
    archive,
    manifestEntry,
    'application/json',
  )
  const manifestText = await manifestBlob.text()
  const manifest = JSON.parse(manifestText) as SceneRecordingManifest

  if (!manifest || manifest.format !== RECORDING_FORMAT_ID) {
    throw new Error('Unbekanntes Aufnahmeformat in recording.json.')
  }

  const videoEntry = entries.get(manifest.videoFile)
  if (!videoEntry) {
    throw new Error(`Videodatei (${manifest.videoFile}) fehlt im Archiv.`)
  }

  const videoBlob = await extractEntryBlob(
    archive,
    videoEntry,
    manifest.videoMimeType || 'video/webm',
  )
  const createdUrls: string[] = []
  const videoObjectUrl = URL.createObjectURL(videoBlob)
  createdUrls.push(videoObjectUrl)

  const offlineImageMap: Record<string, string> = {}
  if (manifest.shelfImageAssets) {
    for (const [origUrl, zipPath] of Object.entries(manifest.shelfImageAssets)) {
      const imgEntry = entries.get(zipPath)
      if (!imgEntry) continue
      const mime = zipPath.endsWith('.png') ? 'image/png' : 'image/webp'
      const imgBlob = await extractEntryBlob(archive, imgEntry, mime)
      const objUrl = URL.createObjectURL(imgBlob)
      createdUrls.push(objUrl)
      offlineImageMap[origUrl] = objUrl
    }
  }

  return {
    manifest,
    videoBlob,
    videoObjectUrl,
    offlineImageMap,
    bundleSizeBytes: archive.size,
    dispose: () => {
      for (const u of createdUrls) {
        URL.revokeObjectURL(u)
      }
      createdUrls.length = 0
    },
  }
}
