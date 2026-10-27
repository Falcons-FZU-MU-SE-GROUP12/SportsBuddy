/**
 * 生成「单文件移动端 HTML 原型」
 * ===========================================================================
 * 产物：prototype/mobile-prototype.html
 *
 * 和 screens.html 的区别：
 *   screens.html   12 屏**并排展板**，靠 ES Module 动态 import 页面模块，
 *                  必须起 HTTP 服务（浏览器禁止 file:// 加载模块）。
 *   本文件          **一次一屏**的真机式原型，按钮能真的跳到下一屏；
 *                  CSS 与 JS 全部内联，没有任何外部依赖，双击即可打开。
 *
 * 做法：
 *   仍然复用 frontend/src/pages 里的真实页面模块（调它们的 view() 拿 HTML），
 *   所以在视觉和文案上与真实应用完全一致；只是把"数据处理"冻结成静态快照，
 *   把 data-action 映射成"跳到第 N 屏"，让它成为一个可以点着走一遍的原型。
 *
 * 用法：node tools/build-mobile-prototype.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installBrowserStub } from './browser-stub.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = resolve(ROOT, 'prototype', 'mobile-prototype.html')

/* 先装浏览器环境替身，页面模块才能被 import */
installBrowserStub({ useMock: true })

const { api, tokenStore } = await import('../frontend/src/api/index.js')
const { loadSports, setSession, store } = await import('../frontend/src/store.js')
const { USERS } = await import('../frontend/src/fixtures/index.js')

/* ===================================================================== */
/* 1. 12 屏定义                                                          */
/* ===================================================================== */

const SCREENS = [
  { id: 'p01', no: 'P-01', title: '登录 / 注册', module: 'login', params: {}, guest: true,
    note: '未登录入口：登录 / 注册分段开关 + 演示账号一键进入' },
  { id: 'p02', no: 'P-02', title: '找局首页', module: 'discover', params: {}, demoMatch: true,
    note: '一句话找局 + 推荐理由标签 + 最近活动' },
  { id: 'p03', no: 'P-03', title: '活动列表', module: 'activities', params: {},
    note: '按项目 / 状态 / 时间筛选，卡片带名额进度条' },
  { id: 'p04', no: 'P-04', title: '活动详情（参与者）', module: 'activity', params: { id: '101' },
    note: '报名 / 退报 / 签到入口，含临期取消提醒' },
  // 活动 103 的发起人是 何静（id=7），所以发起人视角必须用 id=7 登录
  { id: 'p05', no: 'P-05', title: '活动详情（发起人）', module: 'activity', params: { id: '103' }, asUser: 7,
    note: '只有发起人看得到签到码，并可直接进入考勤' },
  { id: 'p06', no: 'P-06', title: '发起活动', module: 'activity-new', params: {}, tweak: 'new',
    note: '表单校验 + 时间本地转 UTC + 场地坐标标记' },
  { id: 'p07', no: 'P-07', title: '签到', module: 'checkin', params: { id: '101' },
    note: '签到码 / 定位两种方式并列，失败态细分' },
  { id: 'p08', no: 'P-08', title: '管理活动', module: 'activity-manage', params: { id: '103' }, asUser: 7,
    note: '签到码大字展示 + 到场勾选 + 提交考勤' },
  { id: 'p09', no: 'P-09', title: '我的局', module: 'manage', params: {},
    note: '我发起的 / 我报名的，取消前二次确认' },
  { id: 'p10', no: 'P-10', title: '我的', module: 'me', params: {},
    note: '信用分环形卡 + 评价汇总 + 账号信息' },
  { id: 'p11', no: 'P-11', title: '个人主页（他人）', module: 'user', params: { id: '3' },
    note: '信用分、评价分布条形、印象标签' },
  { id: 'p12', no: 'P-12', title: '评价同场伙伴', module: 'review', params: { activityId: '107' }, tweak: 'review',
    note: '星级 + 印象标签 + 一句话，仅到场者可评' },
]

/* ===================================================================== */
/* 2. 渲染 12 屏（复用真实页面模块）                                      */
/* ===================================================================== */

