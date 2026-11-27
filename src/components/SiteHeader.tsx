import { Link } from './Router'

export function SiteHeader() {
  return (
    <header class="site-header">
      <Link class="logo" href="/" aria-label="QuixPOS Startseite">
        <span class="logo-mark" aria-hidden="true" />
        QuixPOS
      </Link>
      <nav class="nav" aria-label="Hauptnavigation">
        <Link class="nav-link-docs" href="/preise">
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
