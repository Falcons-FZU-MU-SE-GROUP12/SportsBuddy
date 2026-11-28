/**
 * 真实后端 E2E（Issue #17 第一条验收：covers login to review）
 * ---------------------------------------------------------------------------
 * 全程走浏览器 UI，接真实 FastAPI（?mock=0），覆盖：
 *   登录 → 找局列表 → 活动详情 → 报名 → 签到 → （发起人考勤）→ 评价同场伙伴
 *
 * 只有两处不走 UI，且都是有意的：
 *   1. 造数据（注册 3 个账号、建 1 场活动、让 bob 先报名、取签到码）走 HTTP API，
 *      属于"测试数据准备"，不是被测路径；
 *   2. 发起人「记录考勤」由 API 触发 —— 它属于另一个角色（发起人）的操作，
 *      在后端已由 test_flow.py 覆盖；本脚本要证明的是参与者这一条 UI 主链路。
 *
 * 用法（仓库根目录，先起好后端 :8000 与静态服务 :5178）：
 *   node src/frontend/tools/e2e.mjs --out=docs/e2e
 *
 * 退出码 0 = 全部步骤通过；1 = 有步骤失败。
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { join as pjoin } from 'node:path'

const API = process.env.E2E_API ?? 'http://127.0.0.1:8000'
const WEB = process.env.E2E_WEB ?? 'http://127.0.0.1:5178/frontend/'
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? 'docs/e2e'
const WIDTH = 390
const HEIGHT = 844
const SCALE = 2
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

mkdirSync(OUT, { recursive: true })

const results = []
const logLines = []
function log(line) {
  console.log(line)
  logLines.push(line)
}
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —  ${detail}` : ''}`)
}

/* ------------------------------------------------------------------------ */
/* HTTP：造数据 + 结果核对                                                    */
/* ------------------------------------------------------------------------ */
async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed }
}

const stamp = String(Date.now()).slice(-6)
const PWD = 'secret123'

async function register(name) {
  const r = await api('POST', '/auth/register', {
    body: { username: name, password: PWD, nickname: `${name}-昵称`, skill_level: 'beginner' },
  })
  if (r.status !== 201) throw new Error(`注册 ${name} 失败：${r.status} ${JSON.stringify(r.body)}`)
  const token = r.body.access_token
  const me = await api('GET', '/me', { token })
  return { name, token, id: me.body.id }
}

/* ------------------------------------------------------------------------ */
/* CDP 底座（沿用 tools/shot7.mjs 的写法）                                     */
/* ------------------------------------------------------------------------ */
const PORT = 9400 + Math.floor(Math.random() * 200)
const profileDir = `${process.env.TEMP ?? '.'}\\edge-e2e-${PORT}`
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
      if (msg.error) reject(new Error(msg.error.message))
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
  for (let i = 0; i < 240; i += 1) {
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
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text ?? '页面脚本报错')
  return res.result.value
}

async function waitFor(cdp, expression, label, timeoutMs = 25000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate(cdp, expression)) return true
    await sleep(300)
  }
  throw new Error(`等待超时：${label}`)
}

/** 与 waitFor 相同，但超时不抛错，返回 false —— 用于"预期可能失败的断言"。 */
async function waitForBool(cdp, expression, timeoutMs = 12000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate(cdp, expression)) return true
    await sleep(300)
  }
  return false
}

/** 从 CDP 事件里取某个 URL 片段的状态码（最近一次）。 */
function statusOf(cdp, needle) {
  const hits = cdp.events
    .filter((e) => e.method === 'Network.responseReceived' && e.params.response.url.includes(needle))
    .map((e) => e.params.response.status)
  return hits.length ? hits[hits.length - 1] : null
}

async function shot(cdp, name) {
  const png = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = pjoin(OUT, name)
  writeFileSync(file, Buffer.from(png.data, 'base64'))
  log(`  截图 ${file}`)
  return file
}

async function goto(cdp, hash) {
  await evaluate(cdp, `location.hash = ${JSON.stringify(hash)}`)
  await sleep(600)
}

