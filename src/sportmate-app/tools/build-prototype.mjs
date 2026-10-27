/**
 * 原型生成器
 * ---------------------------------------------------------------------------
 * 生成 prototype/ 下的展示页。核心思路是"复用真实前端代码"：
 *   每个原型框 = 一个真实的页面模块（pages/*.js）+ 离线 mock 数据，
 *   调用页面自己的 view() 渲染、自己的 actions 处理点击。
 * 因此原型不是"另画一张图"，而是**可点、可交互、与实现同源**的界面。
 *
 * 产物：
 *   prototype/screens.html    12 个画面并排 + 可点击交互
 *   prototype/index.html      入口（含 19 个接口 × 页面覆盖表）
 *
 * 用法：node tools/build-prototype.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = resolve(ROOT, 'prototype')

/* ===================================================================== */
/* 1. 画面清单（每个画面 = 一个页面模块 + 参数 + 标注）                   */
/*    prep 只描述"用什么身份、看哪条数据"，实际准备逻辑统一在下方         */
/*    prepare() 里顺序执行，保证互不干扰。                                */
/* ===================================================================== */

const SCREENS = [
  {
    id: 'login',
    no: 'P-01',
    title: '登录 / 注册',
    desc: '未登录入口，含演示账号',
    api: 'POST /auth/login · /auth/register',
    params: {},
    guest: true,
  },
  {
    id: 'discover',
    no: 'P-02',
    title: '找局（首页）',
    desc: '一句话找局 + 推荐理由',
    api: 'GET /match/parse · /match · /activities',
    params: {},
    demoMatch: '今晚想在旗山校区打篮球，新手可以吗',
  },
  {
    id: 'activities',
    no: 'P-03',
    title: '活动列表',
    desc: '按项目 / 状态 / 时间筛选',
    api: 'GET /activities',
    params: {},
  },
  {
    id: 'activity',
    no: 'P-04',
    title: '活动详情（参与者）',
    desc: '报名 / 退报 / 签到入口',
    api: 'GET /activities/{id} · POST /join',
    params: { id: '101' },
  },
  {
    id: 'activity-organizer',
    no: 'P-05',
    title: '活动详情（发起人）',
    desc: '签到码 + 考勤入口',
    api: 'GET /activities/{id}（发起人可见 checkin_code）',
    module: 'activity',
    params: { id: '103' },
    asUser: 2,
  },
  {
    id: 'activity-new',
    no: 'P-06',
    title: '发起活动',
    desc: '表单校验 + 时间转 UTC',
    api: 'GET /sports · POST /activities',
    params: {},
    tweak: 'new-beginner',
  },
  {
    id: 'checkin',
    no: 'P-07',
    title: '签到',
    desc: '签到码 / 定位两种方式',
    api: 'POST /activities/{id}/checkin',
    params: { id: '101' },
  },
  {
    id: 'activity-manage',
    no: 'P-08',
    title: '管理活动',
    desc: '签到码 + 记录考勤',
    api: 'POST /activities/{id}/attendance',
    params: { id: '103' },
    asUser: 2,
  },
  {
    id: 'manage',
    no: 'P-09',
    title: '我的局',
    desc: '我发起的 / 我报名的',
    api: 'GET /activities/mine',
    params: {},
  },
  {
    id: 'me',
    no: 'P-10',
    title: '我的',
    desc: '信用分 + 评价汇总',
    api: 'GET /me · /users/{id}/reviews',
    params: {},
  },
  {
    id: 'user',
    no: 'P-11',
    title: '个人主页（他人）',
    desc: '信用分、评价分布、印象标签',
    api: 'GET /users/{id} · /users/{id}/reviews',
    params: { id: '3' },
  },
  {
    id: 'review',
    no: 'P-12',
    title: '评价同场伙伴',
    desc: '星级 + 印象标签',
    api: 'POST /activities/{id}/reviews',
    params: { activityId: '107' },
    tweak: 'review-stars',
  },
]

/* ===================================================================== */
/* 2. 页面标题/说明通用数据                                              */
/* ===================================================================== */

