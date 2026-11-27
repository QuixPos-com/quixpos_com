export interface ResolvedAndroidApk {
  href: string
  file: string
  arch?: string
  builtAt?: string
}

export const FALLBACK_ANDROID_APK_FILE = 'QuixPOS-arm64-v8a-2611271304.apk'
export const FALLBACK_ANDROID_APK_URL = `https://pos.quixpos.com/${FALLBACK_ANDROID_APK_FILE}`

let cachedApkPromise: Promise<ResolvedAndroidApk> | null = null

const MANIFEST_ENDPOINTS = [
  {
    manifestUrl: '/pos-apk-manifest.json',
    baseOrigin: 'https://pos.quixpos.com',
  },
  {
    manifestUrl: 'https://pos.quixpos.com/android-apk.json',
    baseOrigin: 'https://pos.quixpos.com',
  },
  {
    manifestUrl: 'https://posdemo.quixpos.com/android-apk.json',
    baseOrigin: 'https://posdemo.quixpos.com',
  },
] as const

async function fetchManifestOnce(): Promise<ResolvedAndroidApk> {
  for (const ep of MANIFEST_ENDPOINTS) {
    try {
      const res = await fetch(ep.manifestUrl, { cache: 'no-cache' })
      if (!res.ok) continue
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('text/html')) continue
      const data = (await res.json()) as {
        file?: unknown
        url?: unknown
        arch?: unknown
        builtAt?: unknown
      }
      const file = typeof data?.file === 'string' ? data.file.trim() : ''
      const rawUrl =
        typeof data?.url === 'string' && data.url.trim()
          ? data.url.trim()
          : file
            ? `/${file}`
            : ''
      if (!file || !rawUrl || !file.toLowerCase().endsWith('.apk')) continue

      return {
        href: new URL(rawUrl, ep.baseOrigin).href,
        file,
        arch: typeof data.arch === 'string' ? data.arch : undefined,
        builtAt: typeof data.builtAt === 'string' ? data.builtAt : undefined,
      }
    } catch {
      // Try next endpoint
    }
  }

  return {
    href: FALLBACK_ANDROID_APK_URL,
    file: FALLBACK_ANDROID_APK_FILE,
  }
}

export function resolveLatestAndroidApk(): Promise<ResolvedAndroidApk> {
  if (typeof window === 'undefined') {
    return Promise.resolve({
      href: FALLBACK_ANDROID_APK_URL,
      file: FALLBACK_ANDROID_APK_FILE,
    })
  }
  if (!cachedApkPromise) {
    cachedApkPromise = fetchManifestOnce()
  }
  return cachedApkPromise
}