/* ------------------------------------------------------------------------ */
/* 主流程                                                                    */
/* ------------------------------------------------------------------------ */
async function main() {
  log(`E2E 开始  ${new Date().toISOString()}`)
  log(`后端 ${API}   前端 ${WEB}   输出 ${OUT}`)

  /* ---- 阶段 0：造数据 ---- */
  const org = await register(`e2e_org_${stamp}`)
  const alice = await register(`e2e_alice_${stamp}`)
  const bob = await register(`e2e_bob_${stamp}`)
  log(`账号：${org.name}(id=${org.id}) / ${alice.name}(id=${alice.id}) / ${bob.name}(id=${bob.id})`)

  // 时间窗口：留 90 秒给 UI 走完报名+签到，随后活动自然结束（才允许考勤与评价）
  const t0 = Date.now()
  const startTime = new Date(t0 + 90 * 1000).toISOString()
  const endTime = new Date(t0 + 150 * 1000).toISOString()
  const created = await api('POST', '/activities', {
    token: org.token,
    body: {
      title: `E2E 羽毛球局 ${stamp}`,
      sport: '羽毛球',
      campus: '旗山校区',
      location: '风雨操场 3 号场',
      latitude: 26.0565,
      longitude: 119.1966,
      start_time: startTime,
      end_time: endTime,
      capacity: 2,
    },
  })
  if (created.status !== 201) throw new Error(`建活动失败：${created.status} ${JSON.stringify(created.body)}`)
  const aid = created.body.id
  log(`活动 id=${aid}  ${startTime} → ${endTime}  容量 2`)

  const bobJoin = await api('POST', `/activities/${aid}/join`, { token: bob.token })
  if (bobJoin.status !== 201) throw new Error(`bob 报名失败：${bobJoin.status} ${JSON.stringify(bobJoin.body)}`)
  log(`bob 已先报名（占 1 个名额），剩 1 个给 alice`)

  const orgDetail = await api('GET', `/activities/${aid}`, { token: org.token })
  const code = orgDetail.body.checkin_code
  if (!code) throw new Error('发起人拿不到签到码')
  log(`签到码 ${code}`)

  /* ---- 启动浏览器 ---- */
  await waitForPort()
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  ).json()
  ws = await connect(target.webSocketDebuggerUrl)
  const cdp = client(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: SCALE,
    mobile: true,
  })

  /* ---- 步骤 1：打开登录页 ---- */
  await cdp.send('Page.navigate', { url: `${WEB}?mock=0#/login` })
  await waitFor(cdp, `Boolean(document.querySelector('input[name=username]'))`, '登录表单渲染')
  await sleep(500)
  await shot(cdp, '01-login-form.png')
  record('登录页渲染', true, '输入框与登录按钮可见')

  /* ---- 步骤 2：真实登录（不走演示账号按钮）---- */
  await evaluate(
    cdp,
    `(() => {
      const u = document.querySelector('input[name=username]')
      const p = document.querySelector('input[name=password]')
      u.value = ${JSON.stringify(alice.name)}
      u.dispatchEvent(new Event('input', { bubbles: true }))
      p.value = ${JSON.stringify(PWD)}
      p.dispatchEvent(new Event('input', { bubbles: true }))
      return [u.value, p.value]
    })()`
  )
  await evaluate(cdp, `document.querySelector('form[data-action="submit"]').requestSubmit()`)
  const loggedIn = await waitForBool(cdp, `location.hash.includes('discover')`, 14000)
  let tokenFallback = false
  if (loggedIn) {
    await sleep(900)
    await shot(cdp, '02-login-success.png')
    const tokenSaved = await evaluate(cdp, `Boolean(localStorage.getItem('sportmate.token'))`)
    record(
      'UI 登录（真实后端 POST /auth/login）',
      tokenSaved,
      tokenSaved ? '登录成功并持久化 token' : '登录成功但未持久化 token'
    )
  } else {
    // 当前代码在这里必然失败：/auth/login 200 拿到 token，但前端未写入 localStorage，
    // 紧接着 GET /me 401 → 页面显示「请先登录」。记为阻断性缺陷，然后用预置 token 续跑。
    const loginStatus = statusOf(cdp, '/auth/login')
    const meStatus = statusOf(cdp, '/me')
    const bodyText = await evaluate(cdp, `(document.body.innerText || '').slice(0, 200)`)
    await shot(cdp, '02-DEF03-login-blocked.png')
    record(
      'UI 登录（真实后端 POST /auth/login）',
      false,
      `DEF-03 阻断：POST /auth/login=${loginStatus}，随后 GET /me=${meStatus}，页面提示「请先登录」`
    )
    log(`  页面片段：${String(bodyText).replace(/\n/g, ' / ')}`)
    await evaluate(cdp, `localStorage.setItem('sportmate.token', ${JSON.stringify(alice.token)})`)
    // 只改 hash 不会重跑 bootstrap，必须整页重载才能走 restoreSession()
    await cdp.send('Page.navigate', { url: 'about:blank' })
    await sleep(400)
    await cdp.send('Page.navigate', { url: `${WEB}?mock=0#/discover` })
    await waitFor(cdp, `Boolean(document.querySelector('.sm-main'))`, '回退后找局页渲染')
    await sleep(900)
    await shot(cdp, '02b-login-token-fallback.png')
    const restored = await evaluate(cdp, `Boolean(localStorage.getItem('sportmate.token'))`)
    if (!restored) throw new Error('回退失败：token 未写入')
    tokenFallback = true
    log('  已用预置 token 续跑后续步骤（登录 UI 本身仍为失败，未计入通过）')
  }

  /* ---- 步骤 3：活动列表 ---- */
  await goto(cdp, '#/activities')
  await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(stamp)})`, '列表出现该活动')
  await sleep(700)
  await shot(cdp, '03-activities.png')
  record('找局列表加载', true, 'GET /activities 渲染出刚建的活动')

  /* ---- 步骤 4：点进详情（点自己那张卡，不依赖排序）---- */
  const clicked = await evaluate(
    cdp,
    `(() => {
      const cards = [...document.querySelectorAll('[data-action="open-activity"]')]
      const card = cards.find((el) => el.innerText.includes(${JSON.stringify(stamp)}))
      if (!card) return 'not-found'
      card.click()
      return 'ok'
    })()`
  )
  if (clicked !== 'ok') throw new Error('列表里找不到本轮新建的活动卡片')
  await waitFor(cdp, `location.hash.includes('/activity/')`, '进入详情页')
  await sleep(800)
  await shot(cdp, '04-detail-open.png')
  record('列表 → 详情跳转', true, `#/activity/${aid}`)

  /* ---- 步骤 5：报名 ---- */
  await waitFor(cdp, `Boolean(document.querySelector('[data-action="open-join"]:not([disabled])'))`, '报名按钮可用')
  await evaluate(cdp, `document.querySelector('[data-action="open-join"]').click()`)
  await waitFor(cdp, `Boolean(document.querySelector('form[data-action="do-join"]'))`, '报名浮层弹出')
  await sleep(400)
  await shot(cdp, '05-join-sheet.png')
  await evaluate(cdp, `document.querySelector('form[data-action="do-join"]').requestSubmit()`)
  await waitFor(cdp, `document.body.innerText.includes('已报名')`, '报名成功回显')
  await sleep(700)
  await shot(cdp, '06-joined.png')
  const afterJoin = await api('GET', `/activities/${aid}`, { token: alice.token })
  const aliceReg = (afterJoin.body.participants ?? []).find((p) => p.user_id === alice.id)
  record(
    'UI 报名（POST /join）',
    afterJoin.body.joined_count === 2 && aliceReg?.status === 'registered',
    `joined=${afterJoin.body.joined_count}/${afterJoin.body.capacity}, alice=${aliceReg?.status}`
  )

  /* ---- 步骤 6：签到 ---- */
  await waitFor(cdp, `Boolean(document.querySelector('[data-action="open-checkin"]'))`, '去签到按钮出现')
  await evaluate(cdp, `document.querySelector('[data-action="open-checkin"]').click()`)
  await waitFor(cdp, `Boolean(document.querySelector('form[data-action="do-checkin"]'))`, '签到浮层弹出')
  await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector('form[data-action="do-checkin"] input[name=code]')
      el.value = ${JSON.stringify(code)}
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return el.value
    })()`
  )
  await sleep(300)
  await shot(cdp, '07-checkin-sheet.png')
  await evaluate(cdp, `document.querySelector('form[data-action="do-checkin"]').requestSubmit()`)
  await sleep(1200)
  await shot(cdp, '08-checked-in.png')
  const afterCheckin = await api('GET', `/activities/${aid}`, { token: alice.token })
  const aliceAfterCheckin = (afterCheckin.body.participants ?? []).find((p) => p.user_id === alice.id)
  record(
    'UI 签到（POST /checkin，签到码）',
    aliceAfterCheckin?.status === 'checked_in',
    `alice=${aliceAfterCheckin?.status}, method=${aliceAfterCheckin?.checkin_method}`
  )

  /* ---- 步骤 7：等活动自然结束，发起人记录考勤 ---- */
  const waitMs = t0 + 150 * 1000 + 12 * 1000 - Date.now()
  if (waitMs > 0) {
    log(`等待活动结束（${Math.round(waitMs / 1000)}s）…`)
    await sleep(waitMs)
  }
  const att = await api('POST', `/activities/${aid}/attendance`, {
    token: org.token,
    body: [alice.id, bob.id], // 该接口的请求体就是裸数组，不是 {attended_ids: [...]}
  })
  if (att.status !== 200) throw new Error(`考勤失败：${att.status} ${JSON.stringify(att.body)}`)
  log(`发起人考勤：alice / bob 均记为到场 ${JSON.stringify(att.body)}`)

  /* ---- 步骤 8：刷新详情，出现"评价同场伙伴" ---- */
  await cdp.send('Page.reload')
  await waitFor(cdp, `Boolean(document.querySelector('.sm-main'))`, '详情页重新渲染')
  await sleep(1000)
  await shot(cdp, '09-detail-finished.png')
  const reviewBtn = await evaluate(
    cdp,
    `Boolean(document.querySelector('[data-action="go-review"]'))`
  )
  record('结束后详情出现「评价同场伙伴」', reviewBtn, reviewBtn ? '按钮可见（状态 finished + attended）' : '按钮缺失')
  if (!reviewBtn) throw new Error('评价入口没出现，后续步骤无法继续')

  await evaluate(cdp, `document.querySelector('[data-action="go-review"]').click()`)
  await waitFor(cdp, `location.hash.includes('/review/')`, '进入评价页')
  await waitFor(cdp, `Boolean(document.querySelector('form[data-action="submit"]'))`, '评价表单渲染')
  await sleep(700)
  await shot(cdp, '10-review-page.png')
  record('详情 → 评价页跳转', true, `#/review/${aid}`)

  /* ---- 步骤 9：打分 + 标签 + 提交 ---- */
  await evaluate(
    cdp,
    `document.querySelector('[data-action="star"][data-score="5"]').click()`
  )
  await sleep(200)
  await evaluate(cdp, `document.querySelector('[data-action="tag"]').click()`)
  await sleep(200)
  await evaluate(cdp, `document.querySelector('form[data-action="submit"]').requestSubmit()`)
  await waitFor(cdp, `document.body.innerText.includes('已评价')`, '提交成功回显')
  await sleep(700)
  await shot(cdp, '11-review-submitted.png')

  const received = await api('GET', `/users/${bob.id}/reviews`)
  const list = Array.isArray(received.body) ? received.body : []
  record(
    'UI 提交评价（POST /reviews）',
    list.length >= 1,
    `bob 收到 ${list.length} 条评价` + (list[0] ? `，分数 ${list[0].score}` : '')
  )

  /* ---- 汇总 ---- */
  const failed = results.filter((r) => !r.ok)
  log('')
  log(`合计 ${results.length} 步：通过 ${results.length - failed.length}，失败 ${failed.length}`)
  const pageErrors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.text ?? '')
    .filter(Boolean)
  if (pageErrors.length) log(`页面异常：${pageErrors.join(' | ')}`)

  writeFileSync(
    pjoin(OUT, 'e2e-summary.json'),
    JSON.stringify(
      { when: new Date().toISOString(), api: API, web: WEB, tokenFallbackUsed: tokenFallback, steps: results },
      null,
      2
    )
  )
  return failed.length === 0
}

let ok = false
try {
  ok = await main()
} catch (err) {
  log(`E2E 中断：${err.message}`)
  record('E2E 流程完整性', false, err.message)
} finally {
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  edge.kill()
  writeFileSync(pjoin(OUT, 'e2e-console.log'), logLines.join('\n') + '\n')
  process.exitCode = ok ? 0 : 1
}