const API_COVERAGE = [
  ['POST', '/auth/register', 'P-01 注册表单'],
  ['POST', '/auth/login', 'P-01 登录'],
  ['POST', '/auth/logout', 'P-10 我的 · 退出登录'],
  ['GET', '/me', 'P-10 我的（信用分卡片）'],
  ['PATCH', '/me', 'P-10 编辑资料'],
  ['GET', '/sports', 'P-06 发起活动的项目下拉'],
  ['GET', '/health', '启动预热（不占画面）'],
  ['GET', '/users/{id}', 'P-11 个人主页'],
  ['GET', '/users/{id}/reviews', 'P-11 评价列表与分布'],
  ['POST', '/activities', 'P-06 发布活动'],
  ['GET', '/activities', 'P-03 活动列表（含筛选）'],
  ['GET', '/activities/mine', 'P-09 我的局'],
  ['GET', '/activities/{id}', 'P-04 / P-05 详情的两种视角'],
  ['PATCH', '/activities/{id}', 'P-06 编辑模式（同页复用）'],
  ['POST', '/activities/{id}/cancel', 'P-05 发起人取消活动'],
  ['POST', '/activities/{id}/join', 'P-04 报名的二次确认弹层'],
  ['DELETE', '/activities/{id}/join', 'P-04 取消报名（临期提醒）'],
  ['POST', '/activities/{id}/checkin', 'P-07 签到码 / 定位'],
  ['POST', '/activities/{id}/attendance', 'P-08 记录考勤'],
  ['POST', '/activities/{id}/reviews', 'P-12 评价'],
  ['GET', '/match', 'P-02 按条件匹配'],
  ['GET', '/match/parse', 'P-02 一句话找局'],
]

/* ===================================================================== */
/* 3. 生成 screens.html                                                  */
/* ===================================================================== */

