/**
 * 零依赖静态服务器
 * ---------------------------------------------------------------------------
 * 用来把 frontend/ 和 prototype/ 跑起来。
 * 之所以需要它：浏览器出于安全策略，禁止用 file:// 直接加载 ES Module，
 * 所以本项目的 `<script type="module">` 必须经由 http:// 提供。
 *
 * 用法：
 *   node tools/server.mjs                        # 默认 5178 端口，根目录 = 项目根
 *   node tools/server.mjs 8080                   # 换端口
 *   node tools/server.mjs --prefix=/SportsBuddy  # 挂在子路径下（模拟 GitHub Pages）
 *
 * 为什么要有 --prefix：
 *   上传到 GitHub 后本工程在 src/frontend/，GitHub Pages 会把页面放在
 *   https://<user>.github.io/<repo>/ 这种**子路径**下。用这个参数就能在本机
 *   一模一样地复现，"本机没问题、上线 404"这类问题可以提前发现。
 */
import { createServer } from 'node:http'
import { createReadStream, statSync, existsSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || process.env.PORT || 5178)
/** 挂载前缀，例如 '/SportsBuddy'。默认空（挂在根）。 */
const PREFIX = (
  process.argv.slice(2).find((a) => a.startsWith('--prefix='))?.slice('--prefix='.length) || ''
).replace(/\/+$/, '')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mmd': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** 把 URL 安全地映射到 ROOT 下的真实文件路径，越界一律拒绝。 */
function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  const p = normalize(join(ROOT, decoded))
  if (p !== ROOT && !p.startsWith(ROOT + sep)) return null
  return p
}

const server = createServer((req, res) => {
  let url = req.url || '/'

  // 子路径挂载：/SportsBuddy/prototype/x → /prototype/x
  if (PREFIX) {
    if (url === PREFIX) {
      res.writeHead(302, { Location: `${PREFIX}/` }).end()
      return
    }
    if (!url.startsWith(`${PREFIX}/`)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<meta charset="utf-8"><body style="font-family:system-ui;padding:40px">
         <h1>404</h1><p>本站挂在子路径 <code>${PREFIX}/</code> 下。</p>
         <p>请访问：<a href="${PREFIX}/frontend/">${PREFIX}/frontend/</a></p></body>`
      )
      return
    }
    url = url.slice(PREFIX.length)
  }

  let target = safeResolve(url)
  if (!target) {
    res.writeHead(403).end('403 Forbidden')
    return
  }
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = join(target, 'index.html')
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      `<meta charset="utf-8"><body style="font-family:system-ui;padding:40px">
       <h1>404</h1><p>找不到 <code>${req.url}</code></p>
       <p>可用入口：<a href="${PREFIX}/frontend/">${PREFIX}/frontend/</a> ·
          <a href="${PREFIX}/prototype/">${PREFIX}/prototype/</a> ·
          <a href="${PREFIX}/docs/diagrams/class-diagram.html">类图</a></p></body>`
    )
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  createReadStream(target).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${PORT}${PREFIX}`
  // ⚠️ 这里全部是【相对路径拼接】。
  // 因为本工程上传到 GitHub 后会位于 src/frontend/，GitHub Pages 的地址是
  //     https://<user>.github.io/<repo>/
  // 也就是页面活在**子路径**下。工程内部所有链接都写成相对路径，
  // 所以换目录、换域名、挂子路径都不用改代码。
  // 要本机复现子路径：node tools/server.mjs --prefix=/SportsBuddy
  console.log('[SportsBuddy] 静态服务已启动')
  console.log(`  挂载前缀  ${PREFIX || '(根目录)'}`)
  console.log(`  应用      ${base}/frontend/`)
  console.log(`  原型      ${base}/prototype/`)
  console.log(`  类图      ${base}/docs/diagrams/class-diagram.html`)
  console.log('')
  console.log('  上传到仓库后本工程在 src/frontend/，此时把服务起在仓库根目录，')
  console.log('  访问地址相应变成（相对路径会自动适配，无需改代码）：')
  console.log(`    ${base}/src/frontend/frontend/`)
  console.log(`    ${base}/src/frontend/prototype/`)
  console.log('')
  console.log(`  根目录    ${ROOT}`)
})
