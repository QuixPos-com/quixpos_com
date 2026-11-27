import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
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

    // Same-origin proxy for live POS Android APK manifest (avoids cross-origin CORS issues)
    if (url === '/pos-apk-manifest.json' || url.startsWith('/pos-apk-manifest.json?')) {
      const localManifest = path.resolve(__dirname, '../Pos420/web/public/android-apk.json')
      const upstreamReq = https.get('https://pos.quixpos.com/android-apk.json', { timeout: 4000 }, (upRes) => {
        if (upRes.statusCode === 200) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          })
          upRes.pipe(res)
          return
        }
        upRes.resume()
        if (fs.existsSync(localManifest)) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          })
          res.end(fs.readFileSync(localManifest, 'utf-8'))
        } else {
          res.statusCode = 404
          res.end('{}')
        }
      })
      upstreamReq.on('error', () => {
        if (fs.existsSync(localManifest)) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          })
          res.end(fs.readFileSync(localManifest, 'utf-8'))
        } else {
          res.statusCode = 502
          res.end('{}')
        }
      })
      return
    }

    // Proxy /api and /.well-known to the backend
    if (url === '/api' || url.startsWith('/api/') || url.startsWith('/.well-known')) {
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
        const { html, title, description, headTags } = render(url)

        let pageHtml = template.replace('<!--ssr-outlet-->', () => html)
        if (title) {
          pageHtml = pageHtml.replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
        }
        if (description) {
          pageHtml = pageHtml.replace(
            /<meta\s+name=["']description["']\s+content=["'][\s\S]*?["']\s*\/?>/i,
            `<meta name="description" content="${description}" />`,
          )
        }
        if (headTags) {
          pageHtml = pageHtml.replace(/<\/title>/i, () => `</title>\n    ${headTags}`)
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