function head(title, extraCss = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="stylesheet" href="../frontend/assets/css/app.css" />
<link rel="stylesheet" href="./css/gallery.css" />
${extraCss}
</head>`
}

function nav(current) {
  const items = [
    ['./index.html', '原型总览'],
    ['./mobile-prototype.html', '移动端原型（可跳转）'],
    ['./screens.html', '12 屏展板'],
    ['./wireframe.html', '页面结构与跳转'],
    ['../docs/diagrams/class-diagram.html', '类图'],
  ]
  return `<nav class="smp-nav">${items
    .map(
      ([href, label]) =>
        `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`
    )
    .join('')}</nav>`
}

function screenFrame(s) {
  return `<section class="smp-phone" id="frame-${s.id}" data-frame="${s.id}">
  <header class="smp-phone__cap">
    <span class="smp-phone__no">${s.no.replace('P-', '')}</span>
    <span>
      <span class="smp-phone__title">${s.title}</span>
      <span class="smp-phone__desc" style="display:block;margin:0">${s.desc}</span>
    </span>
    <span class="smp-phone__api">${s.api}</span>
  </header>
  <div class="smp-phone__body" data-mount="${s.id}">
    <div class="sm-main"><div class="sm-skel" style="height:120px"></div></div>
  </div>
</section>`
}

/** 生成 screens.html 的模块脚本 */
function screensScript() {
  const meta = SCREENS.map((s) => ({
    id: s.id,
    module: s.module ?? s.id,
    params: s.params,
    guest: Boolean(s.guest),
    asUser: s.asUser ?? null,
    demoMatch: s.demoMatch ?? null,
    tweak: s.tweak ?? null,
  }))

  return `
import { api, tokenStore } from '../frontend/src/api/index.js'
import { resetMock } from '../frontend/src/api/mock.js'
import { loadSports, setSession, store } from '../frontend/src/store.js'

const SCREENS = ${JSON.stringify(meta, null, 2)}

/* 每个画面一个独立实例：自己的状态、自己的渲染 */
const instances = new Map()

/** 构造一个 action ctx（与 frontend/src/shared/ui.js 里给页面处理函数的上下文一致） */
function makeCtx(inst, el, data = {}, form = {}) {
  return {
    data: { ...data },
    form: { ...form },
    el,
    root: inst.root,
    rerender: () => paint(inst),
  }
}

function paint(inst) {
  const { page, root } = inst
  const bar = page.appBar ? page.appBar() : ''
  root.innerHTML = bar + page.view() + (inst.layers || []).join('')
}

async function signIn(userId = 1) {
  const res = await api.login(
    userId === 1 ? 'linhao' : 'wangyan',
    'secret123'
  )
  tokenStore.set(res.access_token)
  setSession(await api.getMe())
}

/** 页面里"换页"的动作：在原型里改为跳到对应画面并高亮 */
const ROUTE_ACTIONS = {
  'open-activity': 'activity',
  'go-activities': 'activities',
  'go-checkin': 'checkin',
  'go-review': 'review',
  'go-new': 'activity-new',
  'go-manage': 'activity-manage',
  'view-user': 'user',
  'go-login': 'login',
  'go-discover': 'discover',
  'go-list': 'activities',
  'go-my-page': 'me',
}

function note(text) {
  const el = document.getElementById('log')
  el.textContent = text
  clearTimeout(note._t)
  note._t = setTimeout(() => { el.textContent = '等待操作…' }, 5000)
}

function jumpTo(id) {
  const target = document.getElementById('frame-' + id)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.style.transition = 'box-shadow .4s'
  target.style.boxShadow = '0 0 0 3px #ff6a3d, 0 10px 30px rgba(255,106,61,.28)'
  setTimeout(() => { target.style.boxShadow = '' }, 1500)
}

/* ---------------- 事件委托（与 ui.js 同一套协议） ---------------- */
function actionEl(node, root) {
  let el = node
  while (el && el !== root) {
    if (el.dataset && el.dataset.action) return el
    el = el.parentElement
  }
  return null
}

function readForm(root) {
  const out = {}
  for (const el of root.querySelectorAll('input[name], textarea[name], select[name]')) {
    const k = el.name
    if (el.type === 'checkbox') {
      if (!Array.isArray(out[k])) out[k] = []
      if (el.checked) out[k].push(el.value)
    } else if (el.type === 'radio') {
      if (el.checked) out[k] = el.value
    } else out[k] = el.value
  }
  return out
}

async function run(inst, el, event) {
  const name = el.dataset.action
  const fn = inst.page.actions && inst.page.actions[name]
  if (typeof fn !== 'function') return
  if (event) event.preventDefault()

  // 换页类动作 → 在原型里表现为"跳到对应画面"
  const dest = ROUTE_ACTIONS[name]
  if (dest) {
    note('「' + (el.textContent || name).trim().slice(0, 12) + '」是换页入口 → 跳到画面 ' + dest)
    jumpTo(dest)
    return
  }

  try {
    // ui.js 会在渲染前保存输入值；原型这里用同样的思路读一次当前表单
    const form = readForm(inst.root)
    await fn(makeCtx(inst, el, { ...el.dataset }, form))
    paint(inst)
    note('已执行动作：' + name)
  } catch (err) {
    note('动作 ' + name + ' 出错：' + err.message)
    console.error(err)
  }
}

function bind(inst) {
  const root = inst.root
  root.addEventListener('click', (e) => {
    const el = actionEl(e.target, root)
    if (!el) return
    if (el.tagName === 'BUTTON' && el.getAttribute('type') === 'submit') return
    run(inst, el, e)
  })
  root.addEventListener('submit', (e) => {
    e.preventDefault()
    const form = e.target
    const el = actionEl(form.querySelector('[type=submit]') || form, root)
    if (el) run(inst, el, e)
  })
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      inst.layers = []
      paint(inst)
    }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      const host = e.target.closest('[data-enter]')
      const btn = host && host.querySelector('[data-action]')
      if (btn) { e.preventDefault(); run(inst, btn, e) }
    }
  })
}

