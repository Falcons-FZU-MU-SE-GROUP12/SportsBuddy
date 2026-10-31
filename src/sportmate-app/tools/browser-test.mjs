/**
 * 真实浏览器验收测试（CDP 驱动无头 Edge/Chrome）
 * ===========================================================================
 * 前面的 verify / check-frontend-bugs / test-e2e-flow 都是"在 Node 里用浏览器替身
 * 跑页面模块"，能验证逻辑，但验证不了**真浏览器里的样子**：
 *   · CSS 有没有真的生效（布局溢出、元素被裁掉）
 *   · ES Module 能不能真的加载（file:// 或路径写错就白屏）
 *   · 点击是不是真的能触发 data-action（事件委托有没有挂上）
 *   · 控制台有没有报错
 *
 * 这个脚本用 DevTools Protocol 起一个真无头浏览器，按用户路径逐页打开、
 * 断言可见文案 / 布局 / 控制台，并截图存到 out/browser-test/。
 *
 * 用法：
 *   node tools/server.mjs                  # 先起静态服务（本脚本也会自动帮你起）
 *   node tools/browser-test.mjs
 *   node tools/browser-test.mjs --base=http://127.0.0.1:5178 --shots=out/browser-test
 *
 * 注意：Chromium 系浏览器需要创建 IPC 管道，在受限沙盒里会以
 * platform_channel.cc / OpenProcess 拒绝访问 崩溃。需要用可放行的权限运行。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const BASE = arg('base', 'http://127.0.0.1:5178').replace(/\/+$/, '')
const SHOTS = resolve(ROOT, arg('shots', 'out/browser-test'))
const CDP_PORT = Number(arg('port', '9333'))
const VIEW = { width: 390, height: 844, scale: 2 } // iPhone 14 逻辑尺寸

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 找浏览器 ---------------- */

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

function findBrowser() {
  const hit = BROWSERS.find((p) => existsSync(p)) || process.env.CHROME_PATH
  if (!hit || !existsSync(hit)) throw new Error('找不到 Edge / Chrome，无法做真实浏览器测试')
  return hit
}

/* ---------------- 静态服务 ---------------- */

async function ensureServer() {
  const url = `${BASE}/frontend/index.html`
  try {
    if ((await fetch(url)).ok) return null
  } catch {
    /* 没起来，下面拉起 */
  }
  const port = new URL(BASE).port || '5178'
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'server.mjs'), port], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    await sleep(200)
    try {
      if ((await fetch(url)).ok) return proc
    } catch {
      /* 继续等 */
    }
  }
  proc.kill()
  throw new Error(`静态服务没起来：${BASE}`)
}

/* ---------------- 极简 CDP 客户端 ---------------- */

class CDP {
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', () => rej(new Error(`连不上 CDP：${wsUrl}`)), { once: true })
    })
    return new CDP(ws)
  }

  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id) {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        msg.error ? p.reject(new Error(`${msg.error.message}${msg.error.data ? ' ' + msg.error.data : ''}`)) : p.resolve(msg.result)
      } else {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params)
      }
    })
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
  }

  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  /** 在页面里求值，返回 JS 值。 */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    }
    return r.result?.value
  }
}

/* ---------------- 断言 ---------------- */

let pass = 0
const fails = []
const notes = []
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    fails.push(`${name}${detail ? `：${detail}` : ''}`)
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\x1b[90m ${detail}\x1b[0m` : ''}`)
  }
}

/* ---------------- 探测脚本（在页面里跑） ---------------- */

