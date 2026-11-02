import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const serverEntry = path.join(distDir, 'server', 'entry-server.js')
const templatePath = path.join(distDir, 'index.html')

async function prerender() {
  if (!fs.existsSync(serverEntry)) {
    console.error(`[prerender] Server entry not found at: ${serverEntry}`)
    process.exit(1)
  }

  if (!fs.existsSync(templatePath)) {
    console.error(`[prerender] HTML template not found at: ${templatePath}`)
    process.exit(1)
  }

  const template = fs.readFileSync(templatePath, 'utf-8')
  const { render, getRoutes } = await import(pathToFileURL(serverEntry).href)

  const routes = typeof getRoutes === 'function' ? getRoutes() : ['/', '/docs']
  console.log(`[prerender] Prerendering ${routes.length} routes...`)

  for (const route of routes) {
    const { html, title, description } = render(route)

    let pageHtml = template.replace('<!--ssr-outlet-->', () => html)

    if (title) {
      pageHtml = pageHtml.replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    }
    if (description) {
      pageHtml = pageHtml.replace(
        /<meta\s+name=["']description["']\s+content=["'].*?["']\s*\/?>/i,
        `<meta name="description" content="${description}" />`,
      )
    }

    let filePath
    if (route === '/') {
      filePath = path.join(distDir, 'index.html')
    } else {
      const cleanRoute = route.replace(/^\/+/, '').replace(/\/+$/, '')
      filePath = path.join(distDir, cleanRoute, 'index.html')
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, pageHtml, 'utf-8')
    console.log(`[prerender] ✓ ${route} -> ${path.relative(rootDir, filePath)}`)
  }

  // Clean up server build folder
  const serverDir = path.join(distDir, 'server')
  if (fs.existsSync(serverDir)) {
    fs.rmSync(serverDir, { recursive: true, force: true })
  }

  console.log(`[prerender] Successfully prerendered ${routes.length} routes with SSR HTML!`)
}

prerender().catch((err) => {
  console.error('[prerender] Error during prerendering:', err)
  process.exit(1)
})
