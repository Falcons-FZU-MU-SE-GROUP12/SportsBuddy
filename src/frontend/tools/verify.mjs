/**
 * 自检脚本（不需要浏览器）
 * ---------------------------------------------------------------------------
 * 这台机器上没有可用的无头浏览器（沙盒禁止 Chromium 的进程间通信），
 * 所以界面的正确性用"程序化校验"来兜底。校验四件事：
 *
 *   A. 19 个接口全覆盖：逐一调用 api.*，确认 mock 路由真的能响应，且状态码符合预期；
 *   B. 业务规则符合文档：重复报名 409、信用分不足 403、签到码错 403、
 *      超范围 403、临期取消 is_late_cancel、创建活动不含 checkin_code（需二次查询）
 *   C. 每个页面的 view() 能渲染出结构完整的 HTML：标签配平、无 undefined/NaN、
 *      所有 data-action 都有对应处理函数
 *   D. 时区与格式化：UTC 串按本地时间显示（不出现差 8 小时）
 *
 * 运行： node tools/verify.mjs
 */

import { installBrowserStub, enableHashEvents } from './browser-stub.mjs'

installBrowserStub({ useMock: true })
const hashStore = enableHashEvents()

let pass = 0
let fail = 0
const failures = []

function ok(name, extra = '') {
  pass += 1
  console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ` \x1b[90m${extra}\x1b[0m` : ''}`)
}

function bad(name, detail) {
  fail += 1
  failures.push({ name, detail })
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`)
}

function check(name, cond, detail = '') {
  if (cond) ok(name)
  else bad(name, detail || '断言不成立')
}

function section(title) {
  console.log(`\n\x1b[1m\x1b[36m${title}\x1b[0m`)
}

/* ===================================================================== */
/* 载入应用模块                                                          */
/* ===================================================================== */

const apiMod = await import('../frontend/src/api/index.js')
const { api, ApiError, tokenStore } = apiMod
const { store, setSession, loadSports, TABS } = await import('../frontend/src/store.js')
const { db, resetMock, parseSentence } = await import('../frontend/src/api/mock.js')
const fmt = await import('../frontend/src/shared/format.js')
const { ME_ID } = await import('../frontend/src/fixtures/index.js')

/* ===================================================================== */
/* A. 19 个接口全覆盖                                                    */
/* ===================================================================== */

section('A. 接口清单覆盖（19 个）')

resetMock()
store.sports = []
await loadSports()

// 先登录，后续需要鉴权的接口才有 token
const login = await api.login('linhao', 'secret123')
check('POST /auth/login 返回 access_token', Boolean(login.access_token), JSON.stringify(login))
tokenStore.set(login.access_token)

const endpoints = [
  ['POST /auth/register', () => api.register({ username: `t_${Date.now()}`, password: 'secret123', nickname: '测试号', campus: '旗山校区', skill_level: 'beginner', favorite_sports: ['篮球'] })],
  ['POST /auth/login', async () => (await api.login('linhao', 'secret123'))],
  ['GET /me', () => api.getMe()],
  ['PATCH /me', () => api.updateMe({ nickname: '林浩' })],
  ['GET /sports', () => api.getSports()],
  ['GET /health', () => api.getHealth()],
  ['GET /users/{id}', () => api.getUser(2)],
  ['GET /users/{id}/reviews', () => api.getUserReviews(ME_ID)],
  ['GET /activities', () => api.getActivities({ limit: 5 })],
  ['GET /activities/mine', () => api.getMyActivities()],
  ['GET /activities/{id}', () => api.getActivity(101, true)],
  ['POST /activities/{id}/join', () => api.joinActivity(105, '带我一个')],
  ['DELETE /activities/{id}/join', () => api.leaveActivity(105)],
  ['POST /activities/{id}/checkin', () => api.checkinWithCode(109, '5521')],
  ['POST /activities/{id}/attendance', () => api.recordAttendance(107, [1, 3, 8])],
  ['POST /activities/{id}/reviews', () => api.createReview(107, { reviewee_id: 3, score: 5, tags: ['准时'], comment: '好' })],
  ['GET /match', () => api.match({ sport: '篮球' })],
  ['GET /match/parse', () => api.matchBySentence('今晚想在旗山校区打篮球，新手可以吗')],
]

for (const [name, fn] of endpoints) {
  try {
    await fn()
    ok(name)
  } catch (err) {
    bad(name, `${err.name}: ${err.message}`)
  }
}

