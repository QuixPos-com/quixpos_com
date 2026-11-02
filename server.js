import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_TARGET = new URL(process.env.API_PROXY_TARGET || 'http://localhost:4300')

async function startServer() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })

  const server = http.createServer((req, res) => {
    const url = req.url || '/'

    // Proxy /api to the backend
    if (url === '/api' || url.startsWith('/api/')) {
      const proxyReq = http.request(
        {
          hostname: API_TARGET.hostname,
          port: API_TARGET.port,
          path: url,
          method: req.method,
          headers: { ...req.headers, host: API_TARGET.host },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
          proxyRes.pipe(res)
        },
      )
      proxyReq.on('error', (err) => {
        console.error('[api proxy]', err.message)
        res.statusCode = 502
        res.end(JSON.stringify({ error: 'Backend nicht erreichbar' }))
      })
      req.pipe(proxyReq)
      return
    }

    // Let Vite handle internal / assets / dependencies / static manifests
    if (
      url.startsWith('/@') ||
      url.startsWith('/src') ||
      url.startsWith('/node_modules') ||
      url.startsWith('/public') ||
      url.startsWith('/docs/images') ||
      url.startsWith('/favicon') ||
      url.startsWith('/.well-known') ||
      url === '/robots.txt' ||
      url === '/sitemap.xml' ||
      url === '/llms.txt' ||
      url === '/llms-full.txt' ||
      url === '/ai-catalog.json' ||
      (/\.[a-zA-Z0-9]+$/.test(url) && !url.endsWith('.html'))
    ) {
      vite.middlewares(req, res, () => {
        res.statusCode = 404
        res.end()
      })
      return
    }

    (async () => {
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8')
        template = await vite.transformIndexHtml(url, template)

        const { render } = await vite.ssrLoadModule('/src/entry-server.tsx')
        const { html, title, description } = render(url)

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

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(pageHtml)
      } catch (e) {
        vite.ssrFixStacktrace(e)
        console.error(e)
        res.statusCode = 500
        res.end(e.stack)
      }
    })()
  })

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5173
  server.listen(port, () => {
    console.log(`[SSR Dev Server] Running at http://localhost:${port}`)
  })
}

startServer()
