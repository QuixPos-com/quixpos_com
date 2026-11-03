import { Component } from 'preact'
import type { DocCategory } from '../docs/docs-data'
import { Link } from './Router'

export interface DocsSidebarProps {
  categories: DocCategory[]
  activePageId: string
  searchQuery: string
  collapsedCategories: Set<string>
  isOpen?: boolean
  onSearchChange: (query: string) => void
  onToggleCategory: (catId: string) => void
  onSelectPage?: () => void
}

export class DocsSidebar extends Component<DocsSidebarProps> {
  handleInput = (e: Event) => {
    const value = (e.target as HTMLInputElement).value
    this.props.onSearchChange(value)
  }

  render() {
    const {
      categories,
      activePageId,
      searchQuery,
      collapsedCategories,
      isOpen,
      onToggleCategory,
      onSelectPage,
    } = this.props

    const cleanQuery = searchQuery.toLowerCase().trim()
    let hasAnyMatches = false

    return (
      <aside id="docs-sidebar" class={`docs-sidebar ${isOpen ? 'open' : ''}`}>
        <div class="docs-search-box">
          <div class="docs-search-input-wrapper">
            <span class="docs-search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              id="docs-search-input"
              class="docs-search-input"
              placeholder="Dokumentation durchsuchen..."
              value={searchQuery}
              onInput={this.handleInput}
              aria-label="Dokumentation durchsuchen"
            />
          </div>
        </div>

        <nav id="docs-tree-nav" class="docs-tree-nav" aria-label="Dokumentations-Baum">
          {categories.map((cat) => {
            const filteredPages = cat.pages.filter(
              (p) =>
                !cleanQuery ||
                p.title.toLowerCase().includes(cleanQuery) ||
                p.description.toLowerCase().includes(cleanQuery) ||
                p.markdown.toLowerCase().includes(cleanQuery),
            )

            if (cleanQuery && filteredPages.length === 0) {
              return null
            }

            hasAnyMatches = true
            const isCollapsed = collapsedCategories.has(cat.id) && !cleanQuery

            return (
              <div
                key={cat.id}
                class={`docs-category ${isCollapsed ? 'collapsed' : ''}`}
                data-cat-id={cat.id}
              >
                <button
                  type="button"
                  class="docs-category-header"
                  onClick={() => onToggleCategory(cat.id)}
                  aria-expanded={!isCollapsed}
                >
                  <div class="docs-category-title-wrap">
                    <span class="docs-category-icon" aria-hidden="true">{cat.icon}</span>
                    <span>{cat.title}</span>
                  </div>
                  <span class="docs-category-chevron" aria-hidden="true">▼</span>
                </button>

                <div class="docs-category-items">
                  {filteredPages.map((p) => {
                    const isActive = p.id === activePageId
                    return (
                      <Link
                        key={p.id}
                        href={`/docs/${p.id}`}
                        class={`docs-page-link ${isActive ? 'active' : ''}`}
                        onClick={onSelectPage}
                      >
                        <span>{p.title}</span>
                        {p.badge ? <span class="docs-link-badge">{p.badge}</span> : null}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {!hasAnyMatches && cleanQuery ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                color: 'var(--docs-text-muted, #718096)',
                fontSize: '0.88rem',
              }}
            >
              <p>
                Keine Ergebnisse für „<strong>{cleanQuery}</strong>“ gefunden.
              </p>
            </div>
          ) : null}
        </nav>

        <div class="docs-sidebar-footer">
          <a
            href="https://discord.gg/5ftjruDFJ"
            target="_blank"
            rel="noopener noreferrer"
            class="docs-sidebar-support-link"
            title="Technischer Support auf Discord"
          >
            <span class="docs-sidebar-support-icon" aria-hidden="true">💬</span>
            <div class="docs-sidebar-support-info">
              <span class="docs-sidebar-support-title">Technischer Support</span>
              <span class="docs-sidebar-support-sub">Discord Community ↗</span>
            </div>
          </a>
        </div>
      </aside>
    )
  }
}