// 创建活动要单独测：它不是幂等的，且要验证"返回值不含签到码"
try {
  const created = await api.createActivity({
    title: '自检用活动',
    sport: '羽毛球',
    campus: '旗山校区',
    location: '体育馆 1 号场',
    start_time: new Date(Date.now() + 86400000).toISOString(),
    end_time: new Date(Date.now() + 86400000 + 3600000).toISOString(),
    skill_level: 'any',
    capacity: 4,
    fee: 0,
  })
  ok('POST /activities')
  check(
    'POST /activities 返回值不含 checkin_code（符合文档"坑 2"）',
    !('checkin_code' in created) || created.checkin_code === undefined,
    `实际返回字段：${Object.keys(created).join(',')}`
  )
  const detail = await api.getActivity(created.id, true)
  check('创建后再查详情才能拿到 checkin_code', detail.checkin_code != null, JSON.stringify(detail.checkin_code))
} catch (err) {
  bad('POST /activities', err.message)
}

// POST /auth/logout 会清残留 token，放最后测
try {
  await api.logout()
  ok('POST /auth/logout')
  check('logout 后本地 token 已清除', !tokenStore.has())
} catch (err) {
  bad('POST /auth/logout', err.message)
}

/* ===================================================================== */
/* B. 业务规则                                                           */
/* ===================================================================== */

section('B. 业务规则（对照《前端对接文档》）')

resetMock()
tokenStore.set((await api.login('linhao', 'secret123')).access_token)

/** 断言某个调用抛出指定状态码。 */
async function expectStatus(name, fn, status, msgIncludes) {
  try {
    await fn()
    bad(name, `预期抛错（HTTP ${status}），但调用成功了`)
  } catch (err) {
    const isApi = err instanceof ApiError
    const statusOk = isApi && err.status === status
    const msgOk = !msgIncludes || (err.message || '').includes(msgIncludes)
    if (statusOk && msgOk) ok(name, `${status} · ${err.message}`)
    else
      bad(
        name,
        `预期 HTTP ${status}${msgIncludes ? ` 且包含「${msgIncludes}」` : ''}，实际 ${err.name} ${err.status ?? '-'} · ${err.message}`
      )
  }
}

// 重复报名 → 409（101 场已由 me 报名 == 需要先报名一次）
resetMock()
await api.joinActivity(101, '')
await expectStatus('重复报名返回 409「你已经报名过该活动」', () => api.joinActivity(101, ''), 409, '已经报名过')

// 满员 → 409
resetMock()
const full = await api.getActivity(103, true)
check('已满员活动 slots_left 为 0', full.slots_left === 0, `slots_left=${full.slots_left}`)
await expectStatus('满员活动报名返回 409「活动已满员」', () => api.joinActivity(103, ''), 409)

// 信用分不足 → 403（高飞 reliability_score = 58）
resetMock()
tokenStore.set('mock-token-8')
await expectStatus('信用分低于 60 报名返回 403', () => api.joinActivity(105, ''), 403, '低于 60')

// 签到码错误 → 403
resetMock()
tokenStore.set((await api.login('linhao', 'secret123')).access_token)
await expectStatus('签到码错误返回 403', () => api.checkinWithCode(109, '0000'), 403, '签到码错误')

// 定位超范围 → 403
await expectStatus(
  '定位超出 300 米返回 403',
  () => api.checkinWithLocation(109, 39.9042, 116.4074),
  403,
  '超出 300 米'
)

// 定位在范围内 → 成功
resetMock()
const pos = await api.checkinWithLocation(109, 26.1021, 119.2413)
check('定位在范围内签到成功', pos.success === true, JSON.stringify(pos))

// 临期取消 → is_late_cancel === true（101 场 6 小时后开始 → 不临期；这里造一个临期的）
resetMock()
const soon = db.activities.find((a) => a.id === 109) // -40 分钟开始 → 不适用
const lateOne = db.activities.find((a) => a.id === 101)
lateOne.start_time = new Date(Date.now() + 30 * 60000).toISOString().replace(/\.\d{3}Z$/, '')
await api.joinActivity(101, '')
const left = await api.leaveActivity(101)
check('距开始不足 2 小时取消 → is_late_cancel = true', left.is_late_cancel === true, JSON.stringify(left))
check('临期取消后信用分被扣 5 分', (await api.getMe()).reliability_score === 91, `实际 ${(await api.getMe()).reliability_score}`)

// 考勤：未勾选者记为爽约
resetMock()
tokenStore.set((await api.login('linhao', 'secret123')).access_token)
const att = await api.recordAttendance(107, [3, 8])
check('考勤返回 attended / no_show / score_changes 三个字段', 
  Array.isArray(att.attended) && Array.isArray(att.no_show) && typeof att.score_changes === 'object',
  JSON.stringify(att))
