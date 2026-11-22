/**
 * 给本地后端造一份能验证个人主页（Issue #5）的数据
 * ---------------------------------------------------------------------------
 * 造 4 个用户、3 场活动、4 条评价，跑完「报名 → 签到 → 考勤 → 评价」整条链路，
 * 让主页上的昵称、信用分、完成次数、爽约次数、评价均分都有真实来源。
 *
 * 跑完会打印 /me、/users/{id}、评价列表，并把 ids / tokens 写进 ./seed5.json，
 * 供截图脚本（shot5.mjs）复用。
 *
 * 用法：node tools/seed-demo.mjs
 *   前提：后端在 127.0.0.1:8000，且数据库为空
 *         （要重跑先删 src/backend/data/sportmate.db）
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
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  return data
}

function iso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString()
}

const users = [
  { username: 'linzj', password: 'sportmate123', nickname: '林子均', campus: '旗山校区', skill_level: 'intermediate', favorite_sports: ['羽毛球', '跑步'] },
  { username: 'chenyu', password: 'sportmate123', nickname: '陈宇豪', campus: '旗山校区', skill_level: 'beginner', favorite_sports: ['篮球'] },
  { username: 'liyutong', password: 'sportmate123', nickname: '李雨桐', campus: '旗山校区', skill_level: 'intermediate', favorite_sports: ['羽毛球'] },
  { username: 'wanghz', password: 'sportmate123', nickname: '王浩哲', campus: '旗山校区', skill_level: 'advanced', favorite_sports: ['篮球', '健身'] },
]

const tokens = {}
const ids = {}

for (const u of users) {
  const tok = await call('/auth/register', { method: 'POST', body: u })
  tokens[u.username] = tok.access_token
  ids[u.username] = (await call('/me', { token: tok.access_token })).id
  console.log(`已注册 ${u.username} -> id ${ids[u.username]}`)
}

async function createActivity(organizer, payload) {
  const act = await call('/activities', { method: 'POST', token: tokens[organizer], body: payload })
  const detail = await call(`/activities/${act.id}`, { token: tokens[organizer] })
  return { id: act.id, code: detail.checkin_code }
}

async function join(username, activityId, note = '') {
  await call(`/activities/${activityId}/join`, { method: 'POST', token: tokens[username], body: { note } })
}

async function checkin(username, activityId, code) {
  await call(`/activities/${activityId}/checkin`, { method: 'POST', token: tokens[username], body: { code } })
}

async function attendance(organizer, activityId, attendedIds) {
  return call(`/activities/${activityId}/attendance`, { method: 'POST', token: tokens[organizer], body: attendedIds })
}

async function review(reviewer, activityId, reviewee, score, tags, comment) {
  await call(`/activities/${activityId}/reviews`, {
    method: 'POST',
    token: tokens[reviewer],
    body: { reviewee_id: reviewee, score, tags, comment },
  })
}

/* Activity 1: 周五夜跑 — 林子均 到场，王浩哲 爽约 */
const a1 = await createActivity('chenyu', {
  title: '周五夜跑 · 旗山操场 5 公里',
  sport: '跑步',
  description: '轻松配速 6:30，跑完一起拉伸。',
  campus: '旗山校区',
  location: '旗山校区东操场',
  start_time: iso(20),
  end_time: iso(100),
  skill_level: 'any',
  capacity: 8,
  fee: 0,
})
for (const u of ['linzj', 'liyutong', 'wanghz']) await join(u, a1.id)
await checkin('linzj', a1.id, a1.code)
await checkin('liyutong', a1.id, a1.code)
const att1 = await attendance('chenyu', a1.id, [ids.linzj, ids.liyutong])
console.log('活动1 考勤完成：', a1.id, att1)

await review('chenyu', a1.id, ids.linzj, 5, ['准时', '配速稳'], '全程没掉队，还帮大家看包。')
await review('liyutong', a1.id, ids.linzj, 5, ['好相处'], '跑完一起拉伸，聊得很开心。')

/* Activity 2: 羽毛球 — 林子均 爽约 */
const a2 = await createActivity('liyutong', {
  title: '周三晚羽毛球双打',
  sport: '羽毛球',
  description: '旗山体育馆 3 号场，双打轮换。',
  campus: '旗山校区',
  location: '旗山校区体育馆 3 号场',
  start_time: iso(25),
  end_time: iso(115),
  skill_level: 'any',
  capacity: 4,
  fee: 500,
})
for (const u of ['linzj', 'chenyu']) await join(u, a2.id)
await checkin('chenyu', a2.id, a2.code)
const att2 = await attendance('liyutong', a2.id, [ids.chenyu])
console.log('活动2 考勤完成：', a2.id, att2)

/* Activity 3: 篮球 3v3 — 林子均 到场，收到两条 4 星评价 */
const a3 = await createActivity('wanghz', {
  title: '周六下午篮球 3v3',
  sport: '篮球',
  description: '半场 3v3，输的队下场，打两小时。',
  campus: '旗山校区',
  location: '旗山校区篮球场',
  start_time: iso(30),
  end_time: iso(150),
  skill_level: 'any',
  capacity: 6,
  fee: 0,
})
for (const u of ['linzj', 'chenyu', 'liyutong']) await join(u, a3.id)
for (const u of ['linzj', 'chenyu', 'liyutong']) await checkin(u, a3.id, a3.code)
const att3 = await attendance('wanghz', a3.id, [ids.linzj, ids.chenyu, ids.liyutong])
console.log('活动3 考勤完成：', a3.id, att3)

await review('wanghz', a3.id, ids.linzj, 4, ['防守积极'], '防守很拼，投篮再稳一点就完美了。')
await review('chenyu', a3.id, ids.linzj, 4, ['团队型'], '传球意识好，下次还一起打。')

const me = await call('/me', { token: tokens.linzj })
console.log('\n--- 林子均 /me ---')
console.log(JSON.stringify(me, null, 2))

const target = await call(`/users/${ids.linzj}`)
console.log('\n--- 林子均 公开主页 ---')
console.log(JSON.stringify(target, null, 2))
console.log('\n--- 收到的评价 ---')
console.log(JSON.stringify(await call(`/users/${ids.linzj}/reviews`), null, 2))

const { writeFileSync } = await import('node:fs')
writeFileSync(new URL('./seed5.json', import.meta.url), JSON.stringify({ ids, tokens }, null, 2))
console.log('\n已写入 tools/seed5.json')