/**
 * 用指定用户登录。
 * 用户名从 fixtures 里按 id 查，不硬编码名字 —— 之前硬编码只支持 1/2 两个账号，
 * 结果"发起人视角"用错了人（活动 103 的发起人是 id=7 何静），页面退化成参与者视图。
 */
async function signIn(userId = 1) {
  const user = USERS.find((u) => u.id === userId)
  if (!user) throw new Error(`fixtures 里没有 id=${userId} 的用户`)
  const res = await api.login(user.username, 'secret123')
  tokenStore.set(res.access_token)
  setSession(await api.getMe())
}

/** 一个页面实例就是一个"快照"：load() 拿数据，view() 出 HTML。 */
function ctxOf(page, data = {}, form = {}) {
  return { data, form, el: null, root: null, rerender: () => {} }
}

async function renderAll() {
  store.sports = []
  await loadSports()

  const shots = []

  /** 渲染某一屏的快照（同时应用它的"展示态"预置动作） */
  async function shoot(s) {
    const mod = await import(`../frontend/src/pages/${s.module}.js`)
    const page = mod.create(s.params)
    if (page.load) await page.load()

    // 个别屏的展示态：先"点一下"再拍快照
    if (s.demoMatch) {
      await page.actions['use-example'](ctxOf(page, { text: '今晚想在旗山校区打篮球，新手可以吗' }))
      await page.actions.match(
        ctxOf(page, { sentence: '今晚想在旗山校区打篮球，新手可以吗' },
          { sentence: '今晚想在旗山校区打篮球，新手可以吗' })
      )
    }
    if (s.tweak === 'new') {
      await page.actions.switch(ctxOf(page, { name: 'skill_level', value: 'beginner' }))
    }
    if (s.tweak === 'review') {
      await page.actions.star(ctxOf(page, { user: '3', score: '5' }))
      await page.actions.tag(ctxOf(page, { user: '3', value: '准时' }))
      await page.actions.tag(ctxOf(page, { user: '3', value: '球风好' }))
    }

    shots.push({ ...s, html: page.appBar ? page.appBar() + page.view() : page.view() })
  }

  // 1) 游客屏：必须在未登录状态下渲染
  tokenStore.clear()
  setSession(null)
  for (const s of SCREENS.filter((x) => x.guest)) await shoot(s)

  // 2) 需要特定身份才能看到的屏：按 asUser 分组，一组只登录一次。
  //    ⚠️ 不能硬编码某个 id —— 之前写成 asUser===2，而活动 103 的发起人是 id=7，
  //    结果"发起人视角"拿不到 checkin_code，页面退化成参与者视图。
  const asUserIds = [...new Set(SCREENS.filter((x) => x.asUser).map((x) => x.asUser))]
  for (const uid of asUserIds) {
    await signIn(uid)
    for (const s of SCREENS.filter((x) => x.asUser === uid)) await shoot(s)
  }

  // 3) 其余屏：默认参与者身份（林浩）
  await signIn(1)
  for (const s of SCREENS.filter((x) => !x.guest && !x.asUser)) await shoot(s)

  // 按 SCREENS 顺序排好
  return SCREENS.map((s) => shots.find((x) => x.id === s.id))
}

/* ===================================================================== */
/* 3. 组装单文件 HTML                                                     */
/* ===================================================================== */

/** 页面里会"跨屏"的动作 → 目标屏。其余动作在原型里只做本地视觉反馈。 */
const ROUTE = {
  'open-activity': 'p04',
  'go-detail': 'p04',
  'go-activities': 'p03',
  'go-list': 'p03',
  'go-checkin': 'p07',
  'go-review': 'p12',
  'go-new': 'p06',
  'go-edit': 'p06',
  'go-manage': 'p08',
  'open-attendance': 'p08',
  'view-user': 'p11',
  'go-my-page': 'p11',
  'go-login': 'p01',
  'go-discover': 'p02',
  // 「退出登录」在真实应用里会清 token 回登录页，原型里直接跳回登录页
  logout: 'p01',
  // 「用演示账号体验」等价于登录成功 → 直接进首页
  demo: 'p02',
}

