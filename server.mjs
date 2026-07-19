// Minimal zero-dep static server for the studio SPA on Railway.
// Serves ./dist with a catch-all SPA fallback to index.html (client-side routing), on $PORT.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const DIST = join(process.cwd(), 'dist')
const PORT = process.env.PORT || 3000
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
}

async function sendFile(res, file, code = 200) {
  const data = await readFile(file)
  const ct = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
  const immutable = /\/assets\//.test(file) // Vite hashes asset filenames -> safe to cache hard
  res.writeHead(code, {
    'Content-Type': ct,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    // SAMEORIGIN (not DENY) so the studio can frame itself for responsive QA harnesses;
    // cross-site framing (clickjacking) is still blocked.
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer',
  })
  res.end(data)
}

const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const safe = normalize(p).replace(/^(\.\.[/\\])+/, '')
    const file = join(DIST, safe)
    try {
      const s = await stat(file)
      if (s.isDirectory()) throw new Error('dir')
      await sendFile(res, file)
    } catch {
      await sendFile(res, join(DIST, 'index.html')) // SPA fallback for client routes
    }
  } catch (e) {
    res.writeHead(500); res.end('server error')
  }
})

server.listen(PORT, () => console.log(`studio serving ./dist on :${PORT}`))
