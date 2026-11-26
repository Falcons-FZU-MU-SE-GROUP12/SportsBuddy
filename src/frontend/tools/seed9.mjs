/**
 * 给 Issue #9「报名 / 取消报名」造演示数据（真实后端）
 * ---------------------------------------------------------------------------
 * 造 6 个用户、4 个演示活动 + 3 场"垫分"活动：
 *   · A_join  羽毛球（可报名，供报名/取消流程演示）
 *   · B_full  乒乓球（已满员，供 409 满员演示）
 *   · C_soon  篮球（90 分钟后开始，供"临期取消扣 2 分"二次确认演示）
 *   · D_free  跑步（供低信用分 403 演示）
 *   · E1-E3   让 low9 连爽约 3 次，信用分 80 → 50（<60），复现"信用分不足"
 *
 * 用法：node tools/seed9.mjs   （前提：后端 127.0.0.1:8000 已起；数据库为空）
 * 输出：tools/seed9.json（ids / tokens，供 shot7.mjs --token 复用）
 */

const BASE = 'http://127.0.0.1:8000'

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function iso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString()
}

const users = [
  { username: 'org9', password: 'sportmate123', nickname: '组织者9', campus: '旗山校区', skill_level: 'any', favorite_sports: ['羽毛球'] },
  { username: 'join9', password: 'sportmate123', nickname: '报名者9', campus: '旗山校区', skill_level: 'any', favorite_sports: ['篮球'] },
  { username: 'low9', password: 'sportmate123', nickname: '低分9', campus: '旗山校区', skill_level: 'any', favorite_sports: ['跑步'] },
  { username: 'reg2', password: 'sportmate123', nickname: '占位A', campus: '旗山校区', skill_level: 'beginner', favorite_sports: [] },
  { username: 'reg3', password: 'sportmate123', nickname: '占位B', campus: '旗山校区', skill_level: 'beginner', favorite_sports: [] },
  { username: 'reg4', password: 'sportmate123', nickname: '占位C', campus: '旗山校区', skill_level: 'beginner', favorite_sports: [] },
]

const tokens = {}
const ids = {}
for (const u of users) {
  try {
    tokens[u.username] = (await call('/auth/register', { method: 'POST', body: u })).access_token
  } catch {
    tokens[u.username] = (await call('/auth/login', { method: 'POST', body: { username: u.username, password: u.password } })).access_token
  }
  ids[u.username] = (await call('/me', { token: tokens[u.username] })).id
  console.log(`user ${u.username} -> ${ids[u.username]}`)
}

async function createActivity(organizer, payload) {
  return call('/activities', { method: 'POST', token: tokens[organizer], body: payload })
}

/* 演示活动 */
const A_join = await createActivity('org9', {
  title: '周三晚羽毛球双打 · 旗山馆',
  sport: '羽毛球',
  campus: '旗山校区',
  location: '旗山校区体育馆 3 号场',
  start_time: iso(26 * 60),
  end_time: iso(28 * 60),
  skill_level: 'any',
  capacity: 6,
  fee: 0,
})
const B_full = await createActivity('org9', {
  title: '周末乒乓球新手切磋',
  sport: '乒乓球',
  campus: '旗山校区',
  location: '旗山校区活动中心',
  start_time: iso(30 * 60),
  end_time: iso(32 * 60),
  skill_level: 'beginner',
  capacity: 2,
  fee: 0,
})
const C_soon = await createActivity('org9', {
  title: '今晚篮球半场 3v3',
  sport: '篮球',
  campus: '铜盘校区',
  location: '铜盘校区篮球场',
  start_time: iso(90),
  end_time: iso(90 + 120),
  skill_level: 'any',
  capacity: 8,
  fee: 0,
})
const D_free = await createActivity('org9', {
  title: '明早晨跑 5 公里',
  sport: '跑步',
  campus: '旗山校区',
  location: '旗山校区东操场',
  start_time: iso(20 * 60),
  end_time: iso(21 * 60),
  skill_level: 'any',
  capacity: 8,
  fee: 0,
})
console.log(`A_join=${A_join.id} B_full=${B_full.id} C_soon=${C_soon.id} D_free=${D_free.id}`)

/* B_full 满员：reg2、reg3 报名（容量 2） */
await call(`/activities/${B_full.id}/join`, { method: 'POST', token: tokens.reg2, body: { note: '' } })
await call(`/activities/${B_full.id}/join`, { method: 'POST', token: tokens.reg3, body: { note: '' } })
const fullDetail = await call(`/activities/${B_full.id}`)
console.log(`B_full slots_left = ${fullDetail.slots_left}`)

/* low9 连爽约 3 场 → 80 - 30 = 50 */
for (let i = 1; i <= 3; i++) {
  const e = await createActivity('org9', {
    title: `垫分活动 ${i}`,
    sport: '跑步',
    campus: '旗山校区',
    location: '旗山校区东操场',
    start_time: iso(30),
    end_time: iso(90),
    skill_level: 'any',
    capacity: 3,
    fee: 0,
  })
  await call(`/activities/${e.id}/join`, { method: 'POST', token: tokens.low9, body: { note: '' } })
  const att = await call(`/activities/${e.id}/attendance`, { method: 'POST', token: tokens.org9, body: [] })
  console.log(`垫分 ${i}: low9 no_show -> score_change ${JSON.stringify(att.score_changes)}`)
}
const lowMe = await call('/me', { token: tokens.low9 })
console.log(`low9 reliability_score = ${lowMe.reliability_score}`)

const { writeFileSync } = await import('node:fs')
writeFileSync(new URL('./seed9.json', import.meta.url), JSON.stringify({ ids, tokens, activities: { A_join: A_join.id, B_full: B_full.id, C_soon: C_soon.id, D_free: D_free.id } }, null, 2))
console.log('已写入 tools/seed9.json')