/* ---------------- 启动与数据准备 ---------------- */
async function boot() {
  resetMock()
  tokenStore.clear()
  setSession(null)
  store.sports = []
  await loadSports()

  // 1) 先建实例（此时还未渲染最终内容）
  for (const s of SCREENS) {
    const mount = document.querySelector('[data-mount="' + s.id + '"]')
    const mod = await import('../frontend/src/pages/' + s.module + '.js')
    const page = mod.create(s.params)
    const inst = { ...s, page, root: mount, layers: [] }
    instances.set(s.id, inst)
    bind(inst)
  }

  // 2) 分三批准备登录态，避免不同身份互相覆盖
  const need2 = SCREENS.filter((s) => s.asUser === 2).map((s) => s.id)
  const guests = SCREENS.filter((s) => s.guest).map((s) => s.id)

  // 2a. 游客画面
  tokenStore.clear()
  setSession(null)
  for (const id of guests) {
    const inst = instances.get(id)
    if (inst.page.load) await inst.page.load()
  }

  // 2b. 发起人身份（活动 103 的发起人是 王妍 id=2）
  if (need2.length) {
    await signIn(2)
    for (const id of need2) {
      const inst = instances.get(id)
      if (inst.page.load) await inst.page.load()
    }
  }

  // 2c. 默认参与者身份（林浩 id=1）
  await signIn(1)
  for (const inst of instances.values()) {
    if (guests.includes(inst.id) || need2.includes(inst.id)) continue
    if (inst.page.load) await inst.page.load()
  }

  // 3) 个别画面的"先点一下"初始状态
  for (const inst of instances.values()) {
    if (inst.demoMatch) {
      await inst.page.actions['use-example'](makeCtx(inst, null, { text: inst.demoMatch }))
      await inst.page.actions.match(
        makeCtx(inst, null, { sentence: inst.demoMatch }, { sentence: inst.demoMatch })
      )
    }
    if (inst.tweak === 'new-beginner') {
      await inst.page.actions.switch(makeCtx(inst, null, { name: 'skill_level', value: 'beginner' }))
    }
    if (inst.tweak === 'review-stars') {
      await inst.page.actions.star(makeCtx(inst, null, { user: '3', score: '5' }))
      await inst.page.actions.tag(makeCtx(inst, null, { user: '3', value: '准时' }))
      await inst.page.actions.tag(makeCtx(inst, null, { user: '3', value: '球风好' }))
    }
  }

  // 4) 统一渲染
  for (const inst of instances.values()) paint(inst)
  note('已就绪：可以直接在下面的手机框里点击操作')
}

document.getElementById('btn-reset').addEventListener('click', () => location.reload())

