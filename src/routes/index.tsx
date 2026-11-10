import { Component } from 'preact'
import { Link } from '../components/Router'

const INFOGRAPHICS = [
  {
    src: '/infographics/01-pos-physical-setup.svg',
    alt: 'Physischer Aufbau eines QuixPOS-Kassenplatzes',
  },
  {
    src: '/infographics/02-software-architecture.svg',
    alt: 'Software-Architektur von QuixPOS',
  },
]

export class IndexRoute extends Component<object, { zoom: number | null }> {
  state = { zoom: null as number | null }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.setState({ zoom: null })
  }

  componentDidUpdate(_: object, prev: { zoom: number | null }) {
    if (typeof document === 'undefined' || prev.zoom === this.state.zoom) return
    const open = this.state.zoom !== null
    const wasOpen = prev.zoom !== null
    if (open === wasOpen) return
    const body = document.body.style
    if (open) {
      // Compensate the vanishing scrollbar so the page underneath doesn't shift.
      const bar = window.innerWidth - document.documentElement.clientWidth
      body.paddingRight = bar > 0 ? `${bar}px` : ''
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.documentElement.style.overflow = ''
      body.paddingRight = ''
    }
  }

  private observer: IntersectionObserver | null = null

  componentDidMount() {
    window.addEventListener('keydown', this.onKeyDown)
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return
    }

    const targets = document.querySelectorAll<HTMLElement>(
      '.basics .section-inner, .next .section-inner, .site-footer',
    )
    targets.forEach((el) => el.classList.add('reveal'))

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            this.observer?.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    )

    targets.forEach((el) => this.observer?.observe(el))
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.onKeyDown)
    document.documentElement.style.overflow = ''
    document.body.style.paddingRight = ''
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }

  render() {
    return (
      <div class="landing-container">
        <div class="atmosphere" aria-hidden="true" />

        <header class="site-header">
          <Link class="logo" href="/" aria-label="QuixPOS Startseite">
            <span class="logo-mark" aria-hidden="true" />
            QuixPOS
          </Link>
          <nav class="nav">
            <Link class="nav-link-docs" href="/docs">
              Dokumentation
            </Link>
            <Link class="nav-link-docs" href="/account">
              Konto
            </Link>
          </nav>
        </header>

        <main>
          <section class="hero" aria-labelledby="brand">
            <div class="hero-copy">
              <p class="brand" id="brand">QuixPOS</p>
              <h1 class="headline">Kasse. Klar. Schnell.</h1>
              <p class="lede">
                Das Kassensystem für den Alltag im Laden - verkaufen am Tresen,
                Artikel pflegen, ohne Ballast.
              </p>
              <div class="cta-group">
                <a class="btn btn-primary" href="https://posdemo.quixpos.com" target="_blank" rel="noopener noreferrer">
                  Demo
                  <span class="btn-arrow" aria-hidden="true">→</span>
                </a>
                <Link class="btn btn-secondary" href="/docs">
                  Dokumentation
                  <span class="btn-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            <div class="hero-visual" aria-hidden="true">
              <div class="pos-stage">
                <div class="pos-glow" />
                <div class="pos-device">
                  <div class="pos-bezel">
                    <div class="pos-screen">
                      <div class="pos-topbar">
                        <span>Kasse 1</span>
                        <span class="pos-time">14:32</span>
                      </div>
                      <div class="pos-ticket">
                        <div class="pos-line">
                          <span>Espresso</span><span>2,80 €</span>
                        </div>
                        <div class="pos-line">
                          <span>Croissant</span><span>3,20 €</span>
                        </div>
                        <div class="pos-line">
                          <span>Orangensaft</span><span>3,50 €</span>
                        </div>
                        <div class="pos-total">
                          <span>Summe</span><span>9,50 €</span>
                        </div>
                      </div>
                      <div class="pos-keys">
                        <div class="pos-actions">
                          <span class="pos-key">Beleg Parken</span>
                          <span class="pos-key">Rabatt</span>
                          <span class="pos-key pos-key-danger">Stornieren</span>
                        </div>
                        <div class="pos-pay">
                          <span class="pos-key pos-key-pay">Bar</span>
                          <span class="pos-key pos-key-pay">Karte</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="pos-stand" />
                </div>
              </div>
            </div>
          </section>

          <section class="section basics" id="grundlagen">
            <div class="section-inner">
              <h2>Was QuixPOS ist</h2>
              <p>
                QuixPOS ist ein KassenSichV-konformes Kassensystem mit TSE. 
                Erhältlich als Android-App oder im Browser als Web Anwendung. 
                Am POS kassierst du, in der Artikelverwaltung pflegst du dein
                Sortiment, ohne Installation. Unterstützt werden USB- und SD-TSE
                sowie die Kartenterminals SumUp Air, Lite und Solo oder O.P.I.-kompatible Terminals.
              </p>
              <ul class="basics-list">
                <li>
                  <strong>Verkauf am Tresen</strong>
                  Bonieren, Summen, Belege - die Kasse bleibt übersichtlich.
                </li>
                <li>
                  <strong>Artikelstamm</strong>
                  Preise und Produkte zentral pflegen, auch für den Einstieg
                  kostenlos.
                </li>
                <li>
                  <strong>Sofort startklar</strong>
                  Demo ausprobieren oder direkt mit dem eigenen Shop beginnen.
                </li>
              </ul>
              <div class="infographics">
                {INFOGRAPHICS.map((img, i) => (
                  <button
                    type="button"
                    class="infographic-btn"
                    aria-label={`${img.alt} vergrößern`}
                    onClick={() => this.setState({ zoom: i })}
                  >
                    <img src={img.src} alt={img.alt} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section class="section next" id="naechste-schritte">
            <div class="section-inner">
              <h2>Wohin als Nächstes?</h2>
              <p class="section-lede">
                Sie können hier auch das Zusammenspiel zwischen
                Artikelverwaltung und Kasse testen.
              </p>

              <div class="paths">
                <a class="path" href="https://posdemo.quixpos.com" target="_blank" rel="noopener noreferrer">
                  <span class="path-kicker">posdemo.quixpos.com</span>
                  <span class="path-title">Demo POS</span>
                  <span class="path-text">
                    Eine nutzbare Kassendemonstration im kleinen Maßstab - so
                    fühlt sich QuixPOS am Tresen an.
                  </span>
                  <span class="path-cta">Demo starten →</span>
                </a>

                <a class="path path-alt" href="https://dashdemo.quixpos.com" target="_blank" rel="noopener noreferrer">
                  <span class="path-kicker">dashdemo.quixpos.com</span>
                  <span class="path-title">Demo Artikelverwaltung</span>
                  <span class="path-text">
                    Sortiment und Preise verwalten - für einfache Shops kostenlos
                    nutzbar.
                  </span>
                  <span class="path-cta">Dashboard öffnen →</span>
                </a>
              </div>
            </div>
          </section>
        </main>

        {this.state.zoom !== null && (
          <div
            class="lightbox"
            role="dialog"
            aria-modal="true"
            onClick={() => this.setState({ zoom: null })}
          >
            <button
              type="button"
              class="lightbox-close"
              aria-label="Schließen"
              onClick={() => this.setState({ zoom: null })}
            >
              ×
            </button>
            <img
              src={INFOGRAPHICS[this.state.zoom].src}
              alt={INFOGRAPHICS[this.state.zoom].alt}
            />
          </div>
        )}

        <footer class="site-footer">
          <p><span class="logo-inline">QuixPOS</span> · Kassensystem</p>
          <p class="footer-links">
            <Link href="/privacypolicy">Datenschutzerklärung</Link>
            <Link href="/terms">Nutzungsbedingungen</Link>
          </p>
        </footer>
      </div>
    )
  }
}

export default IndexRoute