check('未勾选的人被记为爽约', att.no_show.length > 0, `no_show=${JSON.stringify(att.no_show)}`)

// 只有发起人能拿到签到码
resetMock()
tokenStore.set('mock-token-8') // 高飞，不是 101 的发起人
const other = await api.getActivity(101, true)
check('非发起人拿不到 checkin_code（返回 null）', other.checkin_code === null, JSON.stringify(other.checkin_code))

// 活动已开始不能报名（先确保 me 没在这个活动里，否则会先撞上"已报名"的 409）
resetMock()
tokenStore.set((await api.login('linhao', 'secret123')).access_token)
const regs = db.registrations
for (let i = regs.length - 1; i >= 0; i--) {
  if (regs[i].activity_id === 109 && regs[i].user_id === ME_ID) regs.splice(i, 1)
}
await expectStatus('进行中的活动报名返回 400', () => api.joinActivity(109, ''), 400, '已开始')

/* ===================================================================== */
/* C. 页面渲染与事件契约                                                 */
/* ===================================================================== */

section('C. 页面渲染与 data-action 契约')

/**
 * 轻量 HTML 结构检查：标签配平 + 明显异常内容。
 * 不追求完整的 HTML 解析，只抓"少个 </div>"这种最致命的问题。
 */
const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'source', 'circle', 'path', 'use'])

function checkHtml(pageName, html, actions) {
  const problems = []

  if (/undefined/.test(html)) problems.push('输出里出现 "undefined"')
  if (/NaN/.test(html)) problems.push('输出里出现 "NaN"')
  if (/\[object Object\]/.test(html)) problems.push('输出里出现 "[object Object]"')

  // 标签配平（忽略自闭合与 void 元素）
  const stack = []
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g
  let m
  while ((m = re.exec(html))) {
    const [, closing, rawTag, attrs, selfClose] = m
    const tag = rawTag.toLowerCase()
    if (VOID_TAGS.has(tag) || selfClose === '/') continue
    if (!closing) {
      stack.push(tag)
    } else {
      const last = stack.pop()
      if (last !== tag) problems.push(`标签不配平：期望 </${last}>，实际 </${tag}>`)
    }
  }
  if (stack.length) problems.push(`标签未闭合：${stack.join(' > ')}`)

  // data-action 必须都有处理函数
  const used = new Set()
  for (const mm of html.matchAll(/data-action="([a-zA-Z0-9_-]+)"/g)) used.add(mm[1])
  const missing = [...used].filter((a) => typeof actions?.[a] !== 'function')
  if (missing.length) problems.push(`data-action 没有对应处理函数：${missing.join(', ')}`)

  if (problems.length) bad(`页面 ${pageName} 渲染检查`, problems.join('；'))
  else ok(`页面 ${pageName}`, `标签配平、无异常值、${used.size} 个 action 均有处理函数`)
}

/** 构造一个假的 action ctx。 */
function fakeCtx(el = { dataset: {}, closest: () => null }) {
  return {
    data: { ...(el.dataset ?? {}) },
    form: {},
    el,
    root: null,
    rerender: () => {},
  }
}

const pages = [
  { name: 'login', mod: '../frontend/src/pages/login.js', params: {} },
  { name: 'discover', mod: '../frontend/src/pages/discover.js', params: {} },
  { name: 'activities', mod: '../frontend/src/pages/activities.js', params: {} },
  { name: 'activity', mod: '../frontend/src/pages/activity.js', params: { id: '101' } },
  { name: 'activity-new', mod: '../frontend/src/pages/activity-new.js', params: {} },
  { name: 'activity-manage', mod: '../frontend/src/pages/activity-manage.js', params: { id: '101' } },
  { name: 'checkin', mod: '../frontend/src/pages/checkin.js', params: { id: '109' } },
  { name: 'review', mod: '../frontend/src/pages/review.js', params: { activityId: '107' } },
  { name: 'user', mod: '../frontend/src/pages/user.js', params: { id: '2' } },
  { name: 'manage', mod: '../frontend/src/pages/manage.js', params: {} },
  { name: 'me', mod: '../frontend/src/pages/me.js', params: {} },
]

// C-1 已登录状态
resetMock()
tokenStore.set((await api.login('linhao', 'secret123')).access_token)
setSession(await api.getMe())
store.sports = await api.getSports()