boot().catch((err) => {
  const el = document.getElementById('log')
  if (el) el.textContent = '启动失败：' + err.message
  console.error(err)
})
`
}

function buildScreens() {
  const cards = SCREENS.map(screenFrame).join('\n')

  const notes = `
  <section class="smp-notes">
    <div class="smp-card">
      <h2>怎么看这块展板</h2>
      <ul>
        <li>每个手机框都是<b>真实前端页面</b>渲染出来的，不是画出来的图片。</li>
        <li>框里可以<b>直接点</b>：切换筛选、展开弹层、提交表单都会真的跑一遍页面逻辑。</li>
        <li>点「报名」「详情」「去签到」这类<b>换页按钮</b>，会高亮跳转到对应画面，方便串起整个流程。</li>
        <li>数据来自内置的离线示例数据（offline mock），因此断网也能演示。</li>
        <li>顶部工具条的「重新开始」会清空本次操作对数据的影响。</li>
      </ul>
    </div>
    <div class="smp-card">
      <h2>几个可以当场演示的路径</h2>
      <ol>
        <li><b>新手找局</b>：P-02 输入「今晚想在旗山校区打篮球，新手可以吗」→ 看推荐卡片上的「项目匹配 / 水平合适 / 同校区」标签。</li>
        <li><b>报名到签到</b>：P-04 点「立即报名」→ 弹层留一句话 → 确认；再进 P-07 输入签到码 <code>9572</code>。</li>
        <li><b>发起人视角</b>：P-05 / P-08 是以活动发起人（王妍）身份渲染的，能看到签到码与考勤勾选。</li>
        <li><b>信用分不足</b>：用活动列表里发起人为「高飞」的活动，报名会拿到 403 的中文提示。</li>
      </ol>
    </div>
    <div class="smp-card">
      <h2>原型与实现的对应关系</h2>
      <p style="font-size:13px;color:var(--smp-ink2);margin:0">
        每个画面都直接引用 <code>frontend/src/pages/*.js</code> 里的页面模块，
        调用它自己的 <code>view()</code> 与 <code>actions</code>。
        也就是说：<b>改了前端代码，原型自动跟着变</b>，不存在"原型与实现两张皮"。
        重新生成只需运行一次 <code>node tools/build-prototype.mjs</code>。
      </p>
    </div>
  </section>`

  return `${head('SportsBuddy · 界面原型（可交互）')}
<body class="smp">
  <header class="smp-head"><div class="smp-head__wrap">
    <h1>界面原型 · 可交互</h1>
    <p>
      共 ${SCREENS.length} 个画面，覆盖《前端对接文档》里全部 19 个接口。每个框都是真实页面模块渲染出来的，
      可以直接点击操作；右上角标注了该画面主要用到的接口。
    </p>
    ${nav('./screens.html')}
  </div></header>

  <div class="smp-bar"><div class="smp-bar__wrap">
    <button id="btn-reset" class="primary" type="button">重新开始</button>
    <span id="log" class="smp-bar__log">等待操作…</span>
    <span class="smp-bar__hint">提示：换页按钮会高亮跳到对应画面；弹层可按 Esc 关闭</span>
  </div></div>

  <main class="smp-main">
    <div class="smp-grid">
${cards}
    </div>
${notes}
  </main>

  <p class="smp-foot">
    原型数据为示意数据，非真实用户信息。类图见
    <a href="../docs/diagrams/class-diagram.html">领域类图</a>。
  </p>

  <script type="module">
${screensScript()}
  </script>
</body>
</html>
`
}

/* ===================================================================== */
/* 4. 生成 index.html（总览 + 覆盖表）                                   */
/* ===================================================================== */

