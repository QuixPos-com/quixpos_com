import { Link } from './Router'

export interface SiteHeaderProps {
  currentPath?: string
}

export function SiteHeader({ currentPath = '/' }: SiteHeaderProps) {
  const isPricing = currentPath === '/preise' || currentPath === '/pricing'

  return (
    <header class="site-header">
      <Link class="logo" href="/" aria-label="QuixPOS Startseite">
        <span class="logo-mark" aria-hidden="true" />
        QuixPOS
      </Link>
      <nav class="nav" aria-label="Hauptnavigation">
        <Link
          class={`nav-link-docs${isPricing ? ' nav-link-active' : ''}`}
          href="/preise"
        >
          Preise
        </Link>
        <Link class="nav-link-docs" href="/docs">
          Dokumentation
        </Link>
        <Link class="nav-link-docs" href="/3d">
          3D
        </Link>
        <Link class="nav-link-docs" href="/account">
          Konto
        </Link>
      </nav>
    </header>
  )
}
