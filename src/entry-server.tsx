import renderToString from 'preact-render-to-string'
import { App } from './components/App'
import { getAllPages, findPageById } from './docs/docs-data'

export interface RenderResult {
  html: string
  title: string
  description: string
}

export function getRoutes(): string[] {
  const pages = getAllPages()
  const routes = ['/', '/docs', '/account', '/privacypolicy', '/terms']
  for (const p of pages) {
    routes.push(`/docs/${p.id}`)
  }
  return routes
}

export function render(url: string): RenderResult {
  const cleanUrl = url.split('?')[0].split('#')[0] || '/'
  const html = renderToString(<App url={cleanUrl} />)

  let title = 'QuixPOS - Kassensystem für den Laden'
  let description =
    'QuixPOS - das deutsche Kassensystem für den Ladenalltag. Demo am POS testen oder Artikel kostenlos verwalten.'

  if (cleanUrl === '/privacypolicy') {
    title = 'Datenschutzerklärung – QuixPOS'
    description = 'Datenschutzerklärung für die QuixPOS-Website und kostenlose Test-Instanzen.'
  } else if (cleanUrl === '/terms') {
    title = 'Nutzungsbedingungen – QuixPOS'
    description = 'Nutzungsbedingungen für die kostenlosen QuixPOS-Test-Instanzen.'
  } else if (cleanUrl.startsWith('/docs')) {
    const parts = cleanUrl.replace(/^\/docs\/?/, '').split('/')
    const pageId = parts[0]
    if (pageId) {
      const match = findPageById(pageId)
      if (match) {
        title = `${match.page.title} – QuixPOS Dokumentation`
        if (match.page.description) {
          description = match.page.description
        }
      }
    } else {
      title = 'Dokumentation – QuixPOS'
    }
  }

  return { html, title, description }
}