const rendered = {}
for (const p of pages) {
  try {
    const mod = await import(p.mod)
    const page = mod.create(p.params)
    if (typeof page.load === 'function') await page.load()
    const html = page.view()
    rendered[p.name] = { page, html }
    checkHtml(p.name, html, page.actions)
    if (typeof page.appBar === 'function') {
      const bar = page.appBar()
      if (/undefined|NaN/.test(bar)) bad(`页面 ${p.name} 顶栏`, '顶栏出现 undefined/NaN')
    }
  } catch (err) {
    bad(`页面 ${p.name}`, `渲染抛错：${err.message}\n${err.stack?.split('\n').slice(1, 3).join('\n')}`)
  }
}

// C-2 未登录状态（登录页守卫相关）
section('C-2 未登录时的页面（游客可浏览）')
setSession(null)
for (const name of ['discover', 'activities', 'me', 'activity', 'user']) {
  try {
    const p = pages.find((x) => x.name === name)
    const mod = await import(p.mod)
    const page = mod.create(p.params)
    if (typeof page.load === 'function') await page.load()
    checkHtml(`${name}（游客）`, page.view(), page.actions)
  } catch (err) {
    bad(`页面 ${name}（游客）`, `渲染抛错：${err.message}`)
  }
}

// C-3 逐个执行"纯本地"action，确认不会抛错
section('C-3 交互动作执行（本地状态类）')

const localActions = {
  login: [['mode', { value: 'register' }], ['mode', { value: 'login' }], ['pick-sport', { value: '篮球' }]],
  discover: [
    ['use-example', { text: '明早铜盘校区有跑步的吗' }],
    ['filter', { name: 'sport', value: '篮球' }],
    ['filter', { name: 'campus', value: '旗山校区' }],
    ['filter', { name: 'skill_level', value: 'beginner' }],
    ['clear-matches', {}],
  ],
  activities: [['filter', { name: 'status', value: '' }], ['filter', { name: 'date', value: 'today' }]],
  'activity-new': [
    ['dur', { min: '90' }],
    ['switch', { name: 'skill_level', value: 'beginner' }],
    ['switch', { name: 'gender_limit', value: 'female' }],
  ],
  'activity-manage': [['check-none', {}], ['check-all', {}]],
  manage: [['tab', { value: 'joined' }], ['tab', { value: 'organized' }]],
  me: [
    ['toggle-edit', {}],
    ['pick-sport', { value: '足球' }],
    ['switch', { name: 'skill_level', value: 'advanced' }],
    ['toggle-edit', {}],
  ],
  review: [['star', { user: '3', score: '5' }], ['tag', { user: '3', value: '准时' }]],
}

for (const [pageName, list] of Object.entries(localActions)) {
  const rec = rendered[pageName]
  if (!rec) {
    bad(`${pageName} 动作`, '页面未成功渲染，跳过')
    continue
  }
  for (const [action, data] of list) {
    try {
      const fn = rec.page.actions[action]
      if (typeof fn !== 'function') {
        bad(`${pageName}.${action}`, '没有这个 action')
        continue
      }
      await fn({
        data,
        form: {},
        el: { dataset: { ...data }, closest: () => null },
        rerender: () => {},
      })
      ok(`${pageName}.${action}()`)
    } catch (err) {
      bad(`${pageName}.${action}()`, `抛错：${err.message}`)
    }
  }
}

/* ===================================================================== */
/* D. 时区与格式化                                                       */
/* ===================================================================== */

section('D. 时区与格式化')

// 本机时区（实测为 China Standard Time = UTC+8）
const tzOffsetH = -new Date().getTimezoneOffset() / 60

const utc = '2026-10-12T06:14:07.169800'
const base = Date.UTC(2026, 9, 12, 6, 14, 7, 169)
const baseSec = Date.UTC(2026, 9, 12, 6, 14, 7) // 秒级串（无毫秒）
const d = fmt.parseServerTime(utc)
check(
  '不带时区的时间串按 UTC 解析',
  d && d.getTime() === base,
  `期望 ${base}，实际 ${d?.getTime()}`
)
check(
  '格式化后就是本地时间（本机 GMT+' + tzOffsetH + '）',
  fmt.fmtDateTime(utc) ===
    (() => {
      const l = new Date(base)
      const pad = (n) => String(n).padStart(2, '0')
      return `${l.getFullYear()}-${pad(l.getMonth() + 1)}-${pad(l.getDate())} ${pad(l.getHours())}:${pad(l.getMinutes())}`
    })(),
  `fmtDateTime 得到 ${fmt.fmtDateTime(utc)}`
)

