/**
 * 给 Issue #8「活动详情」造演示数据（真实后端）
 * ---------------------------------------------------------------------------
 * 造 3 个用户、4 个活动：
 *   · A_open     羽毛球（可报名 + 参与者列表，供普通参与者视图）
 *   · B_finish   跑步（报名 → 签到 → 考勤 → 已结束：参与者出现 已到场 / 爽约 两种状态）
 *   · C_cancel   网球（发起人取消 → 已取消视图）
 *   · D_ongoing  篮球（2 分钟后开始 → 进行中视图）
 *
 * 用法：node tools/seed8.mjs   （前提：后端 127.0.0.1:8000 已起；数据库为空）
 * 输出：tools/seed8.json（ids / tokens / checkin_code，供 shot7.mjs --token 复用）
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
  { username: 'org8', password: 'sportmate123', nickname: '组织者8', campus: '旗山校区', skill_level: 'any', favorite_sports: ['羽毛球'] },
  { username: 'mem8', password: 'sportmate123', nickname: '参与者8', campus: '旗山校区', skill_level: 'any', favorite_sports: ['跑步'] },
  { username: 'mem9', password: 'sportmate123', nickname: '参与者9', campus: '旗山校区', skill_level: 'any', favorite_sports: ['篮球'] },
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

const mk = async (payload) => call('/activities', { method: 'POST', token: tokens.org8, body: payload })

const A_open = await mk({
  title: '周五晚羽毛球双打 · 旗山馆',
  sport: '羽毛球', campus: '旗山校区', location: '旗山校区体育馆 3 号场',
  start_time: iso(26 * 60), end_time: iso(28 * 60), skill_level: 'any', capacity: 8, fee: 0,
})
const B_finish = await mk({
  title: '今晚环校夜跑 5 公里',
  sport: '跑步', campus: '旗山校区', location: '旗山校区东操场',
  start_time: iso(5), end_time: iso(65), skill_level: 'any', capacity: 4, fee: 0,
})
const C_cancel = await mk({
  title: '周六网球对拉 · 铜盘',
  sport: '网球', campus: '铜盘校区', location: '铜盘校区网球场',
  start_time: iso(30 * 60), end_time: iso(32 * 60), skill_level: 'any', capacity: 4, fee: 0,
})
const D_ongoing = await mk({
  title: '两分钟后篮球半场 3v3',
  sport: '篮球', campus: '铜盘校区', location: '铜盘校区篮球场',
  start_time: iso(2), end_time: iso(92), skill_level: 'any', capacity: 8, fee: 0,
})
console.log(`A_open=${A_open.id} B_finish=${B_finish.id} C_cancel=${C_cancel.id} D_ongoing=${D_ongoing.id}`)

// A_open：mem8 报名 → 参与者列表有 1 人
await call(`/activities/${A_open.id}/join`, { method: 'POST', token: tokens.mem8, body: { note: '第一次来' } })

// B_finish：mem8、mem9 报名；mem8 签到；考勤勾选 mem8 → mem9 爽约 → 活动已结束
await call(`/activities/${B_finish.id}/join`, { method: 'POST', token: tokens.mem8, body: {} })
await call(`/activities/${B_finish.id}/join`, { method: 'POST', token: tokens.mem9, body: {} })
const bOrg = await call(`/activities/${B_finish.id}`, { token: tokens.org8 })
const code = bOrg.checkin_code
await call(`/activities/${B_finish.id}/checkin`, { method: 'POST', token: tokens.mem8, body: { code } })
const att = await call(`/activities/${B_finish.id}/attendance`, { method: 'POST', token: tokens.org8, body: [ids.mem8] })
console.log(`B_finish 考勤: ${JSON.stringify(att.score_changes)}`)
const bAfter = await call(`/activities/${B_finish.id}`, { token: tokens.org8 })
console.log(`B_finish 状态: ${bAfter.status}，参与者: ${bAfter.participants.map((p) => p.nickname + ':' + p.status).join(' / ')}`)

// C_cancel：发起人取消
await call(`/activities/${C_cancel.id}/cancel`, { method: 'POST', token: tokens.org8 })
const cAfter = await call(`/activities/${C_cancel.id}`)
console.log(`C_cancel 状态: ${cAfter.status}`)

// 关键证据：A_open 上 mem8 取消报名后，真实后端的 participants 仍保留 cancelled 记录（前端已过滤）
await call(`/activities/${A_open.id}/join`, { method: 'DELETE', token: tokens.mem8 })
const aAfter = await call(`/activities/${A_open.id}`)
console.log(`A_open 取消后 participants: ${JSON.stringify(aAfter.participants.map((p) => ({ n: p.nickname, s: p.status })))}，joined_count=${aAfter.joined_count}`)
// 再报名回来，保持截图数据完整
await call(`/activities/${A_open.id}/join`, { method: 'POST', token: tokens.mem8, body: { note: '第一次来' } })

const { writeFileSync } = await import('node:fs')
writeFileSync(
  new URL('./seed8.json', import.meta.url),
  JSON.stringify({ ids, tokens, code, activities: { A_open: A_open.id, B_finish: B_finish.id, C_cancel: C_cancel.id, D_ongoing: D_ongoing.id } }, null, 2)
)
console.log('已写入 tools/seed8.json')
