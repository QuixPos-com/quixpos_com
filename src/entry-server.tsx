import renderToString from 'preact-render-to-string'
import { App } from './components/App'
import { getAllPages, findPageById } from './docs/docs-data'

const SITE_URL = 'https://quixpos.com'

export interface SocialImageMeta {
  url: string
  type?: string
  width?: number
  height?: number
  alt?: string
}

export interface RenderResult {
  html: string
  title: string
  description: string
  headTags?: string
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildSocialMetaTags(opts: {
  url: string
  title: string
  description: string
  image: SocialImageMeta
}): string {
  const { url, title, description, image } = opts
  const tags: string[] = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="QuixPOS" />`,
    `<meta property="og:locale" content="de_DE" />`,
    `<meta property="og:url" content="${escapeHtmlAttr(url)}" />`,
    `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`,
    `<meta property="og:description" content="${escapeHtmlAttr(description)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(image.url)}" />`,
  ]

  if (image.type) {
    tags.push(`<meta property="og:image:type" content="${escapeHtmlAttr(image.type)}" />`)
  }
  if (image.width) {
    tags.push(`<meta property="og:image:width" content="${image.width}" />`)
  }
  if (image.height) {
    tags.push(`<meta property="og:image:height" content="${image.height}" />`)
  }
  if (image.alt) {
    tags.push(`<meta property="og:image:alt" content="${escapeHtmlAttr(image.alt)}" />`)
  }

  tags.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtmlAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlAttr(image.url)}" />`,
  )

  if (image.alt) {
    tags.push(`<meta name="twitter:image:alt" content="${escapeHtmlAttr(image.alt)}" />`)
  }

  return tags.join('\n    ')
}

export function getRoutes(): string[] {
  const pages = getAllPages()
  const routes = ['/', '/docs', '/3d', '/account', '/oauth/authorize', '/privacypolicy', '/terms']
  for (const p of pages) {
    routes.push(`/docs/${p.id}`)
  }
  return routes
}

export function render(url: string): RenderResult {
  const rawPath = url.split('?')[0].split('#')[0] || '/'
  const cleanUrl = rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '')
  const html = renderToString(<App url={cleanUrl} />)

  let title = 'QuixPOS - Kassensystem für den Laden'
  let description =
    'QuixPOS - das deutsche Kassensystem für den Ladenalltag. Demo am POS testen oder Artikel kostenlos verwalten.'
  let socialImage: SocialImageMeta | undefined

  if (cleanUrl === '/oauth/authorize') {
    title = 'Anmelden – QuixPOS OAuth'
    description = 'Melde dich mit deinem QuixPOS-Profil auf deiner Instanz an.'
  } else if (cleanUrl === '/3d') {
    title = '3D Demo – QuixPOS'
    description =
      'QuixPOS 3D-Arbeitsplatz mit interaktiven Tablets für POS Demo, Artikelverwaltung und SumUp Virtual Solo.'
    socialImage = {
      url: `${SITE_URL}/3dpic.jpg`,
      type: 'image/jpeg',
      width: 1024,
      height: 572,
      alt: '3D Showroom QuixPOS Kasse',
    }
  } else if (cleanUrl === '/privacypolicy') {
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

  const headTags = socialImage
    ? buildSocialMetaTags({
        url: `${SITE_URL}${cleanUrl === '/' ? '/' : cleanUrl}`,
        title,
        description,
        image: socialImage,
      })
    : undefined

  return { html, title, description, headTags }
}
