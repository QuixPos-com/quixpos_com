import { Component } from 'preact'

export interface DocsLightboxProps {
  src: string | null
  caption: string
  onClose: () => void
}

export class DocsLightbox extends Component<DocsLightboxProps> {
  componentDidMount() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown)
    }
  }

  componentWillUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown)
      document.body.style.overflow = ''
    }
  }

  componentDidUpdate(prevProps: DocsLightboxProps) {
    if (typeof window !== 'undefined') {
      if (this.props.src && !prevProps.src) {
        document.body.style.overflow = 'hidden'
      } else if (!this.props.src && prevProps.src) {
        document.body.style.overflow = ''
      }
    }
  }

  handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.props.src) {
      this.props.onClose()
    }
  }

  handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      this.props.onClose()
    }
  }

  render() {
    const { src, caption, onClose } = this.props
    if (!src) return null

    return (
      <div
        class="docs-lightbox active"
        aria-hidden="false"
        role="dialog"
        onClick={this.handleBackdropClick}
      >
        <button
          type="button"
          class="docs-lightbox-close"
          aria-label="Schließen"
          onClick={onClose}
        >
          ×
        </button>
        <div class="docs-lightbox-content">
          <img class="docs-lightbox-img" src={src} alt={caption || 'Vollbildansicht'} />
          {caption ? <p class="docs-lightbox-caption">{caption}</p> : null}
        </div>
      </div>
    )
  }
}
