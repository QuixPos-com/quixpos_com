// ─────────────────────────────────────────────────────────────────────────────
// docs-data.ts — dynamically built from src/docs/content/**
//
// Folder naming: `NN-category-id/`         (sort by numeric prefix)
// File naming:   `NN-page-id.md`           (sort by numeric prefix)
// Metadata:      `_category.json`          (id, title, icon per folder)
// Page metadata: YAML frontmatter in .md   (id, title, description, badge?)
// ─────────────────────────────────────────────────────────────────────────────

export interface DocPage {
  id: string
  title: string
  description: string
  badge?: string
  markdown: string
}

export interface DocCategory {
  id: string
  title: string
  icon: string
  pages: DocPage[]
}

// ── Vite glob imports ────────────────────────────────────────────────────────

// All markdown files: path → raw string
const mdModules = import.meta.glob<string>('./content/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

// All _category.json files: path → object
const catModules = import.meta.glob<{ id: string; title: string; icon: string }>(
  './content/**/_category.json',
  { eager: true, import: 'default' },
)

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the leading numeric prefix from a path segment like `01-foo` → 1
 * Falls back to 9999 so un-prefixed entries sort to the end.
 */
function sortKey(segment: string): number {
  const m = segment.match(/^(\d+)-/)
  return m ? parseInt(m[1], 10) : 9999
}

/**
 * Parse YAML-like frontmatter delimited by `---` lines.
 * Returns { frontmatter, body }.
 */
function parseFrontmatter(rawInput: string): {
  id: string
  title: string
  description: string
  badge?: string
  body: string
} {
  const fm: Record<string, string> = {}
  // Strip UTF-8 BOM if present (PowerShell Set-Content adds one)
  const raw = rawInput.replace(/^\uFEFF/, '')
  let body = raw

  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (match) {
    const lines = match[1].split(/\r?\n/)
    for (const line of lines) {
      const colon = line.indexOf(':')
      if (colon === -1) continue
      const key = line.slice(0, colon).trim()
      const value = line.slice(colon + 1).trim()
      fm[key] = value
    }
    body = match[2]
  }

  return {
    id: fm['id'] ?? '',
    title: fm['title'] ?? '',
    description: fm['description'] ?? '',
    badge: fm['badge'] || undefined,
    body,
  }
}

// ── Build DOC_CATEGORIES ─────────────────────────────────────────────────────

function buildCategories(): DocCategory[] {
  // Group _category.json files by folder path
  type CatEntry = { folderPath: string; meta: { id: string; title: string; icon: string } }
  const catEntries: CatEntry[] = []

  for (const [path, meta] of Object.entries(catModules)) {
    // path like: ./content/01-installation/_category.json
    const folderPath = path.replace('/_category.json', '')
    catEntries.push({ folderPath, meta })
  }

  // Sort categories by their folder numeric prefix
  catEntries.sort((a, b) => {
    const aFolder = a.folderPath.split('/').pop() ?? ''
    const bFolder = b.folderPath.split('/').pop() ?? ''
    return sortKey(aFolder) - sortKey(bFolder)
  })

  // Build pages for each category
  return catEntries.map(({ folderPath, meta }) => {
    // Collect md files belonging to this folder
    type PageEntry = { sortNum: number; page: DocPage }
    const pages: PageEntry[] = []

    for (const [mdPath, rawContent] of Object.entries(mdModules)) {
      // Skip files not in this folder
      const mdFolder = mdPath.substring(0, mdPath.lastIndexOf('/'))
      if (mdFolder !== folderPath) continue

      const filename = mdPath.split('/').pop() ?? ''
      const { id, title, description, badge, body } = parseFrontmatter(rawContent as unknown as string)

      pages.push({
        sortNum: sortKey(filename),
        page: { id, title, description, badge, markdown: body },
      })
    }

    pages.sort((a, b) => a.sortNum - b.sortNum)

    return {
      id: meta.id,
      title: meta.title,
      icon: meta.icon,
      pages: pages.map((e) => e.page),
    }
  })
}

export const DOC_CATEGORIES: DocCategory[] = buildCategories()

// ── Utility helpers (consumed by docs-app.ts) ────────────────────────────────

export function getAllPages(): DocPage[] {
  return DOC_CATEGORIES.flatMap((cat) => cat.pages)
}

export function findPageById(
  id: string,
): { page: DocPage; category: DocCategory; prev?: DocPage; next?: DocPage } | null {
  const all = getAllPages()
  const idx = all.findIndex((p) => p.id === id)
  if (idx === -1) return null

  const page = all[idx]
  const category = DOC_CATEGORIES.find((cat) => cat.pages.some((p) => p.id === id)) ?? DOC_CATEGORIES[0]

  return {
    page,
    category,
    prev: idx > 0 ? all[idx - 1] : undefined,
    next: idx < all.length - 1 ? all[idx + 1] : undefined,
  }
}