// 关键回归：直接用 new Date(原始串) 会犯"少 8 小时"的经典 bug
const naive = new Date(utc)
if (tzOffsetH !== 0) {
  check(
    '确实避开了 new Date(原始串) 的时区偏差',
    naive.getTime() !== base,
    '如果这里相等，说明本机时区恰好是 UTC，该断言无意义'
  )
} else {
  ok('本机时区为 UTC，跳过偏差回归（无法体现差异）')
}

const withZ = fmt.parseServerTime('2026-10-12T06:14:07Z')
check('已经带 Z 的时间串不会被重复补 Z', withZ.getTime() === baseSec, `实际 ${withZ.getTime()}`)

const offset = fmt.parseServerTime('2026-10-12T14:14:07+08:00')
check(
  '带 +08:00 偏移的时间串解析成同一时刻',
  offset.getTime() === baseSec,
  `期望 ${baseSec}，实际 ${offset.getTime()}`
)

const offsetNoColon = fmt.parseServerTime('2026-10-12T14:14:07+0800')
check('带 +0800（无冒号）偏移也能识别', offsetNoColon.getTime() === baseSec, `实际 ${offsetNoColon.getTime()}`)

check(
  'localInputToUtc 把本地时间转成带 Z 的 UTC',
  fmt.localInputToUtc('2026-10-12T14:00').endsWith('Z'),
  fmt.localInputToUtc('2026-10-12T14:00')
)
check('feeText(0) = 免费', fmt.feeText(0) === '免费')
check('feeText(1500) = ¥15/人', fmt.feeText(1500) === '¥15/人', fmt.feeText(1500))
check('feeText(1550) = ¥15.50/人', fmt.feeText(1550) === '¥15.50/人', fmt.feeText(1550))
check('esc() 转义尖括号', fmt.esc('<b>x</b>') === '&lt;b&gt;x&lt;/b&gt;')
check('isLateCancelWindow 对 30 分钟后的活动为 true', fmt.isLateCancelWindow(new Date(Date.now() + 30 * 60000).toISOString()) === true)
check('isLateCancelWindow 对 5 小时后的活动为 false', fmt.isLateCancelWindow(new Date(Date.now() + 5 * 3600000).toISOString()) === false)
check('hasStarted 对过去时间为 true', fmt.hasStarted(new Date(Date.now() - 1000).toISOString()) === true)

/* ===================================================================== */
/* E. 一句话解析（与后端 /match/parse 对齐的规则抽取）                    */
/* ===================================================================== */

section('E. 一句话找局解析')

const cases = [
  ['今晚想在旗山校区打篮球，新手可以吗', { sport: '篮球', campus: '旗山校区', skill_level: 'beginner' }],
  ['明早铜盘校区有跑步的吗', { sport: '跑步', campus: '铜盘校区' }],
  ['这周末羽毛球，水平一般', { sport: '羽毛球', skill_level: 'intermediate' }],
  ['想找人打乒乓球', { sport: '乒乓球' }],
]
for (const [sentence, expect] of cases) {
  const got = parseSentence(sentence)
  const good = Object.entries(expect).every(([k, v]) => got[k] === v)
  check(`解析「${sentence}」`, good, `得到 ${JSON.stringify(got)}`)
}

const matchRes = await api.matchBySentence('今晚想在旗山校区打篮球，新手可以吗')
check('匹配结果含 query / count / items', 
  'query' in matchRes && 'count' in matchRes && Array.isArray(matchRes.items),
  JSON.stringify(Object.keys(matchRes)))
if (matchRes.items[0]) {
  const it = matchRes.items[0]
  check('结果项含 activity / score / reason', 
    it.activity && typeof it.score === 'number' && it.reason,
    JSON.stringify(Object.keys(it)))
  check('reason 含可渲染的推荐理由字段',
    ['sport', 'time', 'skill', 'campus', 'distance_km', 'slots_left'].every((k) => k in it.reason),
    JSON.stringify(it.reason))
  check('匹配结果按分数降序', matchRes.items.every((x, i, arr) => i === 0 || arr[i - 1].score >= x.score))
  check('已满员活动不出现在匹配结果里', matchRes.items.every((x) => x.activity.slots_left > 0))
}

/* ===================================================================== */
/* 汇总                                                                  */
/* ===================================================================== */

console.log(`\n${'─'.repeat(64)}`)
if (fail === 0) {
  console.log(`\x1b[32m\x1b[1m全部通过：${pass} 项检查\x1b[0m`)
} else {
  console.log(`\x1b[31m\x1b[1m${fail} 项失败\x1b[0m / 共 ${pass + fail} 项\n`)
  for (const f of failures) console.log(`  \x1b[31m·\x1b[0m ${f.name}\n    ${f.detail}`)
}
process.exit(fail === 0 ? 0 : 1)
