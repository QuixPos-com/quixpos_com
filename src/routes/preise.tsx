import { Link } from '../components/Router'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import '../pricing.css'

function CheckIcon() {
  return (
    <span class="matrix-check-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4.5 10.5 8.5 14.5 15.5 6.5" />
      </svg>
    </span>
  )
}

export function PreiseRoute() {
  return (
    <div class="pricing-page">
      <div class="atmosphere" aria-hidden="true" />

      <SiteHeader />

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

      <SiteFooter />
    </div>
  )
}

export default PreiseRoute
