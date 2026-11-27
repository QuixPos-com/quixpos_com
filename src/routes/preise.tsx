import { Component } from 'preact'
import {
  FALLBACK_ANDROID_APK_FILE,
  FALLBACK_ANDROID_APK_URL,
  resolveLatestAndroidApk,
} from '../apkDownload'
import { Link } from '../components/Router'
import { SiteHeader } from '../components/SiteHeader'
import '../pricing.css'

interface PreiseRouteState {
  apkUrl: string
  apkFile: string
  apkResolved: boolean
}

function CheckIcon() {
  return (
    <span class="matrix-check-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4.5 10.5 8.5 14.5 15.5 6.5" />
      </svg>
    </span>
  )
}

export class PreiseRoute extends Component<object, PreiseRouteState> {
  state: PreiseRouteState = {
    apkUrl: FALLBACK_ANDROID_APK_URL,
    apkFile: FALLBACK_ANDROID_APK_FILE,
    apkResolved: false,
  }

  private unmounted = false

  componentDidMount() {
    this.unmounted = false
    void resolveLatestAndroidApk().then((apk) => {
      if (!this.unmounted) {
        this.setState({
          apkUrl: apk.href,
          apkFile: apk.file,
          apkResolved: true,
        })
      }
    })
  }

  componentWillUnmount() {
    this.unmounted = true
  }

  render() {
    return (
      <div class="pricing-page">
        <div class="atmosphere" aria-hidden="true" />

        <SiteHeader currentPath="/preise" />

        <main class="pricing-main">
          <div class="pricing-intro">
            <p class="pricing-kicker">Editionen &amp; Konditionen</p>
            <h1 class="pricing-title">Preise</h1>
            <p class="pricing-lede">
              Drei Betriebsmodelle mit identischem Funktionsumfang – vom
              kostenlosen Einstieg bis zum Betrieb auf eigener Hardware.
            </p>
          </div>

          <section class="pricing-grid" aria-label="QuixPOS Versionen">
            <article class="pricing-card">
              <span class="pricing-tier-tag">Cloud · Geteilt</span>
              <h2 class="pricing-tier-name">Geteilte Cloud-Instanz</h2>
              <div class="pricing-price-block">
                <span class="pricing-amount">0 €</span>
                <span class="pricing-period">Kostenlos</span>
              </div>
              <p class="pricing-desc">
                Sofort startklar auf unserer geteilten Cloud-Infrastruktur zum
                Kennenlernen und für den schnellen Einstieg.
              </p>
            </article>

            <article class="pricing-card pricing-card-featured">
              <span class="pricing-tier-tag">Cloud · Dediziert</span>
              <h2 class="pricing-tier-name">Eigene Cloud-Instanz</h2>
              <div class="pricing-price-block">
                <span class="pricing-amount">9,90 €</span>
                <span class="pricing-period">/ Monat</span>
              </div>
              <p class="pricing-desc">
                Eigene isolierte Cloud-Instanz mit fest reservierten
                Compute-Ressourcen und planbaren Updates.
              </p>
            </article>

            <article class="pricing-card">
              <span class="pricing-tier-tag">Selbst gehostet</span>
              <h2 class="pricing-tier-name">On-Premise</h2>
              <div class="pricing-price-block">
                <span class="pricing-amount">99 €</span>
                <span class="pricing-period">+ 1 Jahr Updates</span>
              </div>
              <p class="pricing-desc">
                Installation auf AWS t3.small, Raspberry oder Windows Service.
              </p>
            </article>
          </section>

          <section class="pricing-matrix-section" aria-labelledby="matrix-heading">
            <h2 class="pricing-matrix-heading" id="matrix-heading">
              Versionsvergleich
            </h2>
            <div class="pricing-matrix-wrap">
              <table class="pricing-matrix">
                <thead>
                  <tr>
                    <th scope="col">Merkmal</th>
                    <th scope="col">Geteilte Cloud-Instanz</th>
                    <th scope="col" class="col-featured">Eigene Cloud-Instanz</th>
                    <th scope="col">On-Premise</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">
                      <span class="matrix-row-label">Features</span>
                      <span class="matrix-row-sub">Voller Funktionsumfang ohne Einschränkungen</span>
                    </th>
                    <td>
                      <span class="matrix-check-badge">
                        <CheckIcon />
                        <span>Alle</span>
                      </span>
                    </td>
                    <td class="col-featured">
                      <span class="matrix-check-badge">
                        <CheckIcon />
                        <span>Alle</span>
                      </span>
                    </td>
                    <td>
                      <span class="matrix-check-badge">
                        <CheckIcon />
                        <span>Alle</span>
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <span class="matrix-row-label">Compute-Ressourcen</span>
                    </th>
                    <td>
                      <span class="matrix-value">Geteilt</span>
                    </td>
                    <td class="col-featured">
                      <span class="matrix-value">Fest reserviert</span>
                    </td>
                    <td>
                      <span class="matrix-value">Eigenleistung</span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <span class="matrix-row-label">Updateintervalle</span>
                    </th>
                    <td>
                      <span class="matrix-value">Festgelegt</span>
                    </td>
                    <td class="col-featured">
                      <span class="matrix-value">Planbar</span>
                    </td>
                    <td>
                      <span class="matrix-value">Planbar</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="pricing-actions">
              <p>
                <strong>Direkt ausprobieren?</strong> Starte kostenlos mit einer
                Test-Instanz oder öffne die Live-Demo im Browser.
              </p>
              <div class="cta-group">
                <Link class="btn btn-primary" href="/account">
                  Kostenlos starten
                  <span class="btn-arrow" aria-hidden="true">→</span>
                </Link>
                <a
                  class="btn btn-secondary"
                  href="https://posdemo.quixpos.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Demo POS
                  <span class="btn-arrow" aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer class="site-footer">
          <p><span class="logo-inline">QuixPOS</span> · Kassensystem</p>
          <p class="footer-links">
            <a
              class="footer-apk-link"
              href={this.state.apkUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`QuixPOS Android APK herunterladen (${this.state.apkFile})`}
              title={`QuixPOS Android APK herunterladen (${this.state.apkFile})`}
              onClick={async (e) => {
                if (!this.state.apkResolved) {
                  e.preventDefault()
                  const apk = await resolveLatestAndroidApk()
                  if (!this.unmounted) {
                    this.setState({
                      apkUrl: apk.href,
                      apkFile: apk.file,
                      apkResolved: true,
                    })
                  }
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
      </div>
    )
  }
}

export default PreiseRoute