function buildIndex() {
  const rows = API_COVERAGE.map(
    ([m, p, where]) => `<tr><td><span class="smp-pill">${m}</span></td><td><code>${p}</code></td><td>${where}</td></tr>`
  ).join('')

  const screenList = SCREENS.map(
    (s) =>
      `<tr><td>${s.no}</td><td><b>${s.title}</b></td><td>${s.desc}</td><td><code>${s.api}</code></td></tr>`
  ).join('')

  return `${head('SportsBuddy · 前端交付总览')}
<body class="smp">
  <header class="smp-head"><div class="smp-head__wrap">
    <h1>SportsBuddy · 前端交付总览</h1>
    <p>
      依据 <code>sportmate后端.zip</code> 里的《前端对接文档》实现：一个零安装、可离线运行的移动优先前端，
      外加领域类图与可交互界面原型。三项交付物都可以直接在本地浏览器打开。
    </p>
    ${nav('./index.html')}
  </div></header>

  <main class="smp-main">
    <div class="smp-notes" style="margin-top:0">
      <div class="smp-card">
        <h2>① 前端应用</h2>
        <p style="font-size:13px;color:var(--smp-ink2)">
          原生 ES Module + 自研 200 行渲染内核，<b>无需 npm install</b>。
          默认用内置离线数据，打开即可看；接真实后端只需改 index.html 里的一行配置。
        </p>
        <p><a href="../frontend/index.html"><b>→ 打开应用</b></a></p>
        <ul>
          <li>11 个页面 / 19 个接口全覆盖</li>
          <li>时区、错误码、权限差异都按文档处理</li>
          <li><code>node tools/verify.mjs</code> 自检 99 项</li>
        </ul>
      </div>
      <div class="smp-card">
        <h2>② 领域类图</h2>
        <p style="font-size:13px;color:var(--smp-ink2)">
          从后端接口契约反推的 15 个类、20 条关系，附 Mermaid 源文件与离线渲染的 SVG。
        </p>
        <p><a href="../docs/diagrams/class-diagram.html"><b>→ 查看类图</b></a></p>
        <ul>
          <li><code>docs/diagrams/class-diagram.mmd</code>（可贴进 mermaid.live）</li>
          <li><code>docs/diagrams/class-diagram.svg</code>（可直接插进报告）</li>
        </ul>
      </div>
      <div class="smp-card">
        <h2>③ 界面原型</h2>
        <p style="font-size:13px;color:var(--smp-ink2)">
          两种看法：<b>单屏可跳转</b>（像真机一样点着走）与 <b>12 屏展板</b>（一眼看全）。
          都直接复用 <code>frontend/src/pages</code> 的页面模块，与前端代码同源。
        </p>
        <p>
          <a href="./mobile-prototype.html"><b>→ 移动端原型（12 屏可跳转）</b></a><br />
          <a href="./screens.html">→ 12 屏展板</a> ·
          <a href="./wireframe.html">页面结构与跳转</a>
        </p>
        <ul>
          <li><b>mobile-prototype.html 是单文件</b>：CSS/JS 全内联，双击即可打开，不用起服务</li>
          <li>按钮真会跳到对应屏；顶栏可切上一屏/下一屏、调出 12 屏目录、显示热区</li>
          <li>地址栏带 <code>#p04</code> 这样的 hash，可直接分享某一屏</li>
        </ul>
      </div>
    </div>

    <div class="smp-notes">
      <div class="smp-card">
        <h2>画面清单（${SCREENS.length} 个）</h2>
        <table class="smp-table">
          <thead><tr><th>编号</th><th>画面</th><th>说明</th><th>主要接口</th></tr></thead>
          <tbody>${screenList}</tbody>
        </table>
      </div>
      <div class="smp-card">
        <h2>接口覆盖（19 个接口，含 3 个匿名可访问）</h2>
        <table class="smp-table">
          <thead><tr><th>方法</th><th>路径</th><th>落在哪个画面</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="smp-notes">
      <div class="smp-card">
        <h2>怎么跑起来</h2>
        <ol>
          <li>在项目根目录执行 <code>node tools/server.mjs</code>（也可双击 <code>start.cmd</code>）</li>
          <li>浏览器打开 <code>http://127.0.0.1:5178/prototype/</code></li>
          <li>接真实后端：把 <code>frontend/index.html</code> 里的
              <code>useMock</code> 改为 <code>false</code>，
              <code>apiBaseUrl</code> 指向后端地址</li>
        </ol>
        <p style="font-size:12.5px;color:var(--smp-ink3)">
          不需要 npm install：本工程没有构建步骤，也没有 node_modules 依赖。
        </p>
      </div>
      <div class="smp-card">
        <h2>自检与再生成</h2>
        <table class="smp-table">
          <tbody>
            <tr><td><code>node tools/verify.mjs</code></td><td>99 项自检：接口、业务规则、页面渲染、时区</td></tr>
            <tr><td><code>python tools/render-class-diagram.py</code></td><td>由 .mmd 渲染出 SVG 类图</td></tr>
            <tr><td><code>python tools/check-class-diagram.py</code></td><td>几何校验：文字不溢出、连线不穿框</td></tr>
            <tr><td><code>node tools/build-prototype.mjs</code></td><td>重新生成本原型页</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <p class="smp-foot">示意数据仅用于演示，不代表真实用户信息。</p>
</body>
</html>
`
}

/* ===================================================================== */
/* 5. 输出                                                               */
/* ===================================================================== */

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'screens.html'), buildScreens(), 'utf8')
writeFileSync(resolve(OUT, 'index.html'), buildIndex(), 'utf8')

console.log('原型已生成：')
console.log('  prototype/index.html    总览与接口覆盖表')
console.log(`  prototype/screens.html  ${SCREENS.length} 个可交互画面`)
console.log('  （wireframe.html 与类图的 HTML 由各自脚本/手写维护）')