/** 纯视觉反馈的动作（不涉及接口）：分段开关、筛选 chip、标签、星级 */
const VISUAL = ['switch', 'mode', 'tab', 'filter', 'pick-sport', 'star', 'tag', 'dur', 'filter-match']

/** 底部标签栏的 data-href → 目标屏 */
const HREF_ROUTE = {
  '#/discover': 'p02',
  '#/activities': 'p03',
  '#/manage': 'p09',
  '#/me': 'p10',
}

/**
 * 「返回」的兜底去向。
 * 直接用 history.back() 在"首次打开就停在某一屏"（例如直接打开 #p05）时会退不出去，
 * 所以每屏都给一个合理的上级页面。
 */
const BACK = {
  p01: 'p01',
  p02: 'p01',
  p03: 'p02',
  p04: 'p03',
  p05: 'p03',
  p06: 'p02',
  p07: 'p09',
  p08: 'p09',
  p09: 'p02',
  p10: 'p02',
  p11: 'p10',
  p12: 'p09',
}

function build(shots) {
  const appCss = readFileSync(resolve(ROOT, 'frontend', 'assets', 'css', 'app.css'), 'utf8')

  const screensHtml = shots
    .map(
      (s) => `    <section class="screen" id="${s.id}" data-no="${s.no}" data-title="${s.title}">
      <!--SCREEN-START:${s.id}-->
      <div class="screen__inner">
${s.html}
      </div>
      <!--SCREEN-END:${s.id}-->
    </section>`
    )
    .join('\n')

  const navItems = shots
    .map((s) => `<button class="jump" type="button" data-goto="${s.id}"><b>${s.no.replace('P-', '')}</b><span>${s.title}</span></button>`)
    .join('\n          ')

  const metaJson = JSON.stringify(
    shots.map((s) => ({ id: s.id, no: s.no, title: s.title, note: s.note })),
    null,
    2
  )

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#ff6a3d" />
<title>SportsBuddy · 移动端 HTML 原型（12 屏可跳转）</title>
<style>
/* ================= 设计令牌（与 frontend/assets/css/app.css 同源） ================= */
${appCss}

/* ================= 原型外壳：桌面端显示手机框，手机端全屏 ================= */
html, body { height: 100%; }
body.proto {
  margin: 0;
  background: #e9ecf3;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font);
}
.proto-stage {
  position: relative;
  width: 390px;
  height: 844px;
  background: var(--bg);
  border-radius: 34px;
  box-shadow: 0 26px 70px rgba(20, 24, 38, .28), 0 0 0 10px #1b1e26, 0 0 0 12px #33363f;
  overflow: hidden;
}
/* 手机端：去掉外壳，铺满整屏 */
@media (max-width: 560px), (max-height: 720px) {
  body.proto { display: block; background: var(--bg); }
  .proto-stage {
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }
  .proto-chrome { display: none; }
  .proto-screen { height: 100%; }
}

/* ================= 屏幕容器：一次只显示一屏 ================= */
.proto-screen {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  display: none;
  background: var(--bg);
}
.proto-screen.is-active { display: block; }
.screen__inner { min-height: 100%; padding-bottom: 8px; }

/* ================= 顶部工具条（仅桌面端） ================= */
.proto-chrome {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(255,255,255,.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink2);
}
.proto-chrome__label { font-weight: 650; color: var(--ink); }
.proto-chrome__note { color: var(--ink3); font-size: 12px; margin-left: 4px; }
.proto-chrome__spacer { flex: 1; }
.proto-chrome button {
  font: inherit; font-size: 12.5px; font-weight: 600;
  border: 1px solid var(--line2); background: #fff; color: var(--ink2);
  border-radius: 9px; padding: 6px 11px; cursor: pointer;
}
.proto-chrome button:hover { background: var(--surface-2); }
.proto-chrome button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
@media (min-width: 561px) { body.proto { padding-top: 46px; } }

/* ================= 屏幕跳转菜单 ================= */
.jump-menu {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(18,20,26,.45);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.jump-menu.is-open { display: flex; }
.jump-menu__panel {
  width: min(720px, 100%);
  max-height: 80vh;
  overflow: auto;
  background: #fff;
  border-radius: 18px;
  padding: 18px;
  box-shadow: var(--sh-3);
}
.jump-menu__head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.jump-menu__head h2 { margin: 0; font-size: 16px; }
.jump-menu__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.jump {
  display: flex; align-items: center; gap: 9px;
  text-align: left; font: inherit; font-size: 13px;
  background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 10px; padding: 9px 11px; cursor: pointer; color: var(--ink);
}
.jump:hover { background: var(--brand-100); border-color: #ffd9c9; }
.jump b {
  flex: none; width: 22px; height: 22px; border-radius: 7px;
  background: var(--brand); color: #fff; font-size: 11px;
  display: grid; place-items: center;
}
.jump span { flex: 1; min-width: 0; }

/* ================= 热区提示 ================= */
body.hotspots-on [data-action],
body.hotspots-on [data-goto] {
  outline: 2px dashed rgba(255, 106, 61, .85) !important;
  outline-offset: 2px;
  border-radius: 6px;
  position: relative;
}
body.hotspots-on [data-action]::after {
  content: attr(data-action);
  position: absolute;
  top: -8px; left: 0;
  transform: translateY(-100%);
  background: var(--ink);
  color: #fff;
  font-size: 9px;
  font-family: var(--font-num);
  padding: 1px 4px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 5;
  opacity: .92;
}

/* ================= 轻提示 ================= */
.proto-toast {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom));
  transform: translateX(-50%) translateY(12px);
  background: rgba(22,24,29,.94);
  color: #fff;
  font-size: 12.5px;
  line-height: 1.5;
  padding: 9px 14px;
  border-radius: 10px;
  max-width: min(520px, calc(100vw - 32px));
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
  z-index: 200;
}
.proto-toast.is-show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* =========================================================================
   适配"手机框"的三个覆盖
   -------------------------------------------------------------------------
   app.css 里有些尺寸是相对浏览器窗口写的，放进 390×844 的手机框后会算错：
     · .sm-auth / .sm-shell 用了 min-height: 100vh → 按浏览器高度算，会溢出
     · .sm-fab 用了 position: fixed → 跑到手机框外面
     · .sm-tabbar 用了 position: fixed → 横跨整个浏览器窗口
   这里按"框内"重算。
   ========================================================================= */

/* 1) vh 改成 100%，按手机框算 */
.screen__inner .sm-shell { min-height: 100%; }
.screen__inner .sm-auth { min-height: 844px; }

/* 2) 底部标签栏：改 sticky，贴住滚动视口的底边（不需要算偏移，最稳） */
.screen__inner .sm-tabbar {
  position: sticky;
  bottom: 0;
  z-index: 20;
}

/* 3) 悬浮按钮：改成 fixed，但偏移按"居中的手机框"重算
      right = 框右边缘（50% + 195px）往内 16px
      bottom = 框底边缘（50vh + 422px - 46px 顶栏）往上 78px */
.screen__inner .sm-fab {
  position: fixed;
  right: calc(50% - 179px);
  bottom: calc(50vh - 367px);
}
/* 手机端：框就是整屏，恢复成贴近屏幕右下角 */
@media (max-width: 560px), (max-height: 720px) {
  .screen__inner .sm-fab { right: 16px; bottom: 78px; }
}

/* 4) 有标签栏的屏留出底部空间，避免最后一条内容被栏挡住 */
.screen__inner .sm-main { padding-bottom: 96px; }
</style>
</head>
<body class="proto">

<!-- ===================== 桌面端工具条 ===================== -->
<div class="proto-chrome">
  <span class="proto-chrome__label" id="chromeLabel">P-01 登录 / 注册</span>
  <span class="proto-chrome__note" id="chromeNote"></span>
  <span class="proto-chrome__spacer"></span>
  <button type="button" data-nav="prev">← 上一屏</button>
  <button type="button" data-nav="next">下一屏 →</button>
  <button type="button" id="btnJump">☰ 全部 12 屏</button>
  <button type="button" id="btnHotspots" aria-pressed="false">显示热区</button>
</div>

<!-- ===================== 12 屏 ===================== -->
<div class="proto-stage" id="stage">
${screensHtml}

<!-- 屏幕跳转菜单 -->
<div class="jump-menu" id="jumpMenu">
  <div class="jump-menu__panel">
    <div class="jump-menu__head">
      <h2>选择要查看的画面（共 12 屏）</h2>
      <span class="proto-chrome__spacer"></span>
      <button type="button" id="btnJumpClose">关闭</button>
    </div>
    <div class="jump-menu__grid">
      ${navItems}
    </div>
  </div>
</div>
</div>

<div class="proto-toast" id="toast"></div>

<script>
/* ===========================================================================
   原型运行时（纯原生 JS，无模块、无外部依赖，file:// 直接可用）
   ---------------------------------------------------------------------------
   三件事：
     1. hash 路由：一次只显示一屏，#p04 这样的地址可以直接分享/刷新
     2. 把按钮动作翻译成"跳转到第 N 屏"（映射见 ROUTE / HREF_ROUTE）
     3. 分段开关、筛选 chip、复选框等做本地视觉反馈，让原型"点得动"
   =========================================================================== */
(function () {
  var SCREENS = ${metaJson};

  var ROUTE = ${JSON.stringify(ROUTE, null, 2)};
  var HREF_ROUTE = ${JSON.stringify(HREF_ROUTE, null, 2)};
  var VISUAL = ${JSON.stringify(VISUAL, null, 2)};
  var BACK = ${JSON.stringify(BACK, null, 2)};

  var sections = [].slice.call(document.querySelectorAll('.screen'));
  var ids = sections.map(function (s) { return s.id; });
  var chromeLabel = document.getElementById('chromeLabel');
  var chromeNote = document.getElementById('chromeNote');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  function meta(id) {
    for (var i = 0; i < SCREENS.length; i++) if (SCREENS[i].id === id) return SCREENS[i];
    return null;
  }

  /** 显示某一屏；push=true 时写入 hash（形成可回退的历史） */
  function show(id, push) {
    if (ids.indexOf(id) < 0) id = ids[0];
    sections.forEach(function (s) { s.classList.toggle('is-active', s.id === id); });
    var m = meta(id);
    if (m && chromeLabel) {
      chromeLabel.textContent = m.no + ' ' + m.title;
      chromeNote.textContent = m.note || '';
    }
    if (push && location.hash.slice(1) !== id) {
      location.hash = id;
    } else if (!push) {
      var active = document.getElementById(id);
      if (active) active.scrollTop = 0;
    }
    document.title = (m ? m.no + ' ' + m.title + ' · ' : '') + 'SportsBuddy 原型';
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2200);
  }

  function current() {
    var h = location.hash.slice(1);
    return ids.indexOf(h) >= 0 ? h : ids[0];
  }

  function goto(id, why) {
    if (ids.indexOf(id) < 0) return;
    show(id, true);
    if (why) toast(why);
  }

  /* ---------------- 分段开关 / chip / 复选框：本地视觉反馈 ---------------- */
  function pressInGroup(el) {
    // 同一个 sm-switch / sm-filters / 分段容器里，只允许一个按下
    var group = el.closest('.sm-switch, .sm-filters, [role="group"]');
    if (group) {
      [].slice.call(group.querySelectorAll('[aria-pressed]')).forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === el));
      });
    } else {
      el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-goto], [data-action]');
    if (!el) return;

    /* 1) 显式跳转 */
    if (el.hasAttribute('data-goto')) {
      goto(el.getAttribute('data-goto'));
      return;
    }

    var action = el.getAttribute('data-action');

    /* 2) 跨屏动作 */
    if (ROUTE[action]) {
      e.preventDefault();
      goto(ROUTE[action], '跳转到「' + meta(ROUTE[action]).title + '」');
      return;
    }

    /* 3) 底部标签栏 */
    if (action === 'nav') {
      var href = el.getAttribute('data-href') || '';
      if (HREF_ROUTE[href]) {
        e.preventDefault();
        goto(HREF_ROUTE[href]);
      }
      return;
    }

    /* 4) 返回：优先用浏览器历史；没有历史时按 BACK 表退回上级页面 */
    if (action === 'back') {
      e.preventDefault();
      if (history.length > 1) {
        history.back();
      } else {
        goto(BACK[current()] || ids[0]);
      }
      return;
    }

    /* 5) 纯视觉状态：分段开关 / 筛选 chip / 标签 / 星级 / 时长快捷 */
    if (VISUAL.indexOf(action) >= 0) {
      e.preventDefault();
      pressInGroup(el);
      return;
    }

    /* 6) 「用这句话找局」示例：把示例文字填进输入框，制造"能用"的感觉 */
    if (action === 'use-example') {
      e.preventDefault();
      var txt = el.getAttribute('data-text') || '';
      var input = el.closest('section') && el.closest('section').querySelector('input[name="sentence"]');
      if (input) { input.value = txt; }
      toast('已填入示例：' + txt);
      return;
    }

    /* 7) 「只看还有空位」：原型里直接切换复选框 */
    if (action === 'toggle-available') {
      e.preventDefault();
      var cb = el.matches('input[type="checkbox"]') ? el : el.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = !cb.checked;
      return;
    }

    /* 8) 全选 / 全不选到场：把同一张卡里的复选框一起改 */
    if (action === 'check-all' || action === 'check-none') {
      e.preventDefault();
      var card = el.closest('.sm-card') || el.closest('main');
      var boxes = card ? card.querySelectorAll('input[name="attended"]') : [];
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = action === 'check-all';
      toast(action === 'check-all' ? '已全选到场' : '已全部取消勾选');
      return;
    }

    /* 9) 复选框本身交给浏览器原生行为 */
    if (el.matches('input[type="checkbox"]')) return;

    /* 10) 其余需要接口的动作：提示"真实应用里会调接口"，不改数据 */
    e.preventDefault();
    toast('原型演示：这一步在真实应用里会调用接口（' + action + '）');
  });

  /* ---------------- 工具条 ---------------- */
  document.querySelectorAll('[data-nav]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = ids.indexOf(current());
      var d = btn.getAttribute('data-nav') === 'next' ? 1 : -1;
      var n = (i + d + ids.length) % ids.length;
      goto(ids[n]);
    });
  });

  var jumpMenu = document.getElementById('jumpMenu');
  document.getElementById('btnJump').addEventListener('click', function () {
    jumpMenu.classList.add('is-open');
  });
  document.getElementById('btnJumpClose').addEventListener('click', function () {
    jumpMenu.classList.remove('is-open');
  });
  jumpMenu.addEventListener('click', function (e) {
    if (e.target === jumpMenu) jumpMenu.classList.remove('is-open');
  });

  var btnHot = document.getElementById('btnHotspots');
  btnHot.addEventListener('click', function () {
    var on = document.body.classList.toggle('hotspots-on');
    btnHot.setAttribute('aria-pressed', String(on));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') jumpMenu.classList.remove('is-open');
    if (e.key === 'ArrowRight' && !jumpMenu.classList.contains('is-open')) {
      var i = ids.indexOf(current());
      goto(ids[(i + 1) % ids.length]);
    }
    if (e.key === 'ArrowLeft' && !jumpMenu.classList.contains('is-open')) {
      var j = ids.indexOf(current());
      goto(ids[(j - 1 + ids.length) % ids.length]);
    }
  });

  window.addEventListener('hashchange', function () { show(current(), false); });

  /* 启动 */
  show(current(), false);
})();
</script>
</body>
</html>
`
}

/* ===================================================================== */
/* 4. 输出                                                               */
/* ===================================================================== */

const shots = await renderAll()
const html = build(shots)
mkdirSync(resolve(ROOT, 'prototype'), { recursive: true })
writeFileSync(OUT, html, 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)
console.log('单文件移动端原型已生成：')
console.log(`  prototype/mobile-prototype.html   ${shots.length} 屏  ${kb} KB`)
console.log('  无外部依赖（CSS/JS 全内联），双击即可打开')
