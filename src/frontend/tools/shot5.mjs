/**
 * 用无头 Edge + CDP 给真实运行的前端截图（Issue #5 证据用）
 * ---------------------------------------------------------------------------
 * 用法：
 *   node tools/shot5.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/user/1" \
 *        --out=docs/shots/issue5-user-390.png --w=390 --h=844
 *
 * 可选：--token=<登录 token>  （会先写 localStorage.sportmate.token 再打开页面，用于 #/me）
 *       --selector=".sm-stat__num"  （等这个元素出现再截，默认等 app 有内容）
 *       --scale=2  （设备像素比，默认 2，手机截图更清晰）
 *
 * 脚本只做三件事：起浏览器、等页面渲染完、截一张图。不依赖任何 npm 包。
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
const out = args.out ?? 'shot.png'
const width = Number(args.w ?? 390)
const height = Number(args.h ?? 844)
const scale = Number(args.scale ?? 2)
const token = args.token ?? ''
const selector = args.selector ?? '.sm-main'

if (!url) {
  console.error('缺少 --url')
  process.exit(2)
}

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9300 + Math.floor(Math.random() * 200)
const profileDir = `${process.env.TEMP ?? '.'}\\edge-shot-${PORT}`

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

/** 极简 CDP 客户端。 */
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
  return {
    send(method, params = {}) {
      const id = ++seq
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    events,
  }
}

async function waitForPort() {
  for (let i = 0; i < 200; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return await res.json()
    } catch {
      /* 还没起来 */
    }
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

  // 先落在同源页面上，才能写 localStorage
  await cdp.send('Page.navigate', { url: new URL('/frontend/', url).href })
  await sleep(1500)
  if (token) {
    await evaluate(cdp, `localStorage.setItem('sportmate.token', ${JSON.stringify(token)})`)
  }

  // 中间过一页 about:blank，保证目标 URL（含 hash）是"全新加载"，
  // 而不是同一文档里只改 hash 的 hashchange
  await cdp.send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await cdp.send('Page.navigate', { url })
  await sleep(1500)

  // 等页面真正渲染出内容（最多 20 秒）
  let ok = false
  for (let i = 0; i < 40; i += 1) {
    ok = await evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)
    if (ok) break
    await sleep(500)
  }
  if (!ok) console.error(`警告：等不到元素 ${selector}，仍然截图`)
  await sleep(800)

  const info = await evaluate(
    cdp,
    `JSON.stringify({
       title: document.title,
       text: (document.body.innerText || '').slice(0, 400),
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
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  edge.kill()
}

