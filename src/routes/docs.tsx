import { Component } from 'preact'
import { DOC_CATEGORIES, findPageById, getAllPages } from '../docs/docs-data'
import { Link } from '../components/Router'
import type { RouteParams } from '../components/Router'
import { DocsSidebar } from '../components/DocsSidebar'
import { DocsArticle } from '../components/DocsArticle'
import { DocsLightbox } from '../components/DocsLightbox'

export interface DocsRouteProps {
  params?: RouteParams
  currentPath?: string
}

export interface DocsRouteState {
  searchQuery: string
  collapsedCategories: Set<string>
  isMobileSidebarOpen: boolean
  lightboxSrc: string | null
  lightboxCaption: string
}

export class DocsRoute extends Component<DocsRouteProps, DocsRouteState> {
  state: DocsRouteState = {
    searchQuery: '',
    collapsedCategories: new Set<string>(),
    isMobileSidebarOpen: false,
    lightboxSrc: null,
    lightboxCaption: '',
  }

  handleSearchChange = (query: string) => {
    this.setState({ searchQuery: query })
  }

  handleToggleCategory = (catId: string) => {
    this.setState((prev) => {
      const nextSet = new Set(prev.collapsedCategories)
      if (nextSet.has(catId)) {
        nextSet.delete(catId)
      } else {
        nextSet.add(catId)
      }
      return { collapsedCategories: nextSet }
    })
  }

  handleToggleMobileSidebar = () => {
    this.setState((prev) => ({ isMobileSidebarOpen: !prev.isMobileSidebarOpen }))
  }

  handleCloseMobileSidebar = () => {
    this.setState({ isMobileSidebarOpen: false })
  }

  handleOpenLightbox = (src: string, caption: string) => {
    this.setState({ lightboxSrc: src, lightboxCaption: caption })
  }

  handleCloseLightbox = () => {
    this.setState({ lightboxSrc: null, lightboxCaption: '' })
  }

  render() {
    const { params } = this.props
    const {
      searchQuery,
      collapsedCategories,
      isMobileSidebarOpen,
      lightboxSrc,
      lightboxCaption,
    } = this.state

    const allPages = getAllPages()
    const defaultPageId = allPages.length > 0 ? allPages[0].id : 'kassenuebersicht'
    const activePageId = params?.pageId || defaultPageId

    const match = findPageById(activePageId)

    return (
      <div id="docs-view" class="docs-view">
        <header class="docs-header">
          <div class="docs-header-left">
            <button
              id="docs-sidebar-toggle"
              class="docs-sidebar-toggle"
              aria-label="Menü öffnen"
              onClick={this.handleToggleMobileSidebar}
            >
              ☰
            </button>
            <Link class="docs-logo" href="/docs">
              <span class="logo-mark" aria-hidden="true" />
              QuixPOS
              <span class="docs-badge-sub">Docs</span>
            </Link>
          </div>
          <div class="docs-header-right">
            <a
              class="docs-header-discord"
              href="https://discord.gg/5ftjruDFJ"
              target="_blank"
              rel="noopener noreferrer"
              title="Technischer Support auf Discord"
            >
              Discord Support ↗
            </a>
            <Link class="docs-back-btn" href="/">
              ← Startseite
            </Link>
            <a
              class="docs-header-cta"
              href="https://posdemo.quixpos.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Demo POS ↗
            </a>
          </div>
        </header>

        <div class="docs-layout">
          <div
            id="docs-sidebar-backdrop"
            class={`docs-sidebar-backdrop ${isMobileSidebarOpen ? 'active' : ''}`}
            onClick={this.handleCloseMobileSidebar}
          />

          <DocsSidebar
            categories={DOC_CATEGORIES}
            activePageId={activePageId}
            searchQuery={searchQuery}
            collapsedCategories={collapsedCategories}
            isOpen={isMobileSidebarOpen}
            onSearchChange={this.handleSearchChange}
            onToggleCategory={this.handleToggleCategory}
            onSelectPage={this.handleCloseMobileSidebar}
          />

          {match ? (
            <DocsArticle
              page={match.page}
              category={match.category}
              prev={match.prev}
              next={match.next}
              onOpenLightbox={this.handleOpenLightbox}
            />
          ) : (
            <main id="docs-content-pane" class="docs-content-pane">
              <div
                class="docs-not-found"
                style={{ textAlign: 'center', padding: '4rem 1rem' }}
              >
                <h1>Seite nicht gefunden</h1>
                <p>Die angeforderte Dokumentationsseite konnte nicht gefunden werden.</p>
                <Link
                  href="/docs"
                  class="docs-back-btn"
                  style={{ display: 'inline-block', marginTop: '1.5rem' }}
                >
                  ← Zurück zur Übersicht
                </Link>
              </div>
            </main>
          )}
        </div>

        <DocsLightbox
          src={lightboxSrc}
          caption={lightboxCaption}
          onClose={this.handleCloseLightbox}
        />
      </div>
    )
  }
}

export default DocsRoute
