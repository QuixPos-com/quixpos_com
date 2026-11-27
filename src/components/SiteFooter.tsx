import { useEffect, useState } from 'preact/hooks'
import {
  FALLBACK_ANDROID_APK_FILE,
  FALLBACK_ANDROID_APK_URL,
  resolveLatestAndroidApk,
} from '../apkDownload'
import { Link } from './Router'

export function SiteFooter() {
  const [apkUrl, setApkUrl] = useState(FALLBACK_ANDROID_APK_URL)
  const [apkFile, setApkFile] = useState(FALLBACK_ANDROID_APK_FILE)
  const [apkResolved, setApkResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void resolveLatestAndroidApk().then((apk) => {
      if (!cancelled) {
        setApkUrl(apk.href)
        setApkFile(apk.file)
        setApkResolved(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <footer class="site-footer">
      <p><span class="logo-inline">QuixPOS</span> · Kassensystem</p>
      <p class="footer-links">
        <a
          class="footer-apk-link"
          href={apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`QuixPOS Android APK herunterladen (${apkFile})`}
          title={`QuixPOS Android APK herunterladen (${apkFile})`}
          onClick={async (e) => {
            if (!apkResolved) {
              e.preventDefault()
              const apk = await resolveLatestAndroidApk()
              setApkUrl(apk.href)
              setApkFile(apk.file)
              setApkResolved(true)
              window.location.href = apk.href
            }
          }}
        >
          <svg
            class="footer-android-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.463 11.463 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
          </svg>
        </a>
        <Link href="/privacypolicy">Datenschutzerklärung</Link>
        <Link href="/terms">Nutzungsbedingungen</Link>
      </p>
    </footer>
  )
}