const PROBE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const scope = document.getElementById('app') || document.body;
  const nodes = [...scope.querySelectorAll('*')];
  const offenders = nodes
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
    })
    .slice(0, 5)
    .map((el) => {
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
        : '';
      const r = el.getBoundingClientRect();
      return el.tagName.toLowerCase() + cls + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']';
    });
  const text = (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
  return {
    hash: location.hash,
    vw,
    scrollW: de.scrollWidth,
    scrollH: de.scrollHeight,
    overflowX: de.scrollWidth - vw,
    offenders,
    appBar: (document.querySelector('.sm-appbar__title') || {}).textContent?.trim() || '',
    tabs: [...document.querySelectorAll('.sm-tab')].map((t) => t.textContent.trim()),
    actions: document.querySelectorAll('[data-action]').length,
    appHtml: document.getElementById('app')?.innerHTML.length || 0,
    text: text.slice(0, 800),
    hasTodo: /undefined|NaN|\\[object Object\\]/.test(text),
  };
})()`

/* ---------------- 主流程 ---------------- */

const started = Date.now()
let server = null
let browser = null
let cdp = null
const errors = []
let stepErrors = []

try {
  mkdirSync(SHOTS, { recursive: true })
  server = await ensureServer()
  const exe = findBrowser()
  console.log(`浏览器    ${exe}`)
  console.log(`地址      ${BASE}/frontend/`)
  console.log(`截图      ${SHOTS}\n`)

  const profile = join(SHOTS, '.profile')
  rmSync(profile, { recursive: true, force: true })
  browser = spawn(
    exe,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--mute-audio',
      '--hide-scrollbars',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=390,844',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  let target = null
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(200)
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch {
      /* 还没起来 */
    }
  }
  if (!target) throw new Error('浏览器起来了但拿不到调试目标（CDP 端口不通）')

  cdp = await CDP.connect(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: VIEW.scale,
    mobile: true,
  })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails
    stepErrors.push(`未捕获异常：${d.exception?.description ?? d.text}`)
  })
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error' && p.type !== 'warning') return
    const msg = p.args.map((a) => a.value ?? a.description ?? '').join(' ')
    stepErrors.push(`console.${p.type}：${msg}`)
  })
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level !== 'error') return
    const text = `${p.entry.text} ${p.entry.url ?? ''}`.trim()
    // 离线 mock 模式下，连接到 127.0.0.1:8000 的尝试不算页面错误
    if (/127\.0\.0\.1:8000|favicon/.test(text)) return
    stepErrors.push(`网络/日志错误：${text}`)
  })

  /** 打开一个 hash 路由，等页面稳定后返回探测结果。 */
  async function open(hash, { settle = 900 } = {}) {
    stepErrors = []
    const url = `${BASE}/frontend/${hash}`
    await cdp.send('Page.navigate', { url })
    for (let i = 0; i < 80; i++) {
      await sleep(100)
      try {
        if ((await cdp.eval('document.readyState')) === 'complete') break
      } catch {
        /* 导航中求值会失败，忽略 */
      }
    }
    await sleep(settle)
    const info = await cdp.eval(PROBE)
    info.errors = stepErrors.slice()
    if (info.errors.length) errors.push(...info.errors.map((e) => `${hash} ${e}`))
    return info
  }

  async function click(selector) {
    return cdp.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`)
  }

  async function shot(name) {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'))
  }

  /** 通用布局与运行时断言。 */
  function assertLayout(label, info) {
    const errs = info.errors ?? []
    check(`${label}：没有横向溢出（scrollWidth ${info.scrollW} ≤ 视口 ${info.vw}）`, info.overflowX <= 1, info.offenders.join(' | '))
    check(`${label}：渲染出内容（#app ${info.appHtml} 字符 / 可点元素 ${info.actions} 个）`, info.appHtml > 800 && info.actions > 0)
    check(`${label}：没有 undefined / NaN / [object Object]`, !info.hasTodo, info.text.match(/.{0,40}(undefined|NaN|\[object Object\]).{0,40}/)?.[0] ?? '')
    check(`${label}：控制台没有报错`, errs.length === 0, errs.slice(0, 2).join(' ; '))
  }

  /* ---------------- 第一段：游客能看的页面 ---------------- */
  console.log('— 第 1 段：游客视角（未登录） —')

  const discover = await open('#/discover')
  check('首页：品牌栏（SportsBuddy）在', discover.appBar === '' || discover.text.includes('SportsBuddy'), discover.appBar)
  check('首页：有「一句话找局」入口', discover.text.includes('一句话找局'))
  check('首页：游客态有「登录 / 注册」引导', discover.text.includes('登录 / 注册'))
  check('首页：底部 4 个标签', discover.tabs.length === 4, discover.tabs.join('/'))
  assertLayout('首页', discover)
  await shot('01-discover')

  // 真点一次「一句话找局」：填输入框 → 点按钮 → 看推荐结果
  await cdp.eval(`(() => {
    const input = document.querySelector('input[name="sentence"]');
    input.value = '今晚想在旗山校区打篮球，新手可以吗';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-action="match"]').click();
    return true;
  })()`)
  await sleep(1200)
  const matched = await cdp.eval(PROBE)
  check('一句话找局：点击后真的出了推荐结果', /为你找到|没有匹配的活动/.test(matched.text), matched.text.slice(0, 80))
  check('一句话找局：结果里带推荐理由（可解释）', /项目匹配|同校区|水平合适|距离/.test(matched.text), matched.text.slice(0, 120))
  assertLayout('一句话找局结果', matched)
  await shot('01b-match-result')

  const activities = await open('#/activities')
  check('活动列表：标题「活动列表」', activities.appBar === '活动列表', activities.appBar)
  check('活动列表：渲染出活动卡片（含「已报名」进度）', /已报名 \d+\/\d+/.test(activities.text), activities.text.slice(0, 80))
  check('活动列表：筛选 chip 都在（项目/状态/时间/校区/水平）', ['全部项目', '不限状态', '不限时间', '全部校区', '不限水平'].every((t) => activities.text.includes(t)))
  assertLayout('活动列表', activities)
  await shot('02-activities')

  const detail = await open('#/activity/101')
  check('活动详情：标题是活动名而不是 NaN', detail.text.includes('周三晚篮球') && !detail.text.includes('NaN'), detail.text.slice(0, 60))
  check('活动详情：显示时间地点与已报名人数', detail.text.includes('旗山校区') && detail.text.includes('已报名'))
  assertLayout('活动详情', detail)
  await shot('03-activity-detail')

  const userPage = await open('#/user/1')
  check('个人主页：能渲染他人资料（林浩）', userPage.text.includes('林浩') && !userPage.text.includes('NaN'), userPage.text.slice(0, 60))
  assertLayout('个人主页', userPage)

  const login = await open('#/login')
  check('登录页：品牌名 + 演示账号按钮', login.text.includes('SportsBuddy') && login.text.includes('演示账号'))
  assertLayout('登录页', login)
  await shot('04-login')

  const guard = await open('#/checkin/109')
  check('登录守卫：未登录访问签到页 → 跳回 #/login', guard.hash === '#/login', guard.hash)
  check('登录守卫：登录页给了「需要先登录」的提示（提示条是否真的出现）', guard.text.includes('需要先登录'), guard.text.slice(0, 70))
  await shot('04b-login-guard')

  /* ---------------- 第二段：真实点一次登录（验证 A-1） ---------------- */
  console.log('\n— 第 2 段：真实点击登录（验证 A-1 token 落盘） —')

  const clicked = await click('[data-action="demo"]')
  check('点到了「用演示账号体验」按钮', clicked)
  await sleep(1400)
  const afterLogin = await cdp.eval(PROBE)
  const token = await cdp.eval('localStorage.getItem("sportsbuddy.token")')
  check('登录后地址跳到 #/discover', afterLogin.hash === '#/discover', afterLogin.hash)
  check('登录后 localStorage 里真的有 token（A-1 修复点）', Boolean(token), String(token))
  check('登录后首页变成已登录态（信用分卡片 + 发起按钮）', afterLogin.text.includes('信用分') && afterLogin.text.includes('发起'), afterLogin.text.slice(0, 100))
  check('登录成功提示在首页可见（不会被目标页的 clearFlash 抹掉）', afterLogin.text.includes('登录成功'), afterLogin.text.slice(0, 160))
  check('登录过程控制台无报错', stepErrors.length === 0, stepErrors.join(' ; '))
  afterLogin.errors = stepErrors.slice()
  assertLayout('登录后首页', afterLogin)
  await shot('05-after-login')

  /* ---------------- 第三段：登录后的页面（验证 A-2 参数透传） ---------------- */
  console.log('\n— 第 3 段：登录后逐页（验证 A-2 路由参数） —')

  const manage = await open('#/manage')
  check('我的局：标题「我的局」', manage.appBar === '我的局', manage.appBar)
  check('我的局：两个分组都在（我发起的 / 我报名的）', manage.text.includes('我发起的') && manage.text.includes('我报名的'))
  assertLayout('我的局', manage)
  await shot('06-manage')

  const mePage = await open('#/me')
  check('我的：显示信用分', mePage.text.includes('信用分'), mePage.text.slice(0, 80))
  check('我的：显示当前用户昵称（林浩）', mePage.text.includes('林浩'))
  assertLayout('我的', mePage)
  await shot('07-me')

  const actMg = await open('#/activity-manage/107')
  check('管理活动：标题「管理活动」', actMg.appBar === '管理活动', actMg.appBar)
  check('管理活动：发起人能看到签到码', actMg.text.includes('签到码') && /\d{4}/.test(actMg.text), actMg.text.slice(0, 100))
  assertLayout('管理活动', actMg)

  const checkin = await open('#/checkin/109')
  check('签到页：标题「签到」', checkin.appBar === '签到', checkin.appBar)
  check('签到页：两种签到方式都在', checkin.text.includes('方式一') && checkin.text.includes('方式二'), checkin.text.slice(0, 80))
  assertLayout('签到页', checkin)
  await shot('08-checkin')

  const review = await open('#/review/107')
  check('评价页：标题「评价同场伙伴」', review.appBar === '评价同场伙伴', review.appBar)
  check('评价页：带出了活动名（activityId 参数透传成功）', review.text.includes('昨天那场篮球'), review.text.slice(0, 80))
  assertLayout('评价页', review)
  await shot('09-review')

  const newPage = await open('#/activity-new')
  check('发起活动：标题「发起活动」', newPage.appBar === '发起活动', newPage.appBar)
  assertLayout('发起活动', newPage)

  /* ---------------- 第四段：真实点击一次报名 ---------------- */
  console.log('\n— 第 4 段：真实点击报名（事件委托 + 状态刷新） —')

  await open('#/activity/105')
  await click('[data-action="join"]')
  await sleep(1500)
  const afterJoin = await cdp.eval(PROBE)
  check('点「报名」后有反馈（出现参与状态或成功提示）', /参与状态|已报名|报名成功|取消报名/.test(afterJoin.text), afterJoin.text.slice(0, 100))
  check('报名后控制台无报错', stepErrors.length === 0, stepErrors.join(' ; '))
  afterJoin.errors = stepErrors.slice()
  assertLayout('报名后详情页', afterJoin)
  await shot('10-after-join')

  /* ---------------- 第五段：真机尺寸下的其它入口 ---------------- */
  console.log('\n— 第 5 段：原型 / 类图入口（同一浏览器） —')

  for (const [label, path] of [
    ['移动端原型', '/prototype/mobile-prototype.html'],
    ['12 屏展板', '/prototype/screens.html'],
    ['信息架构图', '/prototype/wireframe.html'],
    ['领域类图', '/docs/diagrams/class-diagram.html'],
  ]) {
    stepErrors = []
    await cdp.send('Page.navigate', { url: `${BASE}${path}` })
    await sleep(1200)
    const info = await cdp.eval(PROBE)
    check(`${label}：能打开且不是空白页`, info.appHtml > 200 || (await cdp.eval('document.body.innerHTML.length')) > 2000)
    check(`${label}：没有横向溢出`, info.overflowX <= 1, info.offenders.join(' | '))
    check(`${label}：控制台无报错`, stepErrors.length === 0, stepErrors.slice(0, 2).join(' ; '))
    await shot(`11-${path.split('/').pop().replace('.html', '')}`)
  }

  /* ---------------- 第六段：不同屏宽的布局 ---------------- */
  console.log('\n— 第 6 段：不同屏宽的布局（320 / 768 / 1280） —')

  for (const vp of [
    { w: 320, h: 568, label: '320px 小屏' },
    { w: 768, h: 1024, label: '768px 平板' },
    { w: 1280, h: 900, label: '1280px 桌面' },
  ]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: vp.w < 560,
    })
    const info = await open('#/activities')
    check(`${vp.label}：活动列表没有横向溢出`, info.overflowX <= 1, `${info.scrollW} vs ${info.vw} ${info.offenders.join(' | ')}`)
    check(`${vp.label}：活动卡片渲染正常`, info.text.includes('周三晚篮球') && !info.hasTodo)
    if (vp.w === 1280) await shot('12-desktop-1280')
    if (vp.w === 320) await shot('13-narrow-320')
  }

  /* ---------------- 汇总 ---------------- */
  const total = pass + fails.length
  console.log('\n' + '─'.repeat(70))
  if (fails.length) {
    console.log(`\x1b[31m${fails.length} 项失败\x1b[0m / 共 ${total} 项`)
    for (const f of fails) console.log(`  · ${f}`)
    if (errors.length) {
      console.log('\n控制台/网络错误汇总：')
      for (const e of [...new Set(errors)]) console.log(`  · ${e}`)
    }
    process.exitCode = 1
  } else {
    console.log(`\x1b[32m全部通过：${total} 项真实浏览器检查\x1b[0m（耗时 ${((Date.now() - started) / 1000).toFixed(1)}s）`)
    console.log(`截图已存：${SHOTS}`)
  }
} catch (err) {
  console.error(`\x1b[31m测试失败：${err.message}\x1b[0m`)
  process.exitCode = 2
} finally {
  try {
    if (cdp) cdp.ws.close()
  } catch {
    /* ignore */
  }
  if (browser) {
    browser.kill()
    await sleep(300)
  }
  if (server) server.kill()
  rmSync(join(SHOTS, '.profile'), { recursive: true, force: true })
}
