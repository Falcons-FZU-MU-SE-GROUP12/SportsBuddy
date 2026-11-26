/**
 * 把「活动列表」页渲染成一张离线 HTML（Issue #7 证据用）
 * ---------------------------------------------------------------------------
 * 为什么需要它：这台机器上无头浏览器起不来（沙盒禁止 Chromium 的 IPC），
 * 截不了 PNG。这个脚本用 tools/browser-stub.mjs 在 Node 里跑真实的页面模块，
 * 把 view() 的输出 + app.css 内联成一个自包含的 HTML，双击就能在浏览器里看到
 * 390px 版式，按 F12 切 320px 也能直接验收"不横向溢出"。
 *
 * 用法：
 *   node tools/snapshot7.mjs
 *   node tools/snapshot7.mjs --out=docs/shots/issue7-list-390.html --w=390
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installBrowserStub } from './browser-stub.mjs'

installBrowserStub({ useMock: true })

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=')
    return [k, v.join('=')]
  })
)

// 默认落到仓库根目录的 docs/shots/（与 Issue #5 的截图放在一起）；
// 传了 --out 就按当前工作目录解析。
const defaultOut = fileURLToPath(new URL('../../../docs/shots/issue7-list-390.html', import.meta.url))
const out = args.out ?? defaultOut
const width = Number(args.w ?? 390)

const { api, tokenStore } = await import('../frontend/src/api/index.js')
const { store, setSession } = await import('../frontend/src/store.js')
const { create } = await import('../frontend/src/pages/activities.js')

tokenStore.set((await api.login('linhao', 'secret123')).access_token)
setSession(await api.getMe())
store.sports = await api.getSports()

const page = create({})
await page.load()
const body = page.view()
const bar = page.appBar()

const css = readFileSync(new URL('../frontend/assets/css/app.css', import.meta.url), 'utf8')
const shell = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Issue #7 活动列表 · ${width}px 静态快照</title>
<style>
${css}
/* 快照专用外壳：把页面放进一个 ${width}px 的手机框里，方便直接截图 */
.snap-stage { background: #eef1f5; min-height: 100vh; padding: 24px 12px; display: flex; justify-content: center; }
.snap-frame { width: ${width}px; max-width: 100%; background: #fff; border-radius: 22px; overflow: hidden;
  box-shadow: 0 18px 48px rgba(16, 24, 40, .18); display: flex; flex-direction: column; }
.snap-note { position: fixed; left: 12px; bottom: 12px; font: 12px/1.5 ui-monospace, Consolas, monospace;
  color: #64748b; background: rgba(255,255,255,.9); padding: 6px 10px; border-radius: 8px; }
</style>
</head>
<body>
<div class="snap-stage">
  <div class="snap-frame">
    ${bar}
    ${body}
  </div>
</div>
<div class="snap-note">Issue #7 · 活动列表 · ${width}×844 · 数据来自内置示意数据（mock）</div>
</body>
</html>
`

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, shell, 'utf8')
console.log(`已生成 ${out}（${width}px，${(shell.length / 1024).toFixed(1)} KB）`)
