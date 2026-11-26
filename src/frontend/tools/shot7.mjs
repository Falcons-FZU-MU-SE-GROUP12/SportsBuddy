/**
 * 给 Issue #7 活动列表截运行图（真实后端 ?mock=0）
 * ---------------------------------------------------------------------------
 * 在 shot5.mjs 的 CDP 基础上加了 --eval：页面渲染完成后先执行一段 JS（比如点筛选
 * 芯片），再等 1.2 秒、再截图。这样"筛选组合""空态"这类需要交互的画面也能留证据。
 *
 * 用法示例：
 *   node tools/shot7.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/activities" `
 *     --out="../docs/shots/issue7-list-390.png" --w=390 --h=844
 *   node tools/shot7.mjs --url="..." --out="..." --w=390 --h=844 `
 *     --eval="document.querySelector('[data-name=\"sport\"][data-value=\"羽毛球\"]').click()"
 *
 * 注意：必须在"普通桌面环境"跑（沙盒禁止 Chromium 的 mojo IPC，无头浏览器起不来）。
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { dirname } from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=')
    return [k, v.join('=')]
  })
)

const url = args.url
const out = args.out ?? 'shot7.png'
const width = Number(args.w ?? 390)
const height = Number(args.h ?? 844)
const scale = Number(args.scale ?? 2)
const token = args.token ?? ''
const selector = args.selector ?? '.sm-main'
const evalAfter = args.eval ?? ''

if (!url) {
  console.error('缺少 --url')
  process.exit(2)
}

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9300 + Math.floor(Math.random() * 200)
const profileDir = `${process.env.TEMP ?? '.'}\\edge-shot7-${PORT}`

const edge = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: 'ignore', detached: true }
)
edge.unref()

let ws
function connect(urlWs) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(urlWs)
    const timer = setTimeout(() => reject(new Error('连接 CDP 超时')), 15000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error(`连接 CDP 失败：${urlWs}`))
    })
  })
}

function client(socket) {
  let seq = 0
  const pending = new Map()
  const events = []
  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(`${msg.error.message}`))
      else resolve(msg.result)
    } else if (msg.method) {
      events.push(msg)
    }
  })
  return { send(method, params = {}) {
    const id = ++seq
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }, events }
}

async function waitForPort() {
  for (let i = 0; i < 200; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return await res.json()
    } catch { /* 还没起来 */ }
    await sleep(150)
  }
  throw new Error('浏览器端口始终没打开')
}

async function evaluate(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text ?? '页面脚本报错')
  return res.result.value
}

async function main() {
  await waitForPort()
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  ).json()
  ws = await connect(target.webSocketDebuggerUrl)
  const cdp = client(ws)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: width < 600,
  })

  await cdp.send('Page.navigate', { url: new URL('/frontend/', url).href })
  await sleep(1500)
  if (token) {
    await evaluate(cdp, `localStorage.setItem('sportmate.token', ${JSON.stringify(token)})`)
  }

  await cdp.send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await cdp.send('Page.navigate', { url })
  await sleep(1500)

  let ok = false
  for (let i = 0; i < 40; i += 1) {
    ok = await evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)
    if (ok) break
    await sleep(500)
  }
  if (!ok) console.error(`警告：等不到元素 ${selector}，仍然截图`)
  await sleep(800)

  if (evalAfter) {
    await evaluate(cdp, evalAfter)
    await sleep(1500)
  }

  const info = await evaluate(
    cdp,
    `JSON.stringify({
       title: document.title,
       text: (document.body.innerText || '').slice(0, 500),
       mock: document.documentElement.dataset.mock ?? null,
       scrollW: document.documentElement.scrollWidth,
       innerW: window.innerWidth,
       api: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes(':8000')).slice(-8)
     })`
  )

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))

  const errors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.text ?? '')
    .filter(Boolean)

  console.log(`已保存 ${out}`)
  console.log(`页面信息 ${info}`)
  if (errors.length) console.error(`页面异常：${errors.join(' | ')}`)
}

try {
  await main()
} catch (err) {
  console.error(`截图失败：${err.message}`)
  process.exitCode = 1
} finally {
  try { ws?.close() } catch { /* ignore */ }
  edge.kill()
}
