import { Component, createRef } from 'preact'
import type { DocCategory, DocPage } from '../docs/docs-data'
import { renderMarkdown } from '../docs/markdown-renderer'
import { Link } from './Router'

export interface DocsArticleProps {
  page: DocPage
  category: DocCategory
  prev?: DocPage
  next?: DocPage
  onOpenLightbox: (src: string, caption: string) => void
}

export interface DocsArticleState {
  preferredDevice: 'phone' | 'tab-small' | 'tab-big'
  preferredOrientation: 'landscape' | 'portrait'
}

export class DocsArticle extends Component<DocsArticleProps, DocsArticleState> {
  private containerRef = createRef<HTMLDivElement>()

  state: DocsArticleState = {
    preferredDevice: 'tab-big',
    preferredOrientation: 'landscape',
  }

  componentDidMount() {
    this.updateAllFigures()
  }

  componentDidUpdate(prevProps: DocsArticleProps, prevState: DocsArticleState) {
    if (prevProps.page.id !== this.props.page.id) {
      this.updateAllFigures()
    } else if (
      prevState.preferredDevice !== this.state.preferredDevice ||
      prevState.preferredOrientation !== this.state.preferredOrientation
    ) {
      this.updateAllFigures()
    }
  }


  private updateAllFigures() {
    if (!this.containerRef.current) return

    const figures = this.containerRef.current.querySelectorAll<HTMLElement>('[data-figure-container]')
    const { preferredDevice, preferredOrientation } = this.state

    figures.forEach((fig) => {
      const imgName = fig.getAttribute('data-image-name')
      if (!imgName || imgName.startsWith('.')) return

      const imgEl = fig.querySelector<HTMLImageElement>('.docs-img')
      const imgWrapper = fig.querySelector<HTMLElement>('.docs-img-wrapper')
      const devBtns = fig.querySelectorAll<HTMLButtonElement>('[data-device-btn]')
      const orientBtns = fig.querySelectorAll<HTMLButtonElement>('[data-orient-btn]')

      const folder = `${preferredDevice}-${preferredOrientation}`
      const targetSrc = `/docs/images/${folder}/${imgName}`

      fig.classList.toggle('is-portrait', preferredOrientation === 'portrait')
      fig.classList.toggle('is-landscape', preferredOrientation === 'landscape')

      if (imgEl && imgEl.getAttribute('src') !== targetSrc) {
        imgEl.style.opacity = '0.6'
        imgEl.src = targetSrc
        imgEl.onload = () => {
          imgEl.style.opacity = '1'
        }
      }
      if (imgWrapper) {
        imgWrapper.setAttribute('data-lightbox-src', targetSrc)
      }

      devBtns.forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-device-btn') === preferredDevice)
      })
      orientBtns.forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-orient-btn') === preferredOrientation)
      })
    })
  }

  handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target) return

    // Device switch button
    const devBtn = target.closest<HTMLButtonElement>('[data-device-btn]')
    if (devBtn) {
      e.preventDefault()
      e.stopPropagation()
      const device = devBtn.getAttribute('data-device-btn') as 'phone' | 'tab-small' | 'tab-big' | null
      if (device && device !== this.state.preferredDevice) {
        this.setState({ preferredDevice: device })
      }
      return
    }

    // Orientation switch button
    const orientBtn = target.closest<HTMLButtonElement>('[data-orient-btn]')
    if (orientBtn) {
      e.preventDefault()
      e.stopPropagation()
      const orient = orientBtn.getAttribute('data-orient-btn') as 'landscape' | 'portrait' | null
      if (orient && orient !== this.state.preferredOrientation) {
        this.setState({ preferredOrientation: orient })
      }
      return
    }

    // Lightbox image click
    const lightboxTrigger = target.closest<HTMLElement>('[data-lightbox-src]')
    if (lightboxTrigger) {
      e.preventDefault()
      const src = lightboxTrigger.getAttribute('data-lightbox-src')
      const caption = lightboxTrigger.getAttribute('data-caption') || ''
      if (src) {
        this.props.onOpenLightbox(src, caption)
      }
      return
    }
  }

  render() {
    const { page, category, prev, next } = this.props
    const { html } = renderMarkdown(page.markdown)

    return (
      <main id="docs-content-pane" class="docs-content-pane" ref={this.containerRef} onClick={this.handleClick}>
        <div class="docs-breadcrumbs">
          <Link href="/">QuixPOS</Link>
          <span class="docs-crumb-sep">/</span>
          <Link href="/docs">Dokumentation</Link>
          <span class="docs-crumb-sep">/</span>
          <span>{category.title}</span>
          <span class="docs-crumb-sep">/</span>
          <span class="docs-crumb-current">{page.title}</span>
        </div>

        <article class="docs-article" dangerouslySetInnerHTML={{ __html: html }} />

        <div class="docs-support-card">
          <div class="docs-support-card-icon" aria-hidden="true">💬</div>
          <div class="docs-support-card-text">
            <h3>Technischer Support & Fragen</h3>
            <p>
              Benötigst du Unterstützung bei der Einrichtung oder hast du technische Fragen? Unser Team und die Community helfen dir gerne im Discord weiter.
            </p>
          </div>
          <a
            href="https://discord.gg/5ftjruDFJ"
            target="_blank"
            rel="noopener noreferrer"
            class="docs-support-card-btn"
          >
            Discord beitreten ↗
          </a>
        </div>

        <div class="docs-pagination">
          {prev ? (
            <Link href={`/docs/${prev.id}`} class="docs-page-card prev">
              <span class="docs-page-card-dir">← Vorheriges Thema</span>
              <span class="docs-page-card-title">{prev.title}</span>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link href={`/docs/${next.id}`} class="docs-page-card next">
              <span class="docs-page-card-dir">Nächstes Thema →</span>
              <span class="docs-page-card-title">{next.title}</span>
            </Link>
          ) : null}
        </div>
      </main>
    )
  }
}
